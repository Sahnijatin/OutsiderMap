-- Social Feed, part 4a: engagement + the activity substrate (sub-issue #75).
--
-- The reaction/comment routes write rows; the "who did what to my stuff"
-- notifications come from triggers so they can't be forged or missed. This
-- migration adds the activity_events table and the engagement triggers that
-- feed it (reactions, comments). #78 adds the follow + quest triggers and the
-- Activity reading surface. Push delivery stays deferred (events persist now).

set check_function_bodies = off;

-- One row per notifiable action, addressed to the recipient. Insert is
-- trigger-only (security definer); recipients read their own.
create table public.activity_events (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in
    ('follow', 'like', 'want_to_go', 'comment', 'quest_complete')),
  post_id uuid references public.posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipient_id <> actor_id)
);

create index activity_recipient_idx
  on public.activity_events (recipient_id, created_at desc);

alter table public.activity_events enable row level security;

-- Recipients read their own activity; a recipient may mark their rows read.
-- Never a client insert - triggers are the only writer.
create policy "activity: recipient can read"
  on public.activity_events for select
  using (recipient_id = auth.uid());

create policy "activity: recipient can mark read"
  on public.activity_events for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- A reaction notifies the post's author (never yourself).
create or replace function public.tg_activity_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (recipient_id, actor_id, type, post_id)
  select p.author_id, new.user_id, new.kind, new.post_id
  from public.posts p
  where p.id = new.post_id
    and p.author_id <> new.user_id;
  return new;
end;
$$;

create trigger tg_activity_reaction
  after insert on public.post_reactions
  for each row execute function public.tg_activity_reaction();

-- An approved comment notifies the post's author (never yourself).
create or replace function public.tg_activity_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'approved' then
    return new;
  end if;
  insert into public.activity_events (recipient_id, actor_id, type, post_id)
  select p.author_id, new.author_id, 'comment', new.post_id
  from public.posts p
  where p.id = new.post_id
    and p.author_id <> new.author_id;
  return new;
end;
$$;

create trigger tg_activity_comment
  after insert on public.post_comments
  for each row execute function public.tg_activity_comment();
