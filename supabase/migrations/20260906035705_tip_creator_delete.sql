-- Tip creators and administrators may delete, hide, or restore a tip.
create or replace function public.rn_guard_tip_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'DELETE' then
      if old.created_by is distinct from auth.uid()
         and not exists (select 1 from public.rn_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only the creator or administrators can delete tips' using errcode = '42501';
      end if;
    else
      if new.is_deleted is distinct from old.is_deleted
         and old.created_by is distinct from auth.uid()
         and not exists (select 1 from public.rn_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only the creator or administrators can hide or restore tips' using errcode = '42501';
      end if;
      new.created_by := old.created_by;
      new.updated_by := auth.uid();
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop policy if exists rn_delete_tips_for_admin on public.rn_route_tips;
drop policy if exists rn_delete_tips_for_owner_or_admin on public.rn_route_tips;
create policy rn_delete_tips_for_owner_or_admin on public.rn_route_tips
for delete to authenticated using (
  created_by = (select auth.uid()) or exists (
    select 1 from public.rn_profiles where id = (select auth.uid()) and role = 'admin'
  )
);
