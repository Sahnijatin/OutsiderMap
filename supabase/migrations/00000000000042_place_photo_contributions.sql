-- Let members add a photo to a place.
--
-- The catalog has no pictures and we cannot buy our way out of that: stock
-- photography would make an anti-franchise map look like every other listings
-- site, and copying other people's photos is not ours to do. The pictures have
-- to come from the people standing in the room. This is that path.
--
-- Storage: contributions land in the existing public place-images bucket under
-- a c/{user_id}/ prefix, so the owner check below is a plain prefix match and
-- publicMediaUrl() already resolves them. Curated covers keep living at the
-- bucket root, admin-only, untouched by these policies.

-- A member may upload only beneath their own contributor prefix. Paths are
-- server-issued, so this is a second lock rather than the only one.
create policy "place-images: contributor insert own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'place-images'
    and (storage.foldername(name))[1] = 'c'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Contributors may remove their own upload (the "actually, not that one"
-- case). They may not touch anyone else's, and cannot reach curated covers
-- because those are not under the c/ prefix.
create policy "place-images: contributor delete own prefix"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'place-images'
    and (storage.foldername(name))[1] = 'c'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Contributors can withdraw their own media row. Everything else about
-- place_media stays server-written: the licence basis and the published
-- status are decisions we make, not the uploader.
create policy "place_media: contributor can withdraw own"
  on public.place_media for delete
  to authenticated
  using (contributor_id = auth.uid() and status <> 'removed');
