-- Preserve shared editing while enforcing ownership and administrator boundaries.
-- Separate guards survive the older zone-creator migration being replayed.
create or replace function public.rn_guard_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.id is distinct from auth.uid() or new.role is distinct from 'member' then
        raise exception 'Profiles can only be created for the current member' using errcode = '42501';
      end if;
    elsif new.id is distinct from old.id or new.role is distinct from old.role then
      raise exception 'Profile identity and role cannot be changed by a client' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rn_profiles_guard_role on public.rn_profiles;
create trigger rn_profiles_guard_role before insert or update on public.rn_profiles
for each row execute function public.rn_guard_profile_role();

drop policy if exists rn_write_profiles_for_auth on public.rn_profiles;
drop policy if exists rn_insert_own_profile on public.rn_profiles;
drop policy if exists rn_update_own_profile on public.rn_profiles;
create policy rn_insert_own_profile on public.rn_profiles
for insert to authenticated with check (id = (select auth.uid()) and role = 'member');
create policy rn_update_own_profile on public.rn_profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.rn_guard_zone_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'DELETE' then
      if old.created_by is distinct from auth.uid() then
        raise exception 'Only the zone creator can delete this zone' using errcode = '42501';
      end if;
    elsif new.is_deleted is distinct from old.is_deleted and old.created_by is distinct from auth.uid() then
      raise exception 'Only the zone creator can hide or restore this zone' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rn_route_zones_guard_deletion on public.rn_route_zones;
create trigger rn_route_zones_guard_deletion before update or delete on public.rn_route_zones
for each row execute function public.rn_guard_zone_deletion();

create or replace function public.rn_guard_tip_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.rn_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only administrators can delete tips' using errcode = '42501';
      end if;
    else
      if new.is_deleted is distinct from old.is_deleted
         and not exists (select 1 from public.rn_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only administrators can hide or restore tips' using errcode = '42501';
      end if;
      new.created_by := old.created_by;
      new.updated_by := auth.uid();
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rn_route_tips_guard_writes on public.rn_route_tips;
create trigger rn_route_tips_guard_writes before update or delete on public.rn_route_tips
for each row execute function public.rn_guard_tip_writes();

drop policy if exists rn_write_tips_for_auth on public.rn_route_tips;
drop policy if exists rn_insert_tips_for_auth on public.rn_route_tips;
drop policy if exists rn_update_tips_for_auth on public.rn_route_tips;
drop policy if exists rn_delete_tips_for_admin on public.rn_route_tips;
create policy rn_insert_tips_for_auth on public.rn_route_tips
for insert to authenticated with check (created_by = (select auth.uid()) and is_deleted is not true);
create policy rn_update_tips_for_auth on public.rn_route_tips
for update to authenticated using (true) with check (true);
create policy rn_delete_tips_for_admin on public.rn_route_tips
for delete to authenticated using (exists (
  select 1 from public.rn_profiles where id = (select auth.uid()) and role = 'admin'
));
