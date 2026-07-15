-- Outsider pivot, part 2b: quests.
--
-- A quest is an ordered run of stops that unlock one at a time. State
-- transitions are the game's integrity, so they only happen inside
-- security-definer RPCs (single transaction, invariants checked) - owners
-- read their quests and edit cosmetic fields, never status columns.

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city text not null default 'delhi' references public.cities(slug),
  title text not null,
  -- The questionnaire answers that shaped this quest:
  -- { first_time, interests[], hours, brief, budget_max }
  brief jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'abandoned')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index quests_user_idx on public.quests (user_id, created_at desc);

alter table public.quests enable row level security;

create policy "quests: owner can read"
  on public.quests for select
  using (user_id = auth.uid());

create policy "quests: owner can insert drafts"
  on public.quests for insert
  with check (user_id = auth.uid() and status = 'draft');

-- Owner may rename or abandon; other status moves go through RPCs. The
-- trigger below pins the non-cosmetic columns.
create policy "quests: owner can update"
  on public.quests for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Drafts and abandoned quests can be discarded; finished ones are history.
create policy "quests: owner can delete unfinished"
  on public.quests for delete
  using (user_id = auth.uid() and status in ('draft', 'abandoned'));

create or replace function public.protect_quest_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  -- Owners may only rename, or abandon a quest that isn't finished.
  if new.status is distinct from old.status then
    if not (old.status in ('draft', 'active') and new.status = 'abandoned') then
      raise exception 'quest status changes only via start/complete';
    end if;
  end if;
  if new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at
     or new.user_id is distinct from old.user_id
     or new.brief is distinct from old.brief then
    raise exception 'immutable quest column';
  end if;
  return new;
end;
$$;

create trigger protect_quest_columns
  before update on public.quests
  for each row execute function public.protect_quest_columns();

create table public.quest_stops (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  position int not null,
  place_id uuid not null references public.places(id) on delete cascade,
  note text,
  -- { photos: 3, videos: 1, prompts: ["the room from your seat", ...] }
  capture_guide jsonb not null default '{}'::jsonb,
  status text not null default 'locked'
    check (status in ('locked', 'unlocked', 'completed')),
  user_note text,
  completed_at timestamptz,
  unique (quest_id, position)
);

create index quest_stops_quest_idx on public.quest_stops (quest_id, position);

alter table public.quest_stops enable row level security;

create policy "quest_stops: owner can read"
  on public.quest_stops for select
  using (
    exists (
      select 1 from public.quests q
      where q.id = quest_id and q.user_id = auth.uid()
    )
  );

-- Generation writes stops through the user-scoped client; only into the
-- member's own still-draft quest.
create policy "quest_stops: owner can insert into own draft"
  on public.quest_stops for insert
  with check (
    exists (
      select 1 from public.quests q
      where q.id = quest_id
        and q.user_id = auth.uid()
        and q.status = 'draft'
    )
  );

-- user_note is the only owner-writable column; the trigger enforces it.
create policy "quest_stops: owner can annotate"
  on public.quest_stops for update
  using (
    exists (
      select 1 from public.quests q
      where q.id = quest_id and q.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quests q
      where q.id = quest_id and q.user_id = auth.uid()
    )
  );

create or replace function public.protect_quest_stop_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.position is distinct from old.position
     or new.place_id is distinct from old.place_id
     or new.quest_id is distinct from old.quest_id
     or new.capture_guide is distinct from old.capture_guide
     or new.note is distinct from old.note
     or new.completed_at is distinct from old.completed_at then
    raise exception 'quest stop state changes only via RPCs';
  end if;
  return new;
end;
$$;

create trigger protect_quest_stop_columns
  before update on public.quest_stops
  for each row execute function public.protect_quest_stop_columns();

create table public.quest_stop_media (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.quest_stops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index quest_stop_media_stop_idx on public.quest_stop_media (stop_id);

alter table public.quest_stop_media enable row level security;

create policy "quest_stop_media: owner can read"
  on public.quest_stop_media for select
  using (user_id = auth.uid() or public.is_admin());

create policy "quest_stop_media: owner can insert"
  on public.quest_stop_media for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.quest_stops s
      join public.quests q on q.id = s.quest_id
      where s.id = stop_id
        and q.user_id = auth.uid()
        and s.status = 'unlocked'
    )
  );

-- Media can be retaken while the stop is still open, never after.
create policy "quest_stop_media: owner can delete while stop open"
  on public.quest_stop_media for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.quest_stops s
      where s.id = stop_id and s.status = 'unlocked'
    )
  );

-- ---------------------------------------------------------------------------
-- State-machine RPCs. security definer: they bypass RLS/triggers and hold
-- every invariant in one transaction.
-- ---------------------------------------------------------------------------

-- draft -> active, unlocking stop 1. Only one active quest per user at a time
-- keeps the game legible.
create or replace function public.start_quest(p_quest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest public.quests%rowtype;
begin
  select * into v_quest
  from public.quests
  where id = p_quest_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'quest not found';
  end if;
  if v_quest.status <> 'draft' then
    raise exception 'quest is not startable (status: %)', v_quest.status;
  end if;
  if exists (
    select 1 from public.quests
    where user_id = auth.uid() and status = 'active' and id <> p_quest_id
  ) then
    raise exception 'finish or abandon your active quest first';
  end if;

  update public.quests
  set status = 'active', started_at = now()
  where id = p_quest_id;

  update public.quest_stops
  set status = 'unlocked'
  where quest_id = p_quest_id
    and position = (
      select min(position) from public.quest_stops
      where quest_id = p_quest_id
    );

  insert into public.interaction_events (user_id, event_type, payload)
  values (auth.uid(), 'quest_start', jsonb_build_object('quest_id', p_quest_id));
end;
$$;

-- Complete the currently-unlocked stop and unlock the next (or finish the
-- quest). p_require_media gates on captured media - the capture flow lands
-- in sprint 3, so callers pass false until then.
create or replace function public.complete_quest_stop(
  p_stop_id uuid,
  p_require_media boolean default false
)
returns table (quest_completed boolean, next_stop_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop public.quest_stops%rowtype;
  v_quest public.quests%rowtype;
  v_next public.quest_stops%rowtype;
begin
  select s.* into v_stop
  from public.quest_stops s
  where s.id = p_stop_id
  for update;

  if not found then
    raise exception 'stop not found';
  end if;

  select q.* into v_quest
  from public.quests q
  where q.id = v_stop.quest_id and q.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'quest not found';
  end if;
  if v_quest.status <> 'active' then
    raise exception 'quest is not active';
  end if;
  if v_stop.status <> 'unlocked' then
    raise exception 'stop is not the current one';
  end if;
  if p_require_media and not exists (
    select 1 from public.quest_stop_media where stop_id = p_stop_id
  ) then
    raise exception 'capture this stop before completing it';
  end if;

  update public.quest_stops
  set status = 'completed', completed_at = now()
  where id = p_stop_id;

  insert into public.interaction_events (user_id, event_type, place_id, payload)
  values (
    auth.uid(), 'stop_complete', v_stop.place_id,
    jsonb_build_object('quest_id', v_quest.id, 'stop_id', p_stop_id)
  );

  select s.* into v_next
  from public.quest_stops s
  where s.quest_id = v_quest.id and s.status = 'locked'
  order by s.position
  limit 1
  for update;

  if found then
    update public.quest_stops set status = 'unlocked' where id = v_next.id;
    return query select false, v_next.id;
  else
    update public.quests
    set status = 'completed', completed_at = now()
    where id = v_quest.id;
    insert into public.interaction_events (user_id, event_type, payload)
    values (
      auth.uid(), 'quest_complete', jsonb_build_object('quest_id', v_quest.id)
    );
    return query select true, null::uuid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learning taxonomy: quest + chat signals join the loop.
-- ---------------------------------------------------------------------------

alter table public.interaction_events
  drop constraint interaction_events_event_type_check;

alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click',
    'start', 'complete', 'bucket_add', 'story_view', 'dwell',
    'quest_start', 'stop_complete', 'quest_complete',
    'chat_pick_click', 'reel_share'
  ));

-- ---------------------------------------------------------------------------
-- quest-media: private bucket, owner-prefixed paths q/{user_id}/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('quest-media', 'quest-media', false)
on conflict (id) do nothing;

create policy "quest-media: owner read"
  on storage.objects for select
  using (
    bucket_id = 'quest-media'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_admin()
    )
  );

create policy "quest-media: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'quest-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "quest-media: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'quest-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
