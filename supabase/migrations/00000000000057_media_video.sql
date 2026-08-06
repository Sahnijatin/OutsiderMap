-- Video, end to end.
--
-- Two things blocked hosted video everywhere in the product:
--
--   1. scout_candidate_media only accepted 'image' or 'embed', so a reviewer
--      could never attach a clip to a harvest candidate - and approve, which
--      copies candidate media onto place_media, had nothing to copy. The
--      place_media table has accepted 'video' since migration 41; this is the
--      row upstream of it catching up.
--
--   2. Storage buckets were created with no explicit file_size_limit, so every
--      one of them inherited the project default. A phone clip is tens of
--      megabytes and landed on that ceiling with an opaque failure. The limits
--      below are set per bucket to match the caps the application already
--      validates against, so a rejection happens in our code with our message
--      rather than deep inside Storage.
--
-- Mime types are deliberately left unrestricted at the bucket level: uploads
-- are validated by extension and (for images) magic bytes in application code,
-- and a bucket-level allowlist would reject a browser that sends a blank or
-- generic Content-Type on a signed upload.

-- ---------------------------------------------------------------------------
-- Harvest candidate media: clips are first-class alongside photos.
-- ---------------------------------------------------------------------------

alter table public.scout_candidate_media
  drop constraint if exists scout_candidate_media_kind_check;

alter table public.scout_candidate_media
  add constraint scout_candidate_media_kind_check
  check (kind in ('image', 'video', 'embed'));

-- An embed is a pointer; anything we host has to carry the file it points at.
alter table public.scout_candidate_media
  drop constraint if exists scout_media_image_has_file;

alter table public.scout_candidate_media
  add constraint scout_media_hosted_has_file
  check (kind = 'embed' or storage_path is not null);

-- ---------------------------------------------------------------------------
-- Storage: explicit per-bucket size ceilings.
-- ---------------------------------------------------------------------------

-- Editorial photos AND clips attached to places (harvest review, admin).
update storage.buckets
  set file_size_limit = 52428800 -- 50MB
  where id = 'place-images';

-- Experience story cards: images and short clips.
update storage.buckets
  set file_size_limit = 52428800 -- 50MB
  where id = 'experience-media';

-- Member posts: matches MAX_POST_MEDIA_BYTES.
update storage.buckets
  set file_size_limit = 157286400 -- 150MB
  where id = 'post-media';

-- Quest capture: matches MAX_QUEST_MEDIA_BYTES.
update storage.buckets
  set file_size_limit = 157286400 -- 150MB
  where id = 'quest-media';

-- Rendered reels + posters.
update storage.buckets
  set file_size_limit = 157286400 -- 150MB
  where id = 'reel-media';
