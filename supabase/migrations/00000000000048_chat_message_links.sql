-- A chat turn that builds a plan or market run needs a durable pointer to it:
-- the live stream carries planId / marketRunId to the client, but nothing was
-- persisted, so the "View plan" affordance vanished on thread reload - and a
-- reply saying "it's saved and trackable" with nothing to tap reads as the
-- bot making things up.
--
-- on delete set null: deleting a quest/run must not delete the conversation
-- that created it - the bubble just loses its button.

alter table public.chat_messages
  add column if not exists plan_id uuid references public.quests(id) on delete set null,
  add column if not exists market_run_id uuid references public.market_runs(id) on delete set null;
