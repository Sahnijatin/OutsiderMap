-- Personal safety (#122): make the bidirectional block airtight.
--
-- Migration 25 added hidden_user_ids() - every user id in a block relationship
-- with the caller, either direction - but only three app-code surfaces (feed,
-- profile route, blocks route) ever consulted it. A blocked user could still
-- reach you everywhere else: member search, username lookup, friend rows, the
-- activity actor list, single-post/comment/reaction visibility, and by opening
-- a fresh follow or friend edge.
--
-- This folds hidden_user_ids() into the shared security-definer functions and
-- the child-table read policies, and block-guards the follow/friendship write
-- paths, so a blocked party is invisible on *every* surface, not just the feed.
-- No signatures change - callers and src/types/database.ts are untouched.
--
-- hidden_user_ids() keys off auth.uid() (the JWT), which resolves to the real
-- caller even inside a security-definer body, so nesting it is correct. It
-- returns non-null uuids only, so `not in (...)` has no NULL-in-list trap.
-- Moderation tooling reads via the service-role admin client (RLS bypassed,
-- auth.uid() null), so filtering these member-facing paths never blinds it.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Discovery / identity RPCs: a hidden member is dropped from the result.
-- ---------------------------------------------------------------------------

-- Member search (migration 16).
create or replace function public.search_members(q text)
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.username is not null
    and p.id <> auth.uid()
    and p.id not in (select public.hidden_user_ids())
    and length(regexp_replace(lower(q), '[^a-z0-9_]', '', 'g')) >= 2
    and p.username::text like (regexp_replace(lower(q), '[^a-z0-9_]', '', 'g') || '%')
  order by p.username
  limit 10;
$$;

-- Friend-row identity (migration 16). Already friendship-scoped; a block on top
-- of an existing friendship hides them here too.
create or replace function public.get_public_profiles(ids uuid[])
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(ids)
    and p.id not in (select public.hidden_user_ids())
    and exists (
      select 1 from public.friendships f
      where (f.requester = auth.uid() and f.addressee = p.id)
         or (f.addressee = auth.uid() and f.requester = p.id)
    );
$$;

-- Exact username lookup for sending a request (migration 16). A hidden member
-- can't be found - so a blocked user can't be re-added by username.
create or replace function public.find_member_by_username(candidate citext)
returns table (id uuid, username citext, display_name text, outsider_number int)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.outsider_number
  from public.profiles p
  where auth.uid() is not null
    and p.username = candidate
    and p.id <> auth.uid()
    and p.id not in (select public.hidden_user_ids())
  limit 1;
$$;

-- Feed/activity actor identity (migration 19). Keeps hidden actors out of the
-- activity stream and is defense-in-depth for the feed, which already filters.
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
    and p.id = any(ids)
    and p.id not in (select public.hidden_user_ids());
$$;

-- Public profile page lookup (migration 22). A hidden member yields no row, so
-- their profile reads as "not found" - matching the app-layer guard exactly,
-- now enforced at the source.
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
    and (p.id = auth.uid() or p.id not in (select public.hidden_user_ids()))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Relationship state: no follow_state for a hidden target; counts and flags
-- stay hidden. The row-shaping helper defaults a missing row to zero, so an
-- empty result is safe for every caller.
-- ---------------------------------------------------------------------------

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
    )
  where target = auth.uid()
     or target not in (select public.hidden_user_ids());
$$;

-- ---------------------------------------------------------------------------
-- Content visibility: fold the block filter into can_view_post's visibility
-- branch. Author-self and admin keep full visibility (they short-circuit
-- before the branch); everyone else can't see a hidden member's posts. This
-- one change also covers single-post view, comments, and reactions, since
-- their read policies gate on can_view_post_by_id -> can_view_post.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_post(
  p_author uuid,
  p_visibility text,
  p_status text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() is not null
    and (
      p_author = auth.uid()
      or public.is_admin()
      or (
        p_author not in (select public.hidden_user_ids())
        and p_status = 'approved'
        and case p_visibility
          when 'public' then true
          when 'followers' then exists (
            select 1 from public.follows f
            where f.follower = auth.uid() and f.followee = p_author
          )
          when 'friends' then exists (
            select 1 from public.friendships fr
            where fr.status = 'accepted'
              and (
                (fr.requester = auth.uid() and fr.addressee = p_author)
                or (fr.addressee = auth.uid() and fr.requester = p_author)
              )
          )
          else false   -- 'private'
        end
      )
    );
$$;

-- can_view_post_by_id gates the parent post; but a hidden member can still
-- *comment on* or *react to* a third party's post you can both see. Fold the
-- block filter into those child read policies directly so their rows vanish
-- too (own rows and admin always visible).

drop policy "post_comments: approved visible, own always" on public.post_comments;
create policy "post_comments: approved visible, own always"
  on public.post_comments for select
  using (
    public.can_view_post_by_id(post_id)
    and (status = 'approved' or author_id = auth.uid() or public.is_admin())
    and (
      author_id = auth.uid()
      or public.is_admin()
      or author_id not in (select public.hidden_user_ids())
    )
  );

drop policy "post_reactions: visible with parent post" on public.post_reactions;
create policy "post_reactions: visible with parent post"
  on public.post_reactions for select
  using (
    public.can_view_post_by_id(post_id)
    and (
      user_id = auth.uid()
      or user_id not in (select public.hidden_user_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Write paths: you can't open a fresh follow or friend edge to someone in a
-- block relationship with you (either direction). Recreate the insert policies
-- with the guard folded into the with-check.
-- ---------------------------------------------------------------------------

drop policy "follows: follower can create own edge" on public.follows;
create policy "follows: follower can create own edge"
  on public.follows for insert
  with check (
    follower = auth.uid()
    and followee not in (select public.hidden_user_ids())
  );

drop policy "friendships: requester can create pending" on public.friendships;
create policy "friendships: requester can create pending"
  on public.friendships for insert
  with check (
    requester = auth.uid()
    and status = 'pending'
    and addressee not in (select public.hidden_user_ids())
  );
