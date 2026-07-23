-- Market Intelligence, part 3: the completion-loop signal (#68).
--
-- After a market run, a member reports back what they bought and paid. That
-- contribution logs an interaction_event so it feeds the learning loop like
-- any other signal - so the taxonomy needs a 'market_report' type. Same
-- drop-and-re-add pattern the quests migration used to extend it.

alter table public.interaction_events
  drop constraint interaction_events_event_type_check;

alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click',
    'start', 'complete', 'bucket_add', 'story_view', 'dwell',
    'quest_start', 'stop_complete', 'quest_complete',
    'chat_pick_click', 'reel_share', 'market_report'
  ));
