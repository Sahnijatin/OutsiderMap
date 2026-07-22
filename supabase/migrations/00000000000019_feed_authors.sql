-- Social Feed, part 3: public author identity for feed cards (sub-issue #74).
--
-- Rendering the feed needs each post author's public identity, but profiles
-- RLS is owner-or-admin. username / display_name / outsider_number are already
-- treated as public (search_members exposes them to any signed-in member, reel
-- badges show them); this returns those same safe fields plus avatar_url for a
-- bounded id list, so a feed page can label its authors without widening row
-- access. #77 extends the public-profile surface further (single profile view).

set check_function_bodies = off;

create or replace function public.public_authors(ids uuid[])
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
    and p.id = any(ids);
$$;
