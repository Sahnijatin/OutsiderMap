-- Social Feed, part 1: the schema + RLS foundation (epic #67, sub-issue #71).
--
-- Turns the reels-only surface into a general place-anchored feed. This
-- migration is the load-bearing layer everything else (#72-#78) builds on:
-- the follow graph, the unified `posts` object (reels fold in as type=video),
-- ordered media, engagement, and report intake - plus the visibility RLS,
-- the moderation status gate, and the trigger-maintained counters.
--
-- Conventions reused verbatim from earlier migrations:
--   * default-deny RLS; public identity only via security-definer functions
--   * immutability enforced by BEFORE-UPDATE triggers, since RLS with-check
--     cannot compare OLD and NEW (protect_friendship_columns, migration 16)
--   * privileged writes (moderation, counters) run as service_role/definer

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- follows - asymmetric public graph (curators/scouts get public reach). This
-- is the looser tier; the mutual, more-private tier stays in `friendships`.
-- ---------------------------------------------------------------------------

create table public.follows (
  follower  uuid not null references public.profiles(id) on delete cascade,
  followee  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create index follows_followee_idx on public.follows (followee);

alter table public.follows enable row level security;

-- The follow graph is public to signed-in members; you may only create or
-- remove edges that start at you.
create policy "follows: signed-in members can read"
  on public.follows for select
  using (auth.uid() is not null);

create policy "follows: follower can create own edge"
  on public.follows for insert
  with check (follower = auth.uid());

create policy "follows: follower can remove own edge"
  on public.follows for delete
  using (follower = auth.uid());

-- ---------------------------------------------------------------------------
-- posts - the unified post object. Reels become type=video; every post is
-- strongly encouraged to anchor to a catalog place. `status` is the
-- moderation gate; only privileged code advances it (trigger below).
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in
    ('status', 'photo', 'video', 'review', 'list')),   -- 'video' subsumes reels
  place_id uuid references public.places(id) on delete set null,   -- place-first
  area text,                                        -- when no exact pin
  city text not null default 'delhi' references public.cities(slug),
  action text,                    -- eating / exploring / chilling / dancing…
  mood text,
  body text,                      -- free text (moderated)
  visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'friends', 'private')),
  location_precision text not null default 'exact'
    check (location_precision in ('exact', 'area', 'hidden')),  -- hidden rooftop
  status text not null default 'pending'            -- moderation gate
    check (status in ('pending', 'approved', 'rejected', 'removed')),
  -- denormalized counters (kept correct by triggers) for cheap feed reads:
  like_count int not null default 0,
  comment_count int not null default 0,
  want_count int not null default 0,
  created_at timestamptz not null default now()
);

create index posts_feed_idx on public.posts (city, status, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_place_idx on public.posts (place_id) where place_id is not null;

alter table public.posts enable row level security;

-- ---------------------------------------------------------------------------
-- post_media - ordered media children (multi-photo, video + poster).
-- ---------------------------------------------------------------------------

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  path text not null,          -- storage path in the public 'post-media' bucket
  poster_path text,            -- video poster
  ordinal int not null default 0
);

create index post_media_post_idx on public.post_media (post_id, ordinal);

alter table public.post_media enable row level security;

-- ---------------------------------------------------------------------------
-- Engagement: reactions (like + want_to_go) and comments.
-- ---------------------------------------------------------------------------

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'like' check (kind in ('like', 'want_to_go')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

alter table public.post_reactions enable row level security;

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'approved'
    check (status in ('approved', 'removed')),
  created_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

-- ---------------------------------------------------------------------------
-- content_reports - moderation intake. The report/review loop and admin queue
-- live in the UGC-moderation epic (#70); this table is the seam it consumes.
-- ---------------------------------------------------------------------------

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index content_reports_open_idx on public.content_reports (created_at)
  where resolved_at is null;

alter table public.content_reports enable row level security;

-- ---------------------------------------------------------------------------
-- Visibility helpers. profiles/posts RLS must never leak, so per-post
-- visibility is evaluated by security-definer functions (they read the
-- follow/friend graph without exposing it, and reading `posts` as definer
-- sidesteps recursive RLS the same way is_admin() reads profiles).
-- ---------------------------------------------------------------------------

-- Core evaluator over a post's own fields + the caller. Author and admin see
-- everything; everyone else sees only approved content, gated by visibility.
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
        p_status = 'approved'
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

-- Same decision, keyed by id - for child tables and server code that only
-- hold a post_id. Reads posts as definer so it never recurses into the
-- posts SELECT policy.
create or replace function public.can_view_post_by_id(p_post_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_view_post(p.author_id, p.visibility, p.status)
  from public.posts p
  where p.id = p_post_id;
$$;

-- The author of a post, read as definer for owner checks in child policies.
create or replace function public.post_author(p_post_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select author_id from public.posts where id = p_post_id;
$$;

-- ---------------------------------------------------------------------------
-- posts RLS. Read via can_view_post; authors write their own rows but never
-- self-approve (status starts 'pending' and only moderation advances it).
-- ---------------------------------------------------------------------------

create policy "posts: visible per visibility rules"
  on public.posts for select
  using (public.can_view_post(author_id, visibility, status));

create policy "posts: author can create pending"
  on public.posts for insert
  with check (author_id = auth.uid() and status = 'pending');

create policy "posts: author can edit own"
  on public.posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "posts: author can delete own"
  on public.posts for delete
  using (author_id = auth.uid());

-- status/author/created_at/counter changes are service-role-only; a trigger
-- enforces it because RLS with-check cannot see OLD (protect_* pattern).
create or replace function public.protect_post_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'post author is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'post created_at is immutable';
  end if;
  if new.status is distinct from old.status then
    raise exception 'post status is advanced by moderation only';
  end if;
  if new.like_count is distinct from old.like_count
     or new.comment_count is distinct from old.comment_count
     or new.want_count is distinct from old.want_count then
    raise exception 'post counters are maintained by triggers';
  end if;
  return new;
end;
$$;

create trigger protect_post_columns
  before update on public.posts
  for each row execute function public.protect_post_columns();

-- ---------------------------------------------------------------------------
-- post_media RLS. Visible if the parent post is; writable by the post author.
-- (The pipeline/composer confirm the object server-side; direct paths are
-- owner-prefixed in the storage bucket policy below.)
-- ---------------------------------------------------------------------------

create policy "post_media: visible with parent post"
  on public.post_media for select
  using (public.can_view_post_by_id(post_id));

create policy "post_media: author can attach"
  on public.post_media for insert
  with check (public.post_author(post_id) = auth.uid());

create policy "post_media: author can remove"
  on public.post_media for delete
  using (public.post_author(post_id) = auth.uid());

-- ---------------------------------------------------------------------------
-- post_reactions RLS. React to any post you can see, as yourself; remove your
-- own. Counters are never touched from here - a trigger keeps them correct.
-- ---------------------------------------------------------------------------

create policy "post_reactions: visible with parent post"
  on public.post_reactions for select
  using (public.can_view_post_by_id(post_id));

create policy "post_reactions: react to visible posts as self"
  on public.post_reactions for insert
  with check (user_id = auth.uid() and public.can_view_post_by_id(post_id));

create policy "post_reactions: remove own"
  on public.post_reactions for delete
  using (user_id = auth.uid());

create or replace function public.sync_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'like' then
      update public.posts set like_count = like_count + 1 where id = new.post_id;
    elsif new.kind = 'want_to_go' then
      update public.posts set want_count = want_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.kind = 'like' then
      update public.posts set like_count = greatest(like_count - 1, 0)
        where id = old.post_id;
    elsif old.kind = 'want_to_go' then
      update public.posts set want_count = greatest(want_count - 1, 0)
        where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger sync_post_reaction_counts
  after insert or delete on public.post_reactions
  for each row execute function public.sync_post_reaction_counts();

-- ---------------------------------------------------------------------------
-- post_comments RLS. Approved comments are visible with the parent post;
-- authors see and manage their own. Removal (status change) is service-role.
-- ---------------------------------------------------------------------------

create policy "post_comments: approved visible, own always"
  on public.post_comments for select
  using (
    public.can_view_post_by_id(post_id)
    and (status = 'approved' or author_id = auth.uid() or public.is_admin())
  );

create policy "post_comments: author can comment on visible posts"
  on public.post_comments for insert
  with check (
    author_id = auth.uid()
    and status = 'approved'
    and public.can_view_post_by_id(post_id)
  );

create policy "post_comments: author can edit own"
  on public.post_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "post_comments: author can delete own"
  on public.post_comments for delete
  using (author_id = auth.uid());

-- Pin the comment's identity (parent, author, created_at) so an edit can't
-- move it to another post/author and desync counters; status stays
-- approved/removed only, which the CHECK already enforces.
create or replace function public.protect_post_comment_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.post_id is distinct from old.post_id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'comment identity is immutable';
  end if;
  return new;
end;
$$;

create trigger protect_post_comment_columns
  before update on public.post_comments
  for each row execute function public.protect_post_comment_columns();

create or replace function public.sync_post_comment_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      update public.posts set comment_count = comment_count + 1
        where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' then
      update public.posts set comment_count = greatest(comment_count - 1, 0)
        where id = old.post_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.status = 'approved' and new.status <> 'approved' then
      update public.posts set comment_count = greatest(comment_count - 1, 0)
        where id = new.post_id;
    elsif old.status <> 'approved' and new.status = 'approved' then
      update public.posts set comment_count = comment_count + 1
        where id = new.post_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create trigger sync_post_comment_counts
  after insert or update or delete on public.post_comments
  for each row execute function public.sync_post_comment_counts();

-- ---------------------------------------------------------------------------
-- content_reports RLS. Anyone can file a report about themselves as reporter;
-- only admins read/act on the queue (the moderation epic drives resolution).
-- ---------------------------------------------------------------------------

create policy "content_reports: reporter can file"
  on public.content_reports for insert
  with check (reporter_id = auth.uid());

create policy "content_reports: admin can read"
  on public.content_reports for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- post-media: public-read output bucket (CDN-served images + videos).
-- Uploads are owner-prefixed p/{user_id}/... and confirmed server-side,
-- mirroring quest-media; reads are public like reel-media.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

create policy "post-media: public read"
  on storage.objects for select
  using (bucket_id = 'post-media');

create policy "post-media: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "post-media: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
