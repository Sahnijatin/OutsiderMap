-- Social Feed, part 7: the rest of the activity triggers (sub-issue #78).
--
-- #75 added activity_events + the reaction/comment triggers. This adds the
-- follow notification and the quest-completion fan-out (a completed quest is
-- news to the member's followers), so the Activity tab shows follow / like /
-- want_to_go / comment / quest_complete. Reading surface is the /api/activity
-- route; push delivery stays deferred.

set check_function_bodies = off;

-- A new follow notifies the followee.
create or replace function public.tg_activity_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (recipient_id, actor_id, type)
  values (new.followee, new.follower, 'follow');
  return new;
end;
$$;

create trigger tg_activity_follow
  after insert on public.follows
  for each row execute function public.tg_activity_follow();

-- Completing a quest fans out to the member's followers (never themselves).
create or replace function public.tg_activity_quest_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.activity_events (recipient_id, actor_id, type)
    select f.follower, new.user_id, 'quest_complete'
    from public.follows f
    where f.followee = new.user_id;
  end if;
  return new;
end;
$$;

create trigger tg_activity_quest_complete
  after update on public.quests
  for each row execute function public.tg_activity_quest_complete();
