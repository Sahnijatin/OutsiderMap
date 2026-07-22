-- Social Feed, part 5: fold reels into posts (sub-issue #76).
--
-- Reels become one post type (type=video). Rendered reels historically live in
-- the reel-media bucket, so post_media gains a `bucket` column: existing reels
-- back-fill with bucket='reel-media', and the pipeline writes new renders to
-- post-media going forward. The standalone `reels` table is kept read-only for
-- one release (not dropped) so nothing is lost; the write path is gone.

-- Which storage bucket a media row's paths live in. Defaults to the feed's own
-- public bucket; the reel back-fill sets 'reel-media' for the legacy objects.
alter table public.post_media
  add column bucket text not null default 'post-media'
  check (bucket in ('post-media', 'reel-media'));

-- Back-fill: every already-approved reel becomes an approved public video post
-- (it was already moderated) plus one post_media row pointing at its existing
-- reel-media objects. Runs once (migrations are single-apply); curated reels
-- with no owner are skipped - re-seed those as scout posts if needed.
do $$
declare
  r record;
  new_post_id uuid;
begin
  for r in
    select id, user_id, place_id, city, video_path, poster_path, caption, created_at
    from public.reels
    where status = 'approved' and user_id is not null
  loop
    insert into public.posts (
      author_id, type, place_id, city, body,
      visibility, location_precision, status, created_at
    )
    values (
      r.user_id, 'video', r.place_id, r.city, r.caption,
      'public', 'exact', 'approved', r.created_at
    )
    returning id into new_post_id;

    insert into public.post_media (post_id, kind, path, poster_path, ordinal, bucket)
    values (new_post_id, 'video', r.video_path, r.poster_path, 0, 'reel-media');
  end loop;
end $$;
