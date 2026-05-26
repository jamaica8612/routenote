create table if not exists public.rn_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.rn_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rn_push_subscriptions_user_idx
  on public.rn_push_subscriptions (user_id, updated_at desc);

alter table public.rn_push_subscriptions enable row level security;

drop policy if exists "rn_push_subscriptions_select_own" on public.rn_push_subscriptions;
create policy "rn_push_subscriptions_select_own" on public.rn_push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "rn_push_subscriptions_insert_own" on public.rn_push_subscriptions;
create policy "rn_push_subscriptions_insert_own" on public.rn_push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "rn_push_subscriptions_update_own" on public.rn_push_subscriptions;
create policy "rn_push_subscriptions_update_own" on public.rn_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "rn_push_subscriptions_delete_own" on public.rn_push_subscriptions;
create policy "rn_push_subscriptions_delete_own" on public.rn_push_subscriptions
  for delete using (auth.uid() = user_id);

revoke all on public.rn_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.rn_push_subscriptions to authenticated;
