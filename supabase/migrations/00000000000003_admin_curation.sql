-- Phase 6: curation infrastructure.

-- Place images live in a public-read bucket; only admins write.
insert into storage.buckets (id, name, public)
values ('place-images', 'place-images', true)
on conflict (id) do nothing;

create policy "place-images: public read"
  on storage.objects for select
  using (bucket_id = 'place-images');

create policy "place-images: admin insert"
  on storage.objects for insert
  with check (bucket_id = 'place-images' and public.is_admin());

create policy "place-images: admin update"
  on storage.objects for update
  using (bucket_id = 'place-images' and public.is_admin());

create policy "place-images: admin delete"
  on storage.objects for delete
  using (bucket_id = 'place-images' and public.is_admin());

-- Members can suggest places. Submissions arrive unpublished with
-- source='submitted' and surface in the admin review queue; the existing
-- select policy keeps them invisible until an editor publishes.
create policy "places: members can submit"
  on public.places for insert
  to authenticated
  with check (source = 'submitted' and is_published = false);
