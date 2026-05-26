create table if not exists public.rn_tip_comments (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null references public.rn_route_tips(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 500),
  created_by uuid not null references public.rn_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists rn_tip_comments_tip_idx
  on public.rn_tip_comments (tip_id, created_at);

alter table public.rn_tip_comments enable row level security;

drop policy if exists "rn_read_comments_for_auth" on public.rn_tip_comments;
create policy "rn_read_comments_for_auth" on public.rn_tip_comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "rn_insert_own_comments" on public.rn_tip_comments;
create policy "rn_insert_own_comments" on public.rn_tip_comments
  for insert with check (auth.uid() = created_by);

drop policy if exists "rn_update_own_comment" on public.rn_tip_comments;
create policy "rn_update_own_comment" on public.rn_tip_comments
  for update using (auth.uid() = created_by or public.rn_is_admin(auth.uid()))
  with check (auth.uid() = created_by or public.rn_is_admin(auth.uid()));

create table if not exists public.rn_tip_likes (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null references public.rn_route_tips(id) on delete cascade,
  created_by uuid not null references public.rn_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tip_id, created_by)
);

create index if not exists rn_tip_likes_tip_idx
  on public.rn_tip_likes (tip_id);

alter table public.rn_tip_likes enable row level security;

drop policy if exists "rn_read_likes_for_auth" on public.rn_tip_likes;
create policy "rn_read_likes_for_auth" on public.rn_tip_likes
  for select using (auth.role() = 'authenticated');

drop policy if exists "rn_insert_own_likes" on public.rn_tip_likes;
create policy "rn_insert_own_likes" on public.rn_tip_likes
  for insert with check (auth.uid() = created_by);

drop policy if exists "rn_delete_own_likes" on public.rn_tip_likes;
create policy "rn_delete_own_likes" on public.rn_tip_likes
  for delete using (auth.uid() = created_by);

create table if not exists public.rn_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.rn_profiles(id) on delete cascade,
  sender_id uuid references public.rn_profiles(id) on delete set null,
  type text not null check (type in ('mention', 'location_share_request', 'location_share_accepted')),
  tip_id uuid references public.rn_route_tips(id) on delete cascade,
  comment_id uuid references public.rn_tip_comments(id) on delete set null,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists rn_notifications_recipient_idx
  on public.rn_notifications (recipient_id, is_read, created_at desc);

alter table public.rn_notifications enable row level security;

drop policy if exists "rn_read_own_notifications" on public.rn_notifications;
create policy "rn_read_own_notifications" on public.rn_notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists "rn_insert_notifications_for_auth" on public.rn_notifications;
create policy "rn_insert_notifications_for_auth" on public.rn_notifications
  for insert with check (auth.uid() = sender_id and recipient_id <> sender_id);

drop policy if exists "rn_update_own_notifications" on public.rn_notifications;
create policy "rn_update_own_notifications" on public.rn_notifications
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

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
  for insert with check (auth.uid() = requester_id and requester_id <> recipient_id and status = 'pending');

drop policy if exists "rn_update_own_location_share_requests" on public.rn_location_share_requests;
create policy "rn_update_own_location_share_requests" on public.rn_location_share_requests
  for update using (auth.uid() = requester_id or auth.uid() = recipient_id)
  with check (
    (auth.uid() = requester_id and status in ('canceled', 'ended'))
    or (auth.uid() = recipient_id and status in ('accepted', 'declined', 'ended'))
  );

revoke all on public.rn_tip_comments from anon, authenticated;
revoke all on public.rn_tip_likes from anon, authenticated;
revoke all on public.rn_notifications from anon, authenticated;
revoke all on public.rn_location_share_requests from anon, authenticated;

grant select, insert, update on public.rn_tip_comments to authenticated;
grant select, insert, delete on public.rn_tip_likes to authenticated;
grant select, insert, update on public.rn_notifications to authenticated;
grant select, insert, update on public.rn_location_share_requests to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rn_tip_comments;
  exception when others then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.rn_notifications;
  exception when others then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.rn_location_share_requests;
  exception when others then
    null;
  end;
end $$;
