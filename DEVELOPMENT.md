# OutsiderMap — Project Plan & North Star

> The single source of truth for what OutsiderMap is, why it wins, how it's
> designed, and what we build next. This supersedes `PROJECT_PLAN.md` (kept for
> history). Update it as decisions land and work ships.
>
> _Last updated: 2026-06-28_

---

## 0. One sentence

> A city companion that learns who you are and gives you **one out-of-the-box
> answer** — for tonight, this weekend, or the version of yourself you're trying
> to become — across **places, experiences, and people**. Never a chain, never
> the obvious. Smarter every time you open it.

---

## 1. The thesis

**We sell confidence and taste, not listings.** Every incumbent — Google Maps,
Zomato, District, Instagram saves — optimizes for *comprehensiveness* and leaves
you paralyzed. OutsiderMap optimizes for *you*: it learns your taste from a quiz
and every tap after, then answers with one out-of-the-box place, experience, or
group of people.

**Why this is a company, not a feature:**

- **Two-sided data moat.** A private, per-user **taste graph** *and* a
  proprietary **anti-mainstream catalog** (aggregated for coverage, AI- and
  human-curated for taste). Google can out-aggregate us forever and still can't
  be us — their incentive is everything, ours is the right thing. Our bias *is*
  the product.
- **A wedge into something big.** Start as "where do I go right now," become the
  **operating system for a person's social and cultural life in a city**:
  places → experiences → people → belonging.
- **Retention is the game.** Discovery apps die when you find the place and
  leave. Our antidotes: a **learning loop** that visibly gets smarter, and a
  **proactive** surface that reaches out before you ask. Tool → habit.

**The honest risk:** this is a **cold-start, content-density, and trust**
business before it is an AI business. AI is *how* we deliver; curation +
behavioral data is *why* we win. We invest accordingly.

**North-star metric:** not DAU — **Confident Answer Accept Rate** (did you act on
the one answer?) and **Stretch Success Rate** (did a deliberate
out-of-comfort-zone pick land?). If the one-answer model doesn't beat a list, we
don't have a product. We measure this from day one.

---

## 2. The product — three concentric rings

Shipped in order. Each ring reuses the taste infrastructure of the one before.

1. **Places** _(built)_ — "where do I go right now." The free, habit-forming
   hook.
2. **Experiences** _(modeled, unseeded)_ — curated, story-format, **not on
   Google**. This is the brand and the thing worth paying for.
3. **People & belonging** _(not started, in scope)_ — taste-matched small-group
   experiences, "people with your taste are going to X," getting out of the
   comfort zone *on purpose*. The TAM-expansion story and the emotional payoff.

---

## 3. Design principles (non-negotiable)

1. **One answer, not ten.** We always have a point of view. A ranked list is a
   failure state, not the default.
2. **Anti-obvious by construction.** Chains and tourist-default places are
   structurally demoted — already enforced in `match_places` via `is_chain`.
   Extend to an **obviousness score**: popularity is a *penalty*, not a boost —
   the inverse of every other app's ranking.
3. **The adventurousness dial.** The profile carries an explicit *comfort ↔
   stretch* axis. Same user, different days. AI infers your default; you override
   per session ("surprise me" / "play it safe"). This makes "get out of your
   comfort zone if that's what you want" real instead of a slogan.
4. **Earn the right to be proactive.** We push only when confidence × timing ×
   receptivity are high. A bad nudge costs more trust than ten good reactive
   answers buy.
5. **Explain, don't justify.** Every pick ships with a *personal* streamed "why"
   ("because you went deep on X, it's a Tuesday, and you hate crowds").
   Transparency turns the taste profile into magic instead of surveillance.

---

## 4. Data strategy — the critical path

Today the catalog is one hand-written `data/places.delhi.json`. The vision needs
an **ingestion + curation pipeline**. This is the single biggest gap between idea
and product, and the gating constraint on retention.

> **Full technical design: [`docs/DATA_PIPELINE.md`](./docs/DATA_PIPELINE.md)** —
> schema (`source_records`, `ingest_candidates`), the connector contract, entity
> resolution, the AI curation classifier, the publish gate, the crowdsource loop,
> and a phased build plan.

**Decision: we go all-in on coverage.** Aggregate from District, BookMyShow /
Insider, Google, venue Instagrams, and everywhere else. Treat aggregated data as
**coverage and leads**; taste and publishability are enforced downstream. (Risk
note: ToS/scraping exposure is real — we move fast but isolate scraped *signal*
from first-party *published* content, and revisit as we scale. Recorded, not
blocking.)

**Pipeline architecture:**

```
connectors ─▶ source_records ─▶ normalize ─▶ entity-resolution / de-dup
   (per source, raw)                              │
                                                  ▼
                              enrich (geocode, hours, embed)
                                                  │
                                                  ▼
                       AI curation classifier (chain? obvious? story? vibe? for-whom?)
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                          reject / demote     human/AI vet        auto-publish
```

- **A. Connectors.** Pluggable per source, writing raw rows to `source_records`.
  Structured APIs where they exist (Google Places, ticketing/event APIs);
  crawlers for the rest. Each source is a lead generator, not a source of truth.
- **B. Entity resolution.** The same venue from four sources collapses to one
  `place`. De-dup on geo + name + fuzzy match.
- **C. The "is this OutsiderMap-worthy?" filter.** An LLM **curation classifier**
  scores every item: is-it-a-chain, obviousness, has-a-story, vibe tags,
  who-is-this-for. **Most aggregated inventory is rejected or demoted — that's
  the point.** Aggregation buys coverage; AI enforces taste at scale so curation
  doesn't bottleneck on humans.
- **D. Crowdsource loop (close it).** `/submit` exists but the loop is open.
  Make it: user suggests → AI pre-screens + enriches → light human vet →
  published → **suggester earns credit/reputation**. UGC + reputation = cheap
  density + a community flywheel; power curators become a supply *and* retention
  engine.
- **E. Freshness as a feature.** Events are perishable. Scheduled re-crawl +
  "happening tonight / this weekend" injection into Right Now. Stale inventory is
  worse than none.

---

## 5. AI / ML plan

Priority order = highest leverage first. The whole seed-stage stack rides on
**off-the-shelf LLMs + embeddings + Postgres/pgvector + a bandit policy.** No
custom training, no feature store, no multimodal pipelines yet — premature. Spend
saved effort on inventory and the loop.

**Keep (already correct):**

- **Embeddings + pgvector** for taste↔place matching — the retrieval substrate.
- **LLM `extract`** (quiz / free text → structured intent + profile) and
  **streamed `why`**.

**Add, in priority order:**

1. **Behavior-aware ranking.** Today: embedding cosine + LLM rerank — a great
   *cold-start* system that doesn't truly learn behavior yet.
   - *Now:* feed the LLM reranker behavioral signals (saves, completes, skips,
     dwell) as context. Half-built via `interaction_events` + `learned_signals`.
   - *Next (~10k+ interactions):* a **learning-to-rank / collaborative-filtering**
     re-scoring layer ("users whose taste vector is near yours loved X") — simple
     two-tower or matrix factorization on top of vector retrieval. **Don't build
     this before there's interaction volume; pre-volume the LLM *is* the ranker
     and beats a cold ML model.**
2. **Living taste embedding.** Continuously re-blend the quiz embedding with a
   behavior-derived embedding (`learned_signals` already gestures at this). The
   **profile page that visibly evolves** ("you're drifting toward quieter, older
   places") is the wow moment and the viral screenshot.
3. **Adventurousness / novelty model.** An explicit **explore vs. exploit**
   policy — a **contextual bandit** is the textbook fit. Serve the confident match
   (exploit) or a calculated stretch (explore), and *learn whether the stretch
   landed*. Great UX ("surprise me") and the mechanism that stops filter-bubble
   collapse. Genuinely novel for this category.
4. **People-matching (ring 3).** Same taste-vector infra applied to humans:
   "3 people with taste like yours are going Thursday." Taste-based social is
   less creepy and higher-signal than interest-checkbox social; the place
   embedding is ~80% of what's needed.
5. **Proactive trigger model.** Good nudge = confidence × timing × novelty ×
   receptivity history. Start rules-based, graduate to learned. This is the
   pull → push unlock.
6. **Content-generation assist (ops leverage).** LLMs draft experience stories,
   vibe tags, and editor notes from raw ingested data; a human approves. How a
   tiny team curates thousands of experiences. Internal force-multiplier — keep
   it off the hand-curated flagship voice.

---

## 6. Monetization

**Decision: monetize access and belonging, never the core answer.**

- **Free, forever:** the taste profile + the one confident Right Now answer. This
  is the habit-forming hook — never paywalled.
- **Premium:** curated **experiences** + **people/events** you can't get
  otherwise (the underground / belonging ring). You pay for access and curation,
  not for "more recommendations."
- Keeps invite-only scarcity intact and aligns price with the thing that's
  genuinely scarce.
- Payments via **Razorpay** (UPI / UPI Autopay — non-negotiable for Indian
  consumer subscriptions). Razorpay integration already scaffolded.

---

## 7. Growth — invite-only as a mechanic, not just a gate

- Each member gets **N invites**; track who invited whom (**taste lineage**).
  Scarcity + social proof = the cheapest acquisition we'll ever get. Build the
  **referral graph from day one.**
- The **visibly-smart profile** is the share surface — "here's OutsiderMap's read
  on me." Invite-only + an evolving profile = built-in virality if we design for
  it.

---

## 8. Roadmap (sequenced, with rationale)

| Horizon | What | Why now |
|---|---|---|
| **Now (finish Phase 1)** | Apply migrations to live DB; test API on live DB; run mobile on a device; **seed real experiences with stories** | The product can't be *felt* until inventory + a working device build exist. Nothing else matters first. |
| **Next** | **Data-ingestion pipeline v1** (1–2 connectors + curation classifier + crowdsource loop closed) | Inventory density is the gating constraint on retention. The core unlock. |
| **Next** | **Adventurousness dial + novelty/bandit serving** | Makes the central promise ("stretch when you want") real; differentiates from every list app. |
| **Then** | **Proactive layer** (earned push) + **freshness / "tonight" engine** | Converts tool → habit. The retention play. |
| **Then** | **People & belonging ring** (taste-based group experiences) | TAM expansion + the emotional payoff. |
| **Parallel, always** | Profile-evolution "wow" surface; **referral / invite graph**; north-star instrumentation | Compounding growth + proof the one-answer model beats a list. |

---

## 9. Architecture (as built)

- **Next.js 16 (App Router) on Vercel** — TypeScript, Tailwind v4, dark-only
  cinematic UI (Motion + react-three-fiber). Marketing site + `/join` +
  **HTTP API backend** (`src/app/api/*`) + the shared brain
  (`src/lib/{ai,now,taste,places}`).
- **Expo / React Native app** (`mobile/`) — own toolchain, talks to the API with
  a Supabase bearer token.
- **Supabase** — Postgres + Auth + Storage + RLS, **pgvector** for matching.
  Migrations auto-apply on merge to `main` via `.github/workflows/migrate.yml`.
- **Provider-agnostic AI layer** (`src/lib/ai/`) — server-only Anthropic/OpenAI
  adapters; OpenAI embeddings (1536-dim). `complete` / `stream` / `extract<T>`.

**Enforced conventions:** all AI calls server-side (`server-only`); RLS on every
table, default deny; `interaction_events` append-only (raw material for the
learning loop); service role only in trusted server code; design tokens live in
`globals.css` `@theme`.

---

## 10. Current build status

Phase 1 = an invite-only mobile app on the existing Next.js + Supabase backend:
reactive chat → one reasoned answer, a personalized feed, story-format
experiences, a bucket. The recommendation brain already existed; recent work
exposed it over HTTP and built the app on top.

| Area | State |
|---|---|
| Backend HTTP API | ✅ built · ⏳ not tested against live DB |
| DB schema (migrations 0006/0007) | ✅ written · ⏳ not applied to live DB |
| Expo mobile app | ✅ scaffolded + typechecks · ⏳ not run on a device |
| Social auth (Apple + Google) | ✅ coded · ⏳ needs credentials + dev build |
| Admin authoring + vetting UI | ❌ not built |
| Catalog content (experiences + stories) | ❌ not seeded |
| **Data-ingestion pipeline** | ❌ not built (Section 4) |
| **Adventurousness dial / bandit** | ❌ not built (Section 5.3) |
| **People & belonging ring** | ❌ not built (Section 2, ring 3) |
| Store readiness | ❌ not started |

**Done (PR #17):** bearer/cookie API auth + route handlers (`/api/now`,
`/api/now/why` stream, `/api/onboarding`, `/api/interactions`, `/api/feed`,
`/api/experiences`(+`/[slug]`), `/api/profile`); schema `0006_experiences`
(`places.kind`, `is_chain` enforced in `match_places`, `story` jsonb,
`experience-media` bucket, `saved_places.status`, richer `interaction_events`,
`profiles.personalization_enabled`) and `0007_membership` (waitlist vetting +
private bucket); onboarding anchors question (`QUIZ_VERSION` 2); mobile theme +
design system + screens (auth, onboarding, feed, chat + streamed why, experience
story, bucket, profile) + ConvergenceField; Apple + Google auth; placeholder
brand art. Baselines green: web `tsc`/`lint`/`build`, `mobile tsc`.

### Phase 1 — remaining

1. **Apply migrations to live Supabase** (merge runs migrate action / dispatch);
   confirm one-time `0001–0005` baseline repair.
2. **End-to-end API test** vs live DB — bearer scoping, 401s, rate-limit,
   `is_chain` exclusion.
3. **Run on a device** — 60fps, animations, haptics, story gestures, streamed
   why; polish.
4. **Social-auth credentials** — Apple provider in Supabase; Google OAuth
   clients + config; reversed iOS client id in `mobile/app.json`; dev client.
5. **Admin authoring gaps** — expose `kind`/`is_chain`/`story` in the place form;
   member-vetting queue UI; selfie capture in `/join`.
6. **Catalog content** — seed real non-chain experiences with `kind` + story
   media.
7. **Brand art + store prep** — Apple sign-in compliance, privacy policy +
   nutrition labels, pre-approved demo account, TestFlight / Play internal.

---

## 11. Decision log

| Date | Decision |
|---|---|
| 2026-06-26 | Pivot to mobile-first, invite-only "curated experiences." |
| 2026-06-28 | **People & belonging (ring 3) is in scope** — taste-matched social, built on the existing embedding infra. |
| 2026-06-28 | **Monetize access & belonging, never the core answer.** Free taste profile + one Right Now answer forever; premium = experiences + underground/people access. |
| 2026-06-28 | **Go all-in on data aggregation** (District, BMS/Insider, Google, Instagram, everywhere). Aggregated data = coverage/leads; taste enforced by the AI curation classifier; scraped signal isolated from published content. |
| 2026-06-28 | **AI/ML sequencing:** LLM-as-ranker now; behavior-aware LTR/CF only after interaction volume; add a contextual bandit for the adventurousness/novelty dial; people-matching reuses the place embedding. |
| 2026-06-28 | **North-star metric = Confident Answer Accept Rate + Stretch Success Rate**, not DAU. |
| 2026-06-28 | **Invite-only is a growth mechanic** — N invites/member, referral/taste-lineage graph from day one. |

---

## 12. Running it

- **Web/API:** `npm install && npm run dev` (root). Checks: `npx tsc --noEmit`,
  `npm run lint`, `npm run build`.
- **Mobile:** `cd mobile && npm install && npx expo start` (email OTP works in
  Expo Go; Apple/Google need `npx expo run:ios` — see `mobile/README.md`).
- **DB:** migrations auto-apply on merge to `main`; manual `npx supabase db push`.

---

## 13. Open questions

1. **Connector priority** — which source do we build first (District for events?
   Google Places for coverage? Instagram for the underground edge)?
2. **Content pipeline ownership** — who owns story photo/video/narrative per
   experience as volume scales?
3. **Ring-3 timing** — do we tease people/belonging during Phase 1 to test
   demand, or hold until experiences are dense?
