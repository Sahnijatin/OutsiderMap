-- Remove the premium/free tier entirely: the answer is never paywalled.
-- Monetization moves to the scout economy (points now, merchant-funded
-- rewards later). Sequencing matters: handle_new_user first (or signups
-- break), then the events policy swap in the same transaction, then the
-- drops.

-- 1. Recreate handle_new_user without the subscriptions insert.
--    (Latest prior definition: 00000000000009_identity_cities.sql.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, outsider_number)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    nextval('public.outsider_number_seq')
  );
  return new;
end;
$$;

-- 2. The teaser surface goes with the tier.
drop function public.event_teasers(int);

-- 3. Published events are readable by everyone, full stop.
drop policy "events: published readable by tier" on public.events;

create policy "events: published readable by everyone"
  on public.events for select
  using (is_published = true or public.is_admin());

alter table public.events drop column required_tier;

drop function public.is_premium();

drop table public.subscriptions;

-- 4. The flagship 500-point reward pays invites, not premium days.
update public.reward_thresholds
set "grant" = '{"badge":"cartographer","invites":5}'::jsonb
where id = 'points_500';
