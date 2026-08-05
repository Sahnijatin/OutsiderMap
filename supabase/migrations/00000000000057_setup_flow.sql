-- Screen-by-screen first run: an explicit progress marker, plus the avatars
-- bucket that profiles.avatar_url has pointed at since migration 1 without
-- anything in the app ever writing to it.
--
-- Why a marker column rather than deriving progress from the data:
--   * home_city DEFAULTS to 'delhi' (migration 9), so a member who never saw a
--     city screen is indistinguishable from one who chose Delhi.
--   * handle_new_user (migration 9) copies the OAuth provider's full_name and
--     avatar_url straight onto the profile, so display_name/avatar_url are
--     populated before the member has confirmed anything.
-- For every new screen, "did they actually answer this?" is unanswerable from
-- column values. The marker is the only honest record.
--
-- Why a set (text[]) rather than an ordinal step number: reordering or
-- inserting a screen would silently change what a stored ordinal means, and an
-- ordinal cannot express "did screens 1 and 3 but skipped 2" - which is exactly
-- what the profile page's "finish your profile" nudge needs to read. Unknown
-- ids are ignored by the resolver, so rolling app code back over a rolled-
-- forward database degrades instead of breaking.

alter table public.profiles
  add column if not exists setup_steps text[] not null default '{}';

comment on column public.profiles.setup_steps is
  'Completed first-run screen ids (see src/lib/setup/steps.ts). A set, not a '
  'sequence: order-independent, and a skipped screen is simply absent.';

-- ---------------------------------------------------------------------------
-- Backfill. The hard requirement: nobody who has already finished onboarding
-- may be thrown back into /setup. The resolver's first guard is
-- onboarding_completed_at, but marking the steps too keeps the two in agreement
-- and gives the nudge real per-member signal instead of a blanket "all done".
--
-- Each mark is earned:
--   username - they have one (usernames are one-shot, so it was claimed)
--   quiz     - onboarding_completed_at is set (runOnboarding's last write)
--   city     - home_area is non-null (nothing but a deliberate choice sets it)
--   identity - display_name is non-empty
-- home_city is deliberately NOT evidence for 'city': it is defaulted, so it
-- proves nothing.
-- ---------------------------------------------------------------------------

update public.profiles
set setup_steps = (
  select array(
    select distinct unnest(
      array['username']
      || case
           when onboarding_completed_at is not null then array['quiz']
           else '{}'::text[]
         end
      || case
           when home_area is not null then array['city']
           else '{}'::text[]
         end
      || case
           when display_name is not null and btrim(display_name) <> ''
             then array['identity']
           else '{}'::text[]
         end
    )
  )
)
where username is not null
  and setup_steps = '{}';

-- ---------------------------------------------------------------------------
-- mark_setup_step: idempotent set-append, in one statement.
--
-- Doing this read-modify-write in application code loses a marker whenever two
-- tabs (or the web app and the native shell) advance at the same time: both
-- read the old array, both write their own single addition, last write wins.
-- Here the read and the write are the same statement, so concurrent calls
-- serialise on the row lock.
--
-- security invoker on purpose: the owner-update policy from migration 10 still
-- applies, so this can only ever touch the caller's own row.
-- ---------------------------------------------------------------------------

create or replace function public.mark_setup_step(step text)
returns text[]
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set setup_steps = (
    select array(select distinct unnest(setup_steps || array[step]))
  )
  where id = auth.uid()
  returning setup_steps;
$$;

comment on function public.mark_setup_step(text) is
  'Records a completed first-run screen for the calling member. Idempotent, '
  'and safe against concurrent callers because the append happens in one '
  'statement.';

-- ---------------------------------------------------------------------------
-- avatars bucket.
--
-- Public read, matching post-media (migration 17) and place-images (migration
-- 3): avatars already render on the public profile route and in feed cards, so
-- a private bucket would mean signing a URL for something that is public by
-- design. Writes are owner-prefixed a/{user_id}/... and confirmed server-side,
-- exactly like post-media - which is what makes (storage.foldername(name))[2]
-- the uploader's id and therefore trustworthy in the policy.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner insert" on storage.objects;
create policy "avatars: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Replacing a photo overwrites the object at a fresh path and deletes the old
-- one, so both update and delete are needed; both stay pinned to the owner's
-- own prefix.
drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
