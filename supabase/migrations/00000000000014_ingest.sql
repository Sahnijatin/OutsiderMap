-- Outsider pivot, part 4: the compliant scout pipeline.
--
-- Admins/scouts paste public links (reels, videos, blog posts); a background
-- pipeline pulls public metadata, extracts a structured place candidate,
-- geocodes it, and flags likely duplicates. Nothing publishes without an
-- admin approving it in the review inbox.

create table public.ingest_items (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  source_type text not null default 'other'
    check (source_type in ('instagram', 'youtube', 'blog', 'other')),
  status text not null default 'queued'
    check (status in (
      'queued', 'fetching', 'extracted', 'needs_review',
      'approved', 'rejected', 'failed'
    )),
  raw_metadata jsonb,
  candidate jsonb,
  dedupe_matches jsonb,
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  place_id uuid references public.places(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingest_items_status_idx on public.ingest_items (status, created_at);
create unique index ingest_items_url_idx on public.ingest_items (url);

alter table public.ingest_items enable row level security;

create policy "ingest_items: admin only"
  on public.ingest_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Catalog rows born from the pipeline carry their provenance.
alter table public.places
  drop constraint places_source_check;

alter table public.places
  add constraint places_source_check
  check (source in ('curated', 'submitted', 'ingested'));
