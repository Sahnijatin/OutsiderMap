-- UGC Moderation, part 2: mutual block visibility (#70/#88).
--
-- user_blocks RLS lets a member read only their own (blocker) rows, so they
-- can't see who blocked *them*. Feed/profile filtering needs both directions,
-- so this security-definer function returns every user id in a block
-- relationship with the caller - hidden from their feed and profiles.

set check_function_bodies = off;

create or replace function public.hidden_user_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select blocked from public.user_blocks where blocker = auth.uid()
  union
  select blocker from public.user_blocks where blocked = auth.uid();
$$;
