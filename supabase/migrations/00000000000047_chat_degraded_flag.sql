-- A degraded chat turn (keyword fallback while the model is unreachable) is
-- labeled honestly in the live stream; persist the flag so the label survives
-- a thread reload instead of the answer quietly passing as personalized.

alter table public.chat_messages
  add column if not exists degraded boolean not null default false;
