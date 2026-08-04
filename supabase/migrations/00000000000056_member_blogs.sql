-- Member blogs: long-form writing about a place.
--
-- A place carries a `story` (migration 6) - an ordered carousel of media with
-- 280-character captions. That is a scene, not an argument. Nothing in the
-- product lets a member write at length about why a spot is worth the trip,
-- which is exactly the kind of content that makes a thin catalog feel inhabited.
--
-- A blog is a post. It has an author, a place, a visibility, moderation, a
-- comment thread, reactions, reports and a block relationship - every one of
-- which `posts` already implements and has tested triggers for. Giving blogs
-- their own table would mean teaching all of that machinery about a second
-- content type. So `type` gains 'article' and the long-form fields hang off
-- posts in a 1:1 child, the same shape `post_media` already uses.
--
-- The one genuinely new concept is `show_in_feed`: a member choosing between
-- "only under the place I wrote about" and "public, in the feed too". That is
-- surfacing, not privacy - a place-only blog is still readable by anyone who
-- can read the post, it simply does not enter the feed. It defaults true so
-- every existing post keeps its current behaviour exactly.

-- ---------------------------------------------------------------------------
-- posts - widen the type, add the surfacing flag.
-- ---------------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check
  check (type in ('status', 'photo', 'video', 'review', 'list', 'article'));

-- The drop above names a constraint Postgres chose implicitly back in
-- migration 0017. If this database ever carried a differently-named check on
-- `type` - a hand-applied hotfix, say - that drop silently does nothing, the
-- old constraint survives alongside the new one, and every blog insert fails
-- at runtime while this migration reports success. Verified: without this
-- block the swap "succeeds" and `insert ... type='article'` then errors.
do $$
declare
  stale text;
begin
  select string_agg(conname, ', ') into stale
  from pg_constraint
  where conrelid = 'public.posts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%''review''%'
    and pg_get_constraintdef(oid) not like '%''article''%';
  if stale is not null then
    raise exception
      'posts.type is still constrained by %, which rejects ''article''. Blogs would fail on insert.', stale;
  end if;
end $$;

alter table public.posts
  add column if not exists show_in_feed boolean not null default true;

comment on column public.posts.show_in_feed is
  'Feed surfacing, not privacy. False keeps an article on its place page only.';

-- The feed reads (city, status, created_at desc) and now also filters
-- show_in_feed. Nearly every row is true, so the partial index is effectively
-- the old one plus the new predicate - no read regresses.
drop index if exists posts_feed_idx;
create index posts_feed_idx on public.posts (city, status, created_at desc)
  where show_in_feed = true;

-- ---------------------------------------------------------------------------
-- post_articles - the long-form body, 1:1 with an 'article' post.
-- ---------------------------------------------------------------------------

create table public.post_articles (
  post_id uuid primary key references public.posts(id) on delete cascade,
  title text not null,
  -- Human-readable URL key. Derived from the title with a random suffix; this
  -- unique index is the final word on collisions (same posture as place slugs).
  slug text not null unique,
  -- Ordered blocks: [{ type: 'paragraph'|'heading'|'quote'|'place', ... }].
  -- Structured rather than markdown or HTML so rendering never needs
  -- dangerouslySetInnerHTML, and so a block can embed a live place card.
  body jsonb not null default '[]'::jsonb,
  reading_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_articles enable row level security;

-- ---------------------------------------------------------------------------
-- post_article_places - places beyond posts.place_id (the anchor).
--
-- The anchor is what the feed card shows and where "open the blog and the
-- place it was written for" lands. A roundup ("cafes in Hauz Khas") anchors on
-- one and tags the rest, so it surfaces under each of them.
-- ---------------------------------------------------------------------------

create table public.post_article_places (
  post_id uuid not null references public.posts(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  sort_order int not null default 0,
  primary key (post_id, place_id)
);

create index post_article_places_place_idx
  on public.post_article_places (place_id);

alter table public.post_article_places enable row level security;

-- ---------------------------------------------------------------------------
-- RLS. Both tables are children of a post, so they defer to the existing
-- security-definer evaluators rather than restating visibility rules - the
-- same pattern post_media uses. can_view_post requires auth.uid() is not null,
-- so member blogs are invisible to anonymous readers (and crawlers) by policy
-- rather than by a filter someone can forget.
-- ---------------------------------------------------------------------------

create policy "post_articles: visible with parent post"
  on public.post_articles for select
  using (public.can_view_post_by_id(post_id));

create policy "post_articles: author can write"
  on public.post_articles for all to authenticated
  using (public.post_author(post_id) = auth.uid())
  with check (public.post_author(post_id) = auth.uid());

create policy "post_article_places: visible with parent post"
  on public.post_article_places for select
  using (public.can_view_post_by_id(post_id));

create policy "post_article_places: author can write"
  on public.post_article_places for all to authenticated
  using (public.post_author(post_id) = auth.uid())
  with check (public.post_author(post_id) = auth.uid());
