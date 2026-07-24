-- place_media: real photos and creator reels on a place, with the licence
-- basis recorded per item.
--
-- The catalog shipped with image_path populated on zero of 110 places, so
-- every place page was text on a dark rectangle. This is where the pictures
-- live.
--
-- The load-bearing idea: crediting a creator is not a licence. Copying
-- someone's reel and captioning it "via @them" is still reproduction, and
-- India's Section 52 fair-dealing exceptions are narrower than US fair use.
-- So media arrives one of two ways and the schema will not let us blur them:
--
--   we host it   - a scout's photo, an owner's photo, our own editorial shot.
--                  We have a licence via the terms they accepted.
--   we embed it  - an Instagram reel or YouTube video, served by the platform
--                  from the platform's servers, with the creator's handle and
--                  a link back. We store the URL and oEmbed metadata, never
--                  the file.
--
-- The check constraints below enforce exactly that: an embed row physically
-- cannot carry a storage_path, and a hosted row cannot carry embed HTML. The
-- policy is the schema rather than a convention someone forgets.

create table public.place_media (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,

  kind text not null check (kind in ('image', 'video', 'embed')),

  -- How we are entitled to show this. Drives which columns are legal below.
  licence_basis text not null check (licence_basis in (
    'user_upload',     -- a member's own photo; licensed via our terms
    'owner_supplied',  -- the venue gave it to us
    'editorial',       -- we shot or commissioned it
    'embed'            -- the platform serves it; we never hold a copy
  )),

  -- Hosted media (licence_basis <> 'embed').
  storage_path text,

  -- Embedded media (licence_basis = 'embed'). Attribution is not optional:
  -- author_name and source_url are what point people back to the creator.
  source_url text,
  source_platform text check (source_platform in ('instagram', 'youtube', 'other')),
  author_name text,
  author_url text,
  embed_html text,
  thumbnail_url text,

  -- Provenance. A scout photo carries the GPS fix and timestamp from capture,
  -- which is what makes it provably of this place.
  contributor_id uuid references public.profiles(id) on delete set null,
  captured_lat double precision,
  captured_lng double precision,
  captured_at timestamptz,

  caption text,
  sort_order int not null default 0,

  -- Takedown. Rows are retired, never deleted, so a repeat complaint is
  -- traceable. Pairs with the grievance flow (migration 29) for the
  -- intermediary safe harbour under s.79 of the IT Act.
  status text not null default 'published'
    check (status in ('pending', 'published', 'removed')),
  removed_reason text,
  removed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An embed is a pointer, never a copy.
  constraint place_media_embed_has_no_file check (
    licence_basis <> 'embed' or storage_path is null
  ),
  constraint place_media_embed_needs_attribution check (
    licence_basis <> 'embed' or (source_url is not null and author_name is not null)
  ),
  -- Hosted media is a file we hold, and holds no platform embed markup.
  constraint place_media_hosted_has_file check (
    licence_basis = 'embed' or storage_path is not null
  ),
  constraint place_media_hosted_has_no_embed check (
    licence_basis = 'embed' or embed_html is null
  )
);

create index place_media_place_idx
  on public.place_media (place_id, sort_order, created_at)
  where status = 'published';
create index place_media_contributor_idx
  on public.place_media (contributor_id, created_at desc);
-- One row per source link per place: re-submitting a reel must not duplicate.
create unique index place_media_source_idx
  on public.place_media (place_id, source_url)
  where source_url is not null;

alter table public.place_media enable row level security;

-- Published media on a published, non-chain place is public. Contributors can
-- see their own while it is pending; admins see everything.
create policy "place_media: published readable by everyone"
  on public.place_media for select
  using (
    (status = 'published' and exists (
      select 1 from public.places p
      where p.id = place_id and p.is_published = true
    ))
    or contributor_id = auth.uid()
    or public.is_admin()
  );

-- No client write policy: media arrives through the scout-capture and ingest
-- RPCs, which is where the licence basis gets decided. Default-deny.
create policy "place_media: admin can write"
  on public.place_media for all
  using (public.is_admin())
  with check (public.is_admin());

-- Hosted place media lives in the existing public place-images bucket, so
-- publicMediaUrl() already resolves it and no new storage policy is needed.
-- storage_path values are bucket-relative, matching places.image_path.
