-- Scout Economy, part 3: the follow-ups from #114.
--
-- Three things the epic left for a cold app to grow into:
--   1. Per-area validator DENSITY instrumentation, so we can see where
--      independent quorums can't form yet.
--   2. An admin-verification FALLBACK that resolves bounties where density is
--      thin -- with every fallback logged (no silent caps), density snapshot
--      included, so the degradation is measurable rather than invisible.
--   3. A member LEADERBOARD read seam (reputation is modelled but surfaced
--      nowhere yet).
--
-- Same rule as 0030/0031: money-like state (points, verdicts, publish flips)
-- only ever transitions inside a security-definer RPC, single transaction,
-- invariants checked. The admin fallback mirrors aggregate_verdict's payout
-- side effects exactly so a hand-resolved bounty and a quorum-resolved one are
-- indistinguishable downstream.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- scout_verification_audit: an append-only record of every admin fallback
-- resolution. Captures who decided, the verdict, and the density snapshot at
-- decision time so "we fell back to admin verification here" is queryable, not
-- folklore. Written only by admin_resolve_bounty (security definer); admins
-- read it, no client write policy (default-deny).
-- ---------------------------------------------------------------------------

create table public.scout_verification_audit (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounty_quests(id) on delete cascade,
  admin_id uuid references public.profiles(id) on delete set null,
  decision text not null check (decision in ('publish', 'reject')),
  -- eligible-validator coverage for the bounty's city at the moment we fell
  -- back. Low numbers are the whole point: they show the fallback earning its
  -- keep in thin areas.
  active_validators int,
  note text,
  created_at timestamptz not null default now()
);
create index scout_verification_audit_created_idx
  on public.scout_verification_audit (created_at desc);
create index scout_verification_audit_bounty_idx
  on public.scout_verification_audit (bounty_id);

alter table public.scout_verification_audit enable row level security;

create policy "scout_verification_audit: admin can read"
  on public.scout_verification_audit for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- area_validator_density: eligible-validator coverage per city. A city is
-- "thin" when it can't muster enough independent, eligible validators to form
-- the default publish quorum (2) -- exactly the cold-start case where a bounty
-- would otherwise hang open forever. active_validators counts distinct
-- validators who have confirmed in that city AND still pass can_validate today.
--
-- Admin-only (instrumentation, not member-facing). Callers use their own
-- session (auth.uid() = the admin) so is_admin() resolves; the security-definer
-- envelope is only so it can read the admin-scoped tables the count touches.
-- ---------------------------------------------------------------------------

create or replace function public.area_validator_density(p_city text default null)
returns table (
  city text,
  open_bounties int,
  active_validators int,
  thin boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select
      b.city,
      -- distinct: the left join to confirmations fans out bounty rows.
      count(distinct b.id) filter (where b.status in ('open', 'resolving'))::int,
      count(distinct c.validator_id) filter (where public.can_validate(c.validator_id))::int,
      (count(distinct c.validator_id) filter (where public.can_validate(c.validator_id)) < 2)
    from public.bounty_quests b
    left join public.quest_confirmations c on c.bounty_id = b.id
    where b.city is not null
      and (p_city is null or b.city = p_city)
    group by b.city
    order by
      count(distinct b.id) filter (where b.status in ('open', 'resolving')) desc,
      b.city;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_resolve_bounty: the density fallback. Where an independent quorum can't
-- form, an admin resolves the bounty by hand. Publish/reject side effects
-- mirror aggregate_verdict exactly (escrow the lister's payout + reputation on
-- publish, warn appealably on reject, reward any clean confirmers who did show
-- up), so nothing downstream can tell a hand-resolved bounty from a quorum one.
-- Every call is logged to scout_verification_audit with the density snapshot.
-- ---------------------------------------------------------------------------

create or replace function public.admin_resolve_bounty(
  p_bounty_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounty public.bounty_quests%rowtype;
  v_active int;
  c record;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_decision not in ('publish', 'reject') then
    raise exception 'bad decision: %', p_decision;
  end if;

  select * into v_bounty from public.bounty_quests where id = p_bounty_id for update;
  if not found then
    raise exception 'bounty not found';
  end if;
  if v_bounty.status not in ('open', 'resolving') then
    raise exception 'bounty already resolved';
  end if;

  -- Density snapshot for the audit trail (eligible validators active in this
  -- city). Computed here so the log records *why* the fallback was reasonable.
  select count(distinct c2.validator_id) filter (where public.can_validate(c2.validator_id))
  into v_active
  from public.bounty_quests b2
  left join public.quest_confirmations c2 on c2.bounty_id = b2.id
  where b2.city is not distinct from v_bounty.city;

  if p_decision = 'publish' then
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
        jsonb_build_object('bounty_id', p_bounty_id, 'admin_verified', true));
    end if;

    -- Reward any clean confirmations that did land (a thin area may still have
    -- one honest validator short of quorum).
    for c in
      select distinct validator_id from public.quest_confirmations
      where bounty_id = p_bounty_id and geo_ok and independence_ok and not anomaly
    loop
      perform public.award_points_escrow(c.validator_id, 10, 'confirmation', 'bounty', p_bounty_id);
      update public.profiles set curator_score = curator_score + 2 where id = c.validator_id;
      perform public.check_reward_thresholds(c.validator_id);
    end loop;

  else -- reject
    update public.bounty_quests set status = 'rejected' where id = p_bounty_id;
    if v_bounty.lister_id is not null then
      insert into public.interaction_events (user_id, event_type, place_id, payload)
      values (v_bounty.lister_id, 'scout_warning', v_bounty.submission_id,
        jsonb_build_object('bounty_id', p_bounty_id, 'reason', 'admin_reject',
          'appealable', true, 'admin_verified', true));
    end if;
    for c in
      select distinct validator_id from public.quest_confirmations
      where bounty_id = p_bounty_id and geo_ok and independence_ok and not anomaly
    loop
      perform public.award_points_escrow(c.validator_id, 10, 'confirmation', 'bounty', p_bounty_id);
      perform public.check_reward_thresholds(c.validator_id);
    end loop;
  end if;

  insert into public.scout_verification_audit (bounty_id, admin_id, decision, active_validators, note)
  values (p_bounty_id, auth.uid(), p_decision, v_active, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_create_discover_bounty: admin-gated seam over create_bounty for the
-- 'discover' type (an admin tip / area gap -- no submitted place yet). Keeps
-- bounty creation admin-only at the DB layer, not just the UI.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_discover_bounty(
  p_area text,
  p_city text,
  p_bounty_points int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if coalesce(p_city, '') = '' then
    raise exception 'discover bounty needs a city';
  end if;
  return public.create_bounty(
    'discover', null, null, nullif(p_area, ''), p_city, null, greatest(coalesce(p_bounty_points, 0), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- scout_leaderboard: top curators by reputation. profiles is owner-or-admin
-- read, so a member can't build this from the client -- this security-definer
-- seam returns only the public-facing reputation columns (name, avatar, score,
-- verified spots), never anything private. Signed-in members only.
-- ---------------------------------------------------------------------------

create or replace function public.scout_leaderboard(p_limit int default 20)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  curator_score int,
  verified_spots int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      p.id,
      p.display_name,
      p.avatar_url,
      p.curator_score,
      (select count(*)::int from public.bounty_quests bq
        where bq.lister_id = p.id and bq.status = 'published')
    from public.profiles p
    where p.curator_score > 0
    order by p.curator_score desc, p.id
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;
