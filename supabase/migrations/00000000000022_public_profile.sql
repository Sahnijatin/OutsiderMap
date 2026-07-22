-- Social Feed, part 6: a public profile view (sub-issue #77).
--
-- profiles RLS is owner-or-admin. The public profile page needs one member's
-- already-public identity by username (including the viewer's own), so this
-- adds a narrow security-definer lookup - the id/username/display_name/avatar/
-- outsider_number that search_members and reel badges already expose, but keyed
-- by username and without the self-exclusion find_member_by_username applies.
-- Their visible posts come straight from the posts table under can_view_post.

set check_function_bodies = off;

create or replace function public.public_profile(candidate citext)
returns table (
  id uuid,
  username citext,
  display_name text,
  avatar_url text,
  outsider_number int
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.username = candidate
  limit 1;
$$;
