-- Retire two dead subsystems and one duplicate social graph.
--
-- 1. The reel render pipeline (#76 folded reels into posts; the renderer,
--    its job queue, and the standalone tables go now). Legacy rendered
--    videos already live in `posts` + `post_media` (bucket 'reel-media')
--    via migration 0021's backfill, so nothing user-visible is lost.
-- 2. The friends graph. Follows are the one social graph; friends-only
--    post visibility folds into followers.
--    The `friendships` table itself stays: submit_confirmation's scout
--    independence check reads it, and historical rows are cheap. Nothing
--    writes to it anymore.

-- --- 1. Reels ---------------------------------------------------------------

drop table if exists public.reel_jobs;
drop table if exists public.reels;

-- --- 2. Friends-only visibility folds into followers ------------------------

update public.posts set visibility = 'followers' where visibility = 'friends';

alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts
  add constraint posts_visibility_check
  check (visibility in ('public', 'followers', 'private'));

-- can_view_post: latest body is migration 0036's (block-aware). Recreated
-- without the friends branch.
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
          else false   -- 'private'
        end
      )
    );
$$;
