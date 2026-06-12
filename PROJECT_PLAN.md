# OutsiderMap — Project Plan

> The durable product + technical plan for the ground-up rebuild. Update this
> document as decisions change; it is the single source of truth.

## 1. The Problem

People hit **decision paralysis at the moment of intent**. You know your mood,
your craving, your energy level — "it's 3am and I want X" — but Google and
ChatGPT are too vast and don't know *you*. The result: overwhelm, defaulting to
the same three places, or staying home. The same failure repeats in a new city,
where you have zero local context.

## 2. The Product

OutsiderMap builds a **personal taste profile** for every user and uses it to
collapse ten thousand options into **one confident, personalized answer**.

- An onboarding questionnaire creates the initial profile.
- Every interaction afterward — query phrasing, saves, skips, ratings,
  time-of-day patterns — refines it continuously.
- The profile is stored as structured preferences + an LLM-written taste
  summary + an embedding used for matching against places and events.

Delhi first. Other Indian cities later.

### Product pillars

| Pillar | Tier | What it is |
|---|---|---|
| **Taste Profile** | core | Onboarding quiz → initial profile; continuous learning from behavior. The asset everything else runs on. |
| **Right Now mode** | free | Natural-language ask ("it's 3am, I want…") → exactly where to go and what to do, with a personalized streamed "why". |
| **Weekend Planner** | premium | AI plans the entire Fri–Sun around your profile; editable, saveable. |
| **Underground access** | premium | Curated events, parties, and locations not on Google. Teased (blurred/locked) to free users as the conversion driver. |
| **Cinematic UI** | core | Minimal, dark, motion-rich, 3D moments. The design IS the brand. |

### Monetization

Free tier: Right Now recommendations. Premium subscription: weekend planning +
underground access. Payments via **Razorpay** (UPI + UPI Autopay mandates are
non-negotiable for Indian consumer subscriptions; Stripe India onboarding is
restricted).

## 3. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) on Vercel | Server components; route handlers keep all AI keys server-side. |
| Styling | Tailwind CSS v4 | CSS-first `@theme` tokens in `src/app/globals.css` — one token source for DOM, Motion, and R3F. |
| Motion | `motion` (framer-motion successor) | Shared variants in `src/components/motion/primitives.ts`. |
| 3D | react-three-fiber + drei | Always loaded via `next/dynamic` with `ssr: false`. |
| Database | Supabase (Postgres + Auth + Storage + RLS) | pgvector for taste/place matching. Schema: `supabase/migrations/`. |
| AI | Provider-agnostic layer in `src/lib/ai/` | Adapters for Anthropic + OpenAI; selected via `AI_PROVIDER` env. Embeddings are a separate interface (OpenAI `text-embedding-3-small`, 1536 dims). |
| Payments | Razorpay Subscriptions + webhooks | Phase 4. |

### Conventions (enforced)

- **All AI calls are server-side.** Every file in `src/lib/ai/` imports
  `server-only` — importing it from a client component fails the build.
- **RLS on every table, default deny.** Vector similarity runs through the
  `match_places` security-definer function; embeddings never reach clients.
- **`interaction_events` is append-only** (no update/delete policies). It is
  the raw material for the learning loop — log from day one.
- **Service role only in trusted server code** (`src/lib/supabase/admin.ts`):
  webhooks, learned-signal recompute, seeding.
- **Design tokens live in `globals.css` `@theme`** — never hardcode colors in
  components.

### AI layer contract (`src/lib/ai/types.ts`)

```
getAI(): AIProvider           — complete / stream / extract<T>(zod schema)
getEmbeddings(): EmbeddingProvider — embed(texts) → number[][]
```

`complete` = taste summaries, plan narration. `stream` = progressive "why this
place, for you, right now" explanations. `extract` = the workhorse: quiz
answers → structured taste profile; free text → structured query intent
(`{mood, craving, energy, budget, area, time}`). Both adapters validate with
the same zod schema so behavior is provider-independent.

### Data model (see `supabase/migrations/00000000000001_init.sql`)

- `profiles` — 1:1 with auth.users, auto-created by trigger.
- `taste_profiles` — quiz answers (versioned jsonb) + learned signals (jsonb,
  recomputed server-side from interaction_events) + LLM taste summary +
  `vector(1536)` embedding.
- `places` — curated catalog with vibe tags, editor notes, `best_for` jsonb,
  embedding (HNSW index), `is_published` gate.
- `events` — `is_underground` (editorial flavor) and `required_tier` (access
  control) are deliberately separate; RLS hides premium events from free users.
- `saved_places`, `interaction_events`, `weekend_plans` (items as ordered
  jsonb), `subscriptions` (written only by webhook handlers).

## 4. Roadmap

> **Status (2026-06-12):** All six phases are code-complete and build clean.
> Remaining to go live: provision Supabase (apply migrations, enable Email
> OTP + Google auth), set env keys, run `npm run seed`, create the Razorpay
> plan + webhook, and deploy to Vercel. See README → "Going live, end to end".

Each phase is a shippable milestone.

### Phase 0 — Wipe + scaffold ✅ (this pass)
Legacy app removed; Next.js scaffold with theme tokens, fonts, placeholder
landing + R3F proof, Supabase clients + session proxy, AI layer (types + factory +
`complete`; `stream`/`extract` stubbed), init migration, env.example. Agent
skills installed: find-skills, frontend-design, react-three-fiber,
motion-framer, web3d-integration-patterns.

### Phase 1 — Design system + landing ✅
Finalize palette/typography (use the `frontend-design` skill; current tokens
are provisional — avoid the generic near-black + acid-accent default).
`components/ui` primitives, motion presets, the one signature R3F hero moment
(decide GSAP/Lenis here only if a scroll narrative demands it), full landing
page with product story + waitlist/sign-in CTA, OG images, analytics.
**Exit:** Lighthouse ≥ 90, reduced-motion respected, deployed on Vercel.

### Phase 2 — Auth + onboarding profiling ✅
Apply init migration to a live Supabase project; email OTP + Google auth;
cinematic multi-step onboarding quiz; on completion run `extract` (answers →
structured profile) + `complete` (taste summary) + `embed` (taste embedding);
profile page showing the system's read on you — invest here, it's a wow moment.
**Exit:** users exist with populated taste profiles.

### Phase 3 — Right Now recommendations (the core free product) ✅
Seed 100–150 curated Delhi places with embeddings (service-role script). Query
surface → intent extraction → `match_places` retrieval (taste ⊕ query
embedding, filtered by open-now/area/price) → LLM rerank + streamed
personalized "why". Log every interaction; save/dismiss/rate; recompute
`learned_signals` nightly or on write.
**Exit:** query → 3 ranked places with reasons in < 4s.

### Phase 4 — Weekend Planner + payments ✅
Razorpay Subscriptions + webhook route handler (service role writes
`subscriptions`); pricing page; `is_premium()` gates server-side. Planner
generates an editable Fri–Sun itinerary from profile + constraints.
**Exit:** first paid subscription possible.

### Phase 5 — Underground events ✅
Events list/detail surfaces (RLS already enforces tier); blurred/locked teaser
cards for free users; "happening tonight" injection into Right Now results.
**Exit:** premium hook live.

### Phase 6 — Admin + curation ✅
`(admin)` route group gated by `is_admin()`; place/event CRUD with Storage
image upload; embedding regeneration on edit; submission review queue; signal
dashboards (top queries, save rates).
**Exit:** ops without the SQL console.

## 5. Decision log

| Date | Decision |
|---|---|
| 2026-06-11 | Scrap v1 (Vite/Express prototype); rebuild around taste profiling. |
| 2026-06-11 | Next.js App Router on Vercel; Supabase kept; pgvector for matching. |
| 2026-06-11 | Provider-agnostic AI layer (Anthropic default, OpenAI selectable); embeddings decoupled (OpenAI). |
| 2026-06-11 | Tailwind v4 CSS-first tokens; `motion` package (not legacy framer-motion); R3F v9. |
| 2026-06-11 | Razorpay over Stripe for the India subscription market. |
| 2026-06-11 | Dark-only at MVP (`color-scheme: dark`, no theme toggle). |
| 2026-06-12 | Final palette derived from Delhi night light: warm asphalt darks, sodium-vapor amber accent, neon violet reserved for underground/premium. Hero signature: convergence field (10k lights → one answer). |
| 2026-06-12 | Razorpay integrated via raw REST + HMAC (no SDK); webhook is the source of truth for subscriptions, checkout confirmation activates provisionally. |
| 2026-06-12 | Free users see premium events only via the `event_teasers()` security-definer function (area/time/vibes, never names) — RLS stays strict, teasing stays safe. |
| 2026-06-12 | Learned signals: weighted vibe/area scores from interaction_events, recomputed every 10 events and nightly; taste embedding re-blended with behavior. |
