begin;
do $$
declare
  member_ids uuid[];
  owner_id uuid;
  other_id uuid;
  admin_id uuid;
  zone_id uuid := gen_random_uuid();
  tip_id uuid := gen_random_uuid();
  affected integer;
begin
  select array_agg(id order by id) into member_ids from public.rn_profiles where role = 'member';
  owner_id := member_ids[1];
  other_id := member_ids[2];
  select id into admin_id from public.rn_profiles where role = 'admin' limit 1;
  if owner_id is null or other_id is null or admin_id is null then
    raise exception 'Permission test requires two existing members and an administrator';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.rn_route_zones(id,name,polygon,created_by)
  values(zone_id,'Permission test - rolled back','{"type":"Polygon","coordinates":[[[129,35],[129.001,35],[129,35.001],[129,35]]]}'::jsonb,owner_id);
  insert into public.rn_route_tips(id,zone_id,title,marker_type,lat,lng,created_by)
  values(tip_id,zone_id,'Permission test - rolled back','important',35,129,owner_id);
  begin
    update public.rn_profiles set role='admin' where id=owner_id;
    raise exception 'FAIL: member changed their own role';
  exception when insufficient_privilege then null;
  end;
  update public.rn_profiles set name=name where id=other_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: member edited another profile'; end if;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',other_id,'role','authenticated')::text, true);
  update public.rn_route_zones set name='Shared edit works' where id=zone_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: shared zone edit denied'; end if;
  begin
    update public.rn_route_zones set is_deleted=true where id=zone_id;
    raise exception 'FAIL: nonowner hid a zone';
  exception when insufficient_privilege then null;
  end;
  delete from public.rn_route_zones where id=zone_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: nonowner deleted a zone'; end if;
  update public.rn_route_tips set memo='Shared edit works',created_by=other_id where id=tip_id;
  if (select created_by from public.rn_route_tips where id=tip_id) is distinct from owner_id then
    raise exception 'FAIL: tip ownership changed';
  end if;
  begin
    update public.rn_route_tips set is_deleted=true where id=tip_id;
    raise exception 'FAIL: nonowner hid a tip';
  exception when insufficient_privilege then null;
  end;
  delete from public.rn_route_tips where id=tip_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: nonowner deleted a tip'; end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',admin_id,'role','authenticated')::text, true);
  begin
    update public.rn_route_zones set is_deleted=true where id=zone_id;
    raise exception 'FAIL: admin hid another creators zone';
  exception when insufficient_privilege then null;
  end;
  update public.rn_route_tips set is_deleted=true where id=tip_id;
  if not (select is_deleted from public.rn_route_tips where id=tip_id) then
    raise exception 'FAIL: admin tip hide denied';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text, true);
  update public.rn_route_tips set is_deleted=false where id=tip_id;
  update public.rn_route_tips set is_deleted=true where id=tip_id;
  if not (select is_deleted from public.rn_route_tips where id=tip_id) then
    raise exception 'FAIL: owner tip hide denied';
  end if;
  delete from public.rn_route_tips where id=tip_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner tip delete denied'; end if;
  update public.rn_route_zones set is_deleted=true where id=zone_id;
  delete from public.rn_route_zones where id=zone_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner zone delete denied'; end if;
  reset role;
end;
$$;
rollback;
select 'PASS: profile role protection, own-profile updates, shared editing, immutable tip creator, zone owner-only and tip owner-or-admin deletion; all fixtures rolled back' as permission_tests;
