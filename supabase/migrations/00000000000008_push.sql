-- Phase 2 (deferred surface): the push-notification data layer.
--
-- This is only the *data layer* + frequency-cap substrate. The actual sender
-- (APNs/FCM via Expo) needs provider credentials and is wired up separately;
-- nothing here sends anything. All additive.

-- ---------------------------------------------------------------------------
-- device_tokens: one row per (device) push token, owned by a user.
-- ---------------------------------------------------------------------------

create table public.device_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_id_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- The owner manages their own tokens (register/unregister from the app). The
-- service role (sender) reads across users and bypasses RLS.
create policy "device_tokens: owner full access"
  on public.device_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notification_sends: append-only log of what we sent, for frequency caps.
-- Written by the service role (the sender); the owner may read their own.
-- ---------------------------------------------------------------------------

create table public.notification_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

create index notification_sends_user_sent_idx
  on public.notification_sends (user_id, sent_at desc);

alter table public.notification_sends enable row level security;

create policy "notification_sends: owner can read"
  on public.notification_sends for select
  using (user_id = auth.uid());
