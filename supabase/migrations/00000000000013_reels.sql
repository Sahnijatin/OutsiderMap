-- Outsider pivot, part 3: reels.
--
-- A completed quest's captured media becomes a vertical video watermarked
-- with the member's own badge (@username #0042) - never company branding.
-- reel_jobs is the render queue (service-role writes only); reels holds the
-- output plus curated uploads, gated by moderation before anything is
-- visible to other members.

create table public.reel_jobs (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  template text not null default 'classic',
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reel_jobs_status_idx on public.reel_jobs (status, updated_at);
create unique index reel_jobs_quest_idx on public.reel_jobs (quest_id);

alter table public.reel_jobs enable row level security;

-- Owners can watch their job; every write path is the service role.
create policy "reel_jobs: owner can read"
  on public.reel_jobs for select
  using (user_id = auth.uid() or public.is_admin());

create table public.reels (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'user_quest'
    check (source in ('curated', 'user_quest')),
  user_id uuid references public.profiles(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  place_id uuid references public.places(id) on delete set null,
  city text not null default 'delhi' references public.cities(slug),
  video_path text not null,
  poster_path text,
  caption text,
  duration_seconds numeric,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index reels_feed_idx on public.reels (city, status, created_at desc);
create index reels_user_idx on public.reels (user_id, created_at desc);

alter table public.reels enable row level security;

-- The feed shows approved reels to any member; owners always see their own;
-- admins see everything. Writes: service role (pipeline) + admin (curation).
create policy "reels: approved readable by members, own always"
  on public.reels for select
  using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_admin()
  );

create policy "reels: admin can write"
  on public.reels for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- reel-media: public-read output bucket (CDN-served MP4s + posters).
-- Writes are service-role/admin only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('reel-media', 'reel-media', true)
on conflict (id) do nothing;

create policy "reel-media: public read"
  on storage.objects for select
  using (bucket_id = 'reel-media');

create policy "reel-media: admin write"
  on storage.objects for insert
  with check (bucket_id = 'reel-media' and public.is_admin());

create policy "reel-media: admin update"
  on storage.objects for update
  using (bucket_id = 'reel-media' and public.is_admin());

create policy "reel-media: admin delete"
  on storage.objects for delete
  using (bucket_id = 'reel-media' and public.is_admin());
