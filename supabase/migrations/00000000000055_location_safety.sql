-- Personal safety (#122): social posts default to the *area*, not the exact
-- spot. Sharing your life shouldn't broadcast a pinpoint unless you choose to.
--
-- posts.location_precision shipped defaulting to 'exact' (migration 17). Flip
-- the column default to 'area' so a post created without an explicit choice is
-- coarse by default — matching the composer/schema default and the server-side
-- coarsening that now strips the exact place from area/hidden posts on read.
--
-- Non-destructive: existing posts keep whatever precision they were created
-- with. We don't retroactively coarsen — that would rewrite what members
-- already chose to share. Only new posts pick up the safer default.

alter table public.posts
  alter column location_precision set default 'area';
