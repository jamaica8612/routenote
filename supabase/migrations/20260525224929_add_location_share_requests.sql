create table if not exists public.rn_location_share_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.rn_profiles(id) on delete cascade,
  recipient_id uuid not null references public.rn_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'ended', 'canceled')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '8 hours'),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create index if not exists rn_location_share_requests_requester_idx
  on public.rn_location_share_requests (requester_id, status, updated_at desc);

create index if not exists rn_location_share_requests_recipient_idx
  on public.rn_location_share_requests (recipient_id, status, updated_at desc);

alter table public.rn_location_share_requests enable row level security;

drop policy if exists "rn_read_own_location_share_requests" on public.rn_location_share_requests;
create policy "rn_read_own_location_share_requests" on public.rn_location_share_requests
  for select using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "rn_insert_own_location_share_requests" on public.rn_location_share_requests;
create policy "rn_insert_own_location_share_requests" on public.rn_location_share_requests
  for insert with check (auth.uid() = requester_id and requester_id <> recipient_id);

drop policy if exists "rn_update_own_location_share_requests" on public.rn_location_share_requests;
create policy "rn_update_own_location_share_requests" on public.rn_location_share_requests
  for update using (auth.uid() = requester_id or auth.uid() = recipient_id)
  with check (auth.uid() = requester_id or auth.uid() = recipient_id);

grant select, insert, update on public.rn_location_share_requests to authenticated;

alter table public.rn_notifications drop constraint if exists rn_notifications_type_check;
alter table public.rn_notifications add constraint rn_notifications_type_check
  check (type in ('mention', 'location_share_request', 'location_share_accepted'));

do $$
begin
  alter publication supabase_realtime add table public.rn_location_share_requests;
exception when others then
  null;
end $$;
