-- Allow every authenticated member to create zones and only the creator to delete.
-- Zone editing remains shared, while created_by is immutable after insert.

create or replace function public.rn_preserve_zone_creator()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists rn_route_zones_preserve_creator on public.rn_route_zones;
create trigger rn_route_zones_preserve_creator
  before update on public.rn_route_zones
  for each row
  execute function public.rn_preserve_zone_creator();

drop policy if exists "rn_write_zones_for_auth" on public.rn_route_zones;
drop policy if exists "rn_insert_zones_for_auth" on public.rn_route_zones;
drop policy if exists "rn_update_zones_for_auth" on public.rn_route_zones;
drop policy if exists "rn_delete_own_zones" on public.rn_route_zones;

create policy "rn_insert_zones_for_auth" on public.rn_route_zones
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "rn_update_zones_for_auth" on public.rn_route_zones
  for update to authenticated
  using (true)
  with check (true);

create policy "rn_delete_own_zones" on public.rn_route_zones
  for delete to authenticated
  using ((select auth.uid()) = created_by);
