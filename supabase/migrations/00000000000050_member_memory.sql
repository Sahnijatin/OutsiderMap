-- Durable member memory: the facts a tag histogram cannot hold.
--
-- Everything the concierge knows today is either a quiz answer frozen at
-- onboarding or a nightly aggregate of vibe tags. Both are statistics. Neither
-- can hold "vegetarian", "hates rooftops", "always with my partner", or "the
-- real budget is 800 a head" - and those are exactly the things a member says
-- once, in passing, and expects never to have to say again. Today they are
-- forgotten the moment the thread is: chat history is capped at 20 messages of
-- one thread and nothing survives a new one.
--
-- Scope, deliberately narrow: durable facts a member stated about themselves.
-- Not moods ("want biryani tonight" is the ask, not a fact), not taste that
-- learned_signals already counts better, and nothing the concierge inferred on
-- its own - an invented memory is worse than no memory, because the member
-- cannot tell where it came from.

create table public.member_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- A closed set on purpose. An open `kind` degrades into freeform tagging and
  -- the block loses the one thing that makes it safe to render: knowing which
  -- rows are hard constraints and which are colour.
  kind text not null check (kind in (
    'constraint',  -- must not be broken: diet, alcohol, accessibility, allergy
    'dislike',     -- soft: hates rooftops, cannot stand loud music
    'company',     -- who they actually go out with
    'occasion',    -- something recurring: Friday date night, Sunday lunch
    'budget',      -- what they really spend, as opposed to the band they picked
    'access'       -- how they get around: no car, metro only, always drives
  )),

  -- Short and third-person by convention (enforced in the extractor, not here).
  -- Long enough to be a fact, short enough that six of them still fit in a
  -- prompt that has to be affordable on every single turn.
  text text not null check (char_length(btrim(text)) between 3 and 120),

  -- 0.9 stated outright, 0.6 strongly implied. Inference does not get written.
  confidence real not null default 0.6 check (confidence > 0 and confidence <= 1),

  -- Which message produced this, so a member asking "why do you think that?"
  -- can be answered from the record rather than guessed at.
  -- on delete set null: deleting a conversation must not delete what was
  -- learned in it, or clearing history would silently reset the profile.
  source_message_id uuid references public.chat_messages(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- For facts that are true now and won't be later ("visiting from Bombay this
  -- week"). Null means it does not expire on its own. Without this, temporary
  -- circumstances become permanent beliefs, which is how a memory system starts
  -- feeling haunted rather than attentive.
  expires_at timestamptz
);

-- The read path: most confident first, freshest to break ties.
create index member_memory_user_idx
  on public.member_memory (user_id, confidence desc, updated_at desc);

-- One row per fact. The extractor also dedupes against what it is shown, but
-- two turns can race, and a profile that says "vegetarian" three times reads
-- as broken. Normalized so casing and stray whitespace cannot slip a duplicate
-- past it.
create unique index member_memory_unique_fact
  on public.member_memory (user_id, kind, lower(btrim(text)));

alter table public.member_memory enable row level security;

-- Readable and deletable by the member, written only by the service role.
--
-- This mirrors taste_profiles, where learned columns are recomputed server-side
-- and not owner-writable: the row is a record of what the system believes, so
-- letting it be edited in place would make it evidence of nothing. Delete is
-- the deliberate exception - being able to say "forget that" is the whole
-- consent posture for a feature that remembers things about you, and
-- personalization_enabled already establishes it.
create policy "member_memory: owner can read"
  on public.member_memory for select
  using (user_id = auth.uid());

create policy "member_memory: owner can delete"
  on public.member_memory for delete
  using (user_id = auth.uid());
