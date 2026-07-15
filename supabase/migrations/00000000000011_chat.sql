-- Outsider pivot, part 2a: conversational discovery.
--
-- Chat threads persist so a conversation survives reloads and feeds the
-- learning loop. intent_state accumulates what the bot has already learned
-- in a thread (mood, budget, area...) so it never asks twice.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city text not null default 'delhi' references public.cities(slug),
  title text,
  intent_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_user_idx
  on public.chat_threads (user_id, updated_at desc);

alter table public.chat_threads enable row level security;

create policy "chat_threads: owner full access"
  on public.chat_threads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Structured picks attached to an assistant message:
  -- [{ slug, name, area, reason }]
  picks jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

alter table public.chat_messages enable row level security;

-- Select/insert only - a conversation is a record, not a wiki.
create policy "chat_messages: owner can read"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );

create policy "chat_messages: owner can insert"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );
