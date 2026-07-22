-- Social Feed, part 2: follow-graph stats (epic #67, sub-issue #72).
--
-- The follow edges live in `follows` (migration 0017) and are readable by any
-- signed-in member, but profiles RLS is owner-or-admin, so follower/following
-- counts and the viewer's follow state go through a narrow security-definer
-- function - the same posture as search_members / get_public_profiles.

set check_function_bodies = off;

-- Aggregate follow state for `target` from the caller's seat: how many follow
-- the target, how many the target follows, whether the caller follows them,
-- and whether they follow the caller back. auth.uid() = null (signed-out)
-- simply yields false for the two relationship flags.
create or replace function public.follow_state(target uuid)
returns table (
  follower_count int,
  following_count int,
  is_following boolean,
  follows_you boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.follows where followee = target)::int,
    (select count(*) from public.follows where follower = target)::int,
    exists (
      select 1 from public.follows
      where follower = auth.uid() and followee = target
    ),
    exists (
      select 1 from public.follows
      where follower = target and followee = auth.uid()
    );
$$;
