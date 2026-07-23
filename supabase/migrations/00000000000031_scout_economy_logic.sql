-- Scout Economy, part 2: the logic (#107-#113). Fills the RPC seam from 0030
-- with the fraud-resistant contribution + verification machinery.
--
-- Everything money-like transitions only inside these security-definer RPCs
-- (single transaction, invariants checked). Independence + geo + anomaly are
-- computed server-side and stored; a confirmation that fails any of them never
-- counts toward quorum. Points are provisional (escrow) until an admin audit
-- confirms them; a contradicting quorum or audit claws them back with a strike.
--
-- Tuning constants live as literals here (documented inline); ops move the
-- redemption catalog via reward_thresholds without a deploy.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- #107: reputation. curator_score is earned server-side; submitted_by links a
-- catalog place back to the scout who listed it (so verify bounties know the
-- lister for the independence check).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column curator_score int not null default 0;

alter table public.places
  add column submitted_by uuid references public.profiles(id) on delete set null;

-- anomaly verdict stored alongside geo/independence (computed at submit time).
alter table public.quest_confirmations
  add column anomaly boolean not null default false;

-- Scout events join the learning taxonomy.
alter table public.interaction_events
  drop constraint interaction_events_event_type_check;
alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click',
    'start', 'complete', 'bucket_add', 'story_view', 'dwell',
    'quest_start', 'stop_complete', 'quest_complete',
    'chat_pick_click', 'reel_share', 'market_report',
    'bounty_created', 'confirmation_submitted', 'spot_published',
    'spot_rejected', 'scout_warning', 'points_clawback'
  ));

-- Great-circle distance in metres (no PostGIS dependency).
create or replace function public.geo_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Eligibility to validate: reputation + account age + not restricted/banned.
-- security definer so it can read the admin-only user_trust; velocity is a
-- separate per-submit check inside submit_confirmation.
create or replace function public.can_validate(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select curator_score from public.profiles where id = p_user), 0) >= 3
    and coalesce((select created_at from public.profiles where id = p_user), now())
        <= now() - interval '3 days'
    and not exists (
      select 1 from public.user_trust ut
      where ut.user_id = p_user
        and (ut.banned_at is not null or ut.tier = 'restricted')
    );
$$;

-- ---------------------------------------------------------------------------
-- #108: the ledger. Balance is derived; status transitions happen here only.
-- (0030's trigger keeps clients out; these run as a privileged role.)
-- ---------------------------------------------------------------------------

create or replace function public.points_balance(p_user uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(delta), 0)::int
  from public.points_ledger
  where user_id = p_user and status = 'confirmed';
$$;

create or replace function public.points_escrowed(p_user uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(delta), 0)::int
  from public.points_ledger
  where user_id = p_user and status = 'escrow';
$$;

create or replace function public.award_points_escrow(
  p_user_id uuid,
  p_delta int,
  p_reason text,
  p_ref_type text default null,
  p_ref_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, status)
  values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id, 'escrow')
  returning id into v_id;
  return v_id;
end;
$$;

-- escrow -> confirmed for every escrow row tied to a ref (admin audit clears
-- the provisional award).
create or replace function public.confirm_points(
  p_ref_type text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.points_ledger
  set status = 'confirmed'
  where ref_type = p_ref_type and ref_id = p_ref_id and status = 'escrow';
end;
$$;

-- Reverse points for a ref (escrow or confirmed) and strike the affected users
-- via #70. Flipping status to clawed_back removes the rows from the derived
-- balance; we log an append-only clawback event rather than double-subtract.
create or replace function public.clawback_points(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text default 'clawback'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct user_id from public.points_ledger
    where ref_type = p_ref_type and ref_id = p_ref_id
      and status in ('escrow', 'confirmed')
  loop
    insert into public.user_trust (user_id, strike_count, updated_at)
    values (v_user, 1, now())
    on conflict (user_id) do update
      set strike_count = public.user_trust.strike_count + 1,
          updated_at = now();
    insert into public.interaction_events (user_id, event_type, payload)
    values (v_user, 'points_clawback',
      jsonb_build_object('ref_type', p_ref_type, 'ref_id', p_ref_id, 'reason', p_reason));
  end loop;

  update public.points_ledger
  set status = 'clawed_back'
  where ref_type = p_ref_type and ref_id = p_ref_id
    and status in ('escrow', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- #109: reward thresholds + grants. Catalog is data-driven; grants are
-- idempotent per (user, threshold).
-- ---------------------------------------------------------------------------

insert into public.reward_thresholds (id, name, metric, threshold, "grant", is_active) values
  ('scout_15',      'Verified Scout',   'verified_spots', 15,  '{"badge":"verified_scout","invites":3}'::jsonb, true),
  ('validator_25',  'Trusted Validator','confirmations',  25,  '{"badge":"trusted_validator"}'::jsonb,          true),
  ('points_500',    'Cartographer',     'points',         500, '{"badge":"cartographer","premium_days":30}'::jsonb, true)
on conflict (id) do nothing;

create or replace function public.grant_threshold(
  p_user_id uuid,
  p_threshold_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reward_grants (user_id, threshold_id)
  values (p_user_id, p_threshold_id)
  on conflict (user_id, threshold_id) do nothing;
end;
$$;

-- Metric snapshot for a member, used by threshold detection.
create or replace function public.scout_metric(p_user uuid, p_metric text)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select case p_metric
    when 'verified_spots' then
      (select count(*) from public.bounty_quests
        where lister_id = p_user and status = 'published')::int
    when 'confirmations' then
      (select count(*) from public.quest_confirmations
        where validator_id = p_user and geo_ok and independence_ok and not anomaly)::int
    when 'points' then public.points_balance(p_user)
    else 0
  end;
$$;

-- Grant any active threshold the member has now crossed.
create or replace function public.check_reward_thresholds(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.reward_thresholds%rowtype;
begin
  for t in select * from public.reward_thresholds where is_active loop
    if public.scout_metric(p_user, t.metric) >= t.threshold then
      perform public.grant_threshold(p_user, t.id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- #110: bounty engine. A verify bounty is spawned from an unpublished
-- submitted place; discover bounties come from admin tips / area gaps.
-- ---------------------------------------------------------------------------

create or replace function public.create_bounty(
  p_type text,
  p_submission_id uuid default null,
  p_quest_id uuid default null,
  p_area text default null,
  p_city text default null,
  p_lister_id uuid default null,
  p_bounty_points int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lister uuid := p_lister_id;
  v_area text := p_area;
  v_city text := p_city;
begin
  if p_type not in ('verify', 'discover') then
    raise exception 'bad bounty type: %', p_type;
  end if;

  -- verify: derive lister/area/city from the submitted place.
  if p_type = 'verify' then
    if p_submission_id is null then
      raise exception 'verify bounty needs a submission (place)';
    end if;
    select coalesce(v_lister, pl.submitted_by), coalesce(v_area, pl.area), coalesce(v_city, pl.city)
    into v_lister, v_area, v_city
    from public.places pl where pl.id = p_submission_id;
  end if;

  insert into public.bounty_quests
    (quest_id, type, submission_id, area, city, lister_id, bounty_points)
  values
    (p_quest_id, p_type, p_submission_id, v_area, v_city, v_lister, greatest(p_bounty_points, 0))
  returning id into v_id;

  insert into public.interaction_events (user_id, event_type, place_id, payload)
  values (coalesce(v_lister, auth.uid()), 'bounty_created', p_submission_id,
    jsonb_build_object('bounty_id', v_id, 'type', p_type));

  return v_id;
end;
$$;

-- Convenience: spawn a verify bounty when a scout submits a place.
create or replace function public.spawn_verify_bounty(
  p_place_id uuid,
  p_bounty_points int default 20
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_bounty('verify', p_place_id, null, null, null, null, p_bounty_points);
end;
$$;

-- ---------------------------------------------------------------------------
-- #111/#112: submit a confirmation. geo_ok, independence_ok, and anomaly are
-- all computed here (never trusted from the client); the vote is stored and
-- the bounty re-aggregated. Live-capture + moderation screening happen in the
-- API layer before this is called; this enforces the structural invariants.
-- ---------------------------------------------------------------------------

create or replace function public.submit_confirmation(
  p_bounty_id uuid,
  p_verdict text,
  p_quality smallint default null,
  p_media jsonb default null,
  p_captured_lat double precision default null,
  p_captured_lng double precision default null,
  p_captured_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bounty public.bounty_quests%rowtype;
  v_place public.places%rowtype;
  v_geo_ok boolean := false;
  v_indep_ok boolean := true;
  v_anomaly boolean := false;
  v_dist double precision;
  v_prev record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_verdict not in ('exists', 'not_exists') then
    raise exception 'bad verdict: %', p_verdict;
  end if;

  select * into v_bounty from public.bounty_quests where id = p_bounty_id for update;
  if not found then
    raise exception 'bounty not found';
  end if;
  if v_bounty.status not in ('open', 'resolving') then
    raise exception 'bounty is not open';
  end if;
  if v_bounty.lister_id = v_uid then
    raise exception 'cannot validate your own submission';
  end if;
  if not public.can_validate(v_uid) then
    raise exception 'not eligible to validate yet';
  end if;

  -- Velocity: cap confirmations per rolling 24h (sybil / batch defence).
  if (select count(*) from public.quest_confirmations
      where validator_id = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'confirmation velocity limit reached';
  end if;

  -- Independence: no accepted friendship (either direction) or follow edge.
  if v_bounty.lister_id is not null then
    v_indep_ok := not (
      exists (select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester = v_uid and f.addressee = v_bounty.lister_id)
            or (f.requester = v_bounty.lister_id and f.addressee = v_uid)))
      or exists (select 1 from public.follows fo
        where (fo.follower = v_uid and fo.followee = v_bounty.lister_id)
           or (fo.follower = v_bounty.lister_id and fo.followee = v_uid))
    );
  end if;

  -- Geo: captured location within radius of the submitted place's coords.
  if v_bounty.submission_id is not null then
    select * into v_place from public.places where id = v_bounty.submission_id;
    if found and v_place.lat is not null and v_place.lng is not null
       and p_captured_lat is not null and p_captured_lng is not null then
      v_dist := public.geo_distance_m(v_place.lat, v_place.lng, p_captured_lat, p_captured_lng);
      v_geo_ok := v_dist <= 150;
    end if;
  end if;

  -- Anomaly: stale/absent capture timestamp (live capture must be recent), or
  -- impossible travel speed from this validator's previous confirmation.
  if p_captured_at is null
     or p_captured_at > now() + interval '2 minutes'
     or p_captured_at < now() - interval '20 minutes' then
    v_anomaly := true;
  end if;

  select captured_at, captured_lat, captured_lng into v_prev
  from public.quest_confirmations
  where validator_id = v_uid and captured_at is not null
    and captured_lat is not null and captured_lng is not null
  order by captured_at desc limit 1;
  if v_prev.captured_at is not null and p_captured_at is not null
     and p_captured_lat is not null and p_captured_lng is not null then
    declare
      v_hours double precision := abs(extract(epoch from (p_captured_at - v_prev.captured_at))) / 3600.0;
      v_km double precision :=
        public.geo_distance_m(v_prev.captured_lat, v_prev.captured_lng, p_captured_lat, p_captured_lng) / 1000.0;
    begin
      if v_hours > 0 and (v_km / greatest(v_hours, 0.0001)) > 120 then
        v_anomaly := true;
      end if;
    end;
  end if;

  insert into public.quest_confirmations
    (bounty_id, validator_id, verdict, quality, media,
     captured_lat, captured_lng, captured_at, geo_ok, independence_ok, anomaly)
  values
    (p_bounty_id, v_uid, p_verdict, p_quality, p_media,
     p_captured_lat, p_captured_lng, p_captured_at, v_geo_ok, v_indep_ok, v_anomaly)
  returning id into v_id;

  insert into public.interaction_events (user_id, event_type, place_id, payload)
  values (v_uid, 'confirmation_submitted', v_bounty.submission_id,
    jsonb_build_object('bounty_id', p_bounty_id, 'verdict', p_verdict,
      'geo_ok', v_geo_ok, 'independence_ok', v_indep_ok, 'anomaly', v_anomaly));

  perform public.aggregate_verdict(p_bounty_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- #113: aggregate verdicts -> publish / reject / hold, escrow the payout.
-- Only geo_ok + independent + non-anomalous confirmations count toward quorum;
-- anomalies short of quorum park the bounty in 'resolving' for admin review.
-- ---------------------------------------------------------------------------

create or replace function public.aggregate_verdict(p_bounty_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounty public.bounty_quests%rowtype;
  v_exists int;
  v_reject int;
  v_anomalies int;
  c record;
begin
  select * into v_bounty from public.bounty_quests where id = p_bounty_id for update;
  if not found or v_bounty.status not in ('open', 'resolving') then
    return;
  end if;

  select
    count(*) filter (where verdict = 'exists' and geo_ok and independence_ok and not anomaly),
    count(*) filter (where verdict = 'not_exists' and geo_ok and independence_ok and not anomaly),
    count(*) filter (where anomaly)
  into v_exists, v_reject, v_anomalies
  from public.quest_confirmations where bounty_id = p_bounty_id;

  if v_exists >= v_bounty.quorum_needed then
    -- PUBLISH: flip the place live, escrow the lister's bounty + each valid
    -- confirmer's reward, bump reputations, detect thresholds.
    update public.bounty_quests set status = 'published' where id = p_bounty_id;
    if v_bounty.submission_id is not null then
      update public.places set is_published = true, updated_at = now()
      where id = v_bounty.submission_id;
    end if;

    if v_bounty.lister_id is not null then
      perform public.award_points_escrow(
        v_bounty.lister_id, greatest(v_bounty.bounty_points, 0),
        'spot_verified', 'bounty', p_bounty_id);
      update public.profiles set curator_score = curator_score + 5
        where id = v_bounty.lister_id;
      perform public.check_reward_thresholds(v_bounty.lister_id);
      insert into public.interaction_events (user_id, event_type, place_id, payload)
      values (v_bounty.lister_id, 'spot_published', v_bounty.submission_id,
        jsonb_build_object('bounty_id', p_bounty_id));
    end if;

    for c in
      select distinct validator_id from public.quest_confirmations
      where bounty_id = p_bounty_id and geo_ok and independence_ok and not anomaly
    loop
      perform public.award_points_escrow(c.validator_id, 10, 'confirmation', 'bounty', p_bounty_id);
      update public.profiles set curator_score = curator_score + 2 where id = c.validator_id;
      perform public.check_reward_thresholds(c.validator_id);
    end loop;

  elsif v_reject >= v_bounty.quorum_needed_reject then
    -- REJECT: warn the lister (appealable via #70 - no auto-strike), reward
    -- the confirmers who did the legwork.
    update public.bounty_quests set status = 'rejected' where id = p_bounty_id;
    if v_bounty.lister_id is not null then
      insert into public.interaction_events (user_id, event_type, place_id, payload)
      values (v_bounty.lister_id, 'scout_warning', v_bounty.submission_id,
        jsonb_build_object('bounty_id', p_bounty_id, 'reason', 'quorum_not_exists', 'appealable', true));
    end if;
    for c in
      select distinct validator_id from public.quest_confirmations
      where bounty_id = p_bounty_id and geo_ok and independence_ok and not anomaly
    loop
      perform public.award_points_escrow(c.validator_id, 10, 'confirmation', 'bounty', p_bounty_id);
      perform public.check_reward_thresholds(c.validator_id);
    end loop;

  elsif v_anomalies > 0 and v_bounty.status = 'open' then
    -- Not enough clean votes to resolve, but anomalies present: hold for admin.
    update public.bounty_quests set status = 'resolving' where id = p_bounty_id;
  end if;
end;
$$;
