-- Phase 1 (mobile rebuild): invite-only membership vetting.
--
-- The waitlist becomes a member-approval queue: applicants submit a selfie +
-- photos + socials, an admin reviews and approves/rejects/waitlists. Selfies
-- and ID photos are sensitive PII (India DPDP Act): they live in a PRIVATE
-- bucket readable only by admins, and we record explicit consent at apply time.

alter table public.waitlist
  -- Path in the private member-vetting bucket (set at apply time).
  add column selfie_path text,
  add column photo_paths text[] not null default '{}',
  -- Review trail.
  add column reviewed_at timestamptz,
  add column reviewer_note text,
  -- Explicit consent to store/process personal data for vetting (DPDP).
  add column consent_personal_data boolean not null default false;

-- Broaden the application state machine: add 'waitlisted'.
alter table public.waitlist
  drop constraint waitlist_status_check;

alter table public.waitlist
  add constraint waitlist_status_check
  check (status in ('pending', 'accepted', 'rejected', 'waitlisted'));

-- ---------------------------------------------------------------------------
-- member-vetting: PRIVATE bucket. No public read policy => default deny.
-- Writes happen via the service role in the /join server action (which bypasses
-- RLS); admins may read/manage objects in the curation desk.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('member-vetting', 'member-vetting', false)
on conflict (id) do nothing;

create policy "member-vetting: admin read"
  on storage.objects for select
  using (bucket_id = 'member-vetting' and public.is_admin());

create policy "member-vetting: admin insert"
  on storage.objects for insert
  with check (bucket_id = 'member-vetting' and public.is_admin());

create policy "member-vetting: admin update"
  on storage.objects for update
  using (bucket_id = 'member-vetting' and public.is_admin());

create policy "member-vetting: admin delete"
  on storage.objects for delete
  using (bucket_id = 'member-vetting' and public.is_admin());
