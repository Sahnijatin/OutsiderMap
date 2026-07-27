# OutsiderMap — Full Project Review (2026-07-26)

> **Execution status (2026-07-27).** The engineering plan below was executed
> on this branch in ten commits following this document:
> §1 security items 1-8 fixed (1.1/1.3 by validation + deletion; 1.2's
> publishing side is fail-closed via the hold-everything image moderator —
> the CSAM *scanner* still needs a vendor account); §2.1 premium removal
> complete (migration 0044); §2.2 deletions complete (reels, waitlist,
> Expo app, dead scripts/docs, friends→follows; migration 0045); §2.3
> recommend-into-chat and Leaflet-only landed; quests↔market-runs and
> events→places merges deliberately deferred (live-data refactors, low
> urgency); §3 supply engine items 1-5, 8 (runner honesty) landed
> (migration 0046) — scheduled Overture refresh (§3.7) and photo-vendor
> unblock (§3.8) still open; §5 UI items all landed plus a sound/feel
> layer; §6 mobile code gaps 1-6 landed — accounts, keys, and store
> assets remain the founder's list (§6.7). §4 (merchant side, payout
> rail, verified visits) remains the Month-2 build. Grievances stay
> separate from reports for now (IT Act SLA machinery; fold later with
> counsel input).

> Line-by-line review of the working tree at `ffcb65a` on
> `claude/travel-app-review-h4w49o` (~170 commits ahead of stale `main`).
> Five parallel deep audits: data/supply side, monetization, web core + all 53
> API routes, mobile readiness, and frontend/UI quality — plus a clean-checkout
> build/test pass. This document is the consolidated verdict: what to remove,
> what to redo, what to add, and in what order.

---

## 0. Executive verdict

**The codebase is mechanically far healthier than it feels** — typecheck
clean, lint clean, 373 tests green, RLS default-deny discipline, real
migrations, real admin console — **but it is three products stacked on top of
each other**, and several critical loops terminate exactly one link before
they'd actually work. The result: enormous surface area (34 user-facing
features, 23 admin pages, 53 API routes) with a live catalog of ~110 places,
probably zero photos, no way for supply to grow itself, and a business model
(premium subscriptions) that contradicts the one you actually want
(travelers earn / businesses list).

Three corrections to the founder's own read, because they change the plan:

| Belief | Reality |
|---|---|
| "No admin console" | **Wrong.** A 17-tab console exists, is functional, and is correctly gated at four layers (proxy → layout `requireAdmin` → per-action `requireAdmin` → RLS). Its weakness is ergonomics at scale, not existence. |
| "No data pipeline" | **Half-wrong.** A real Overture importer exists and works (7,554 NCR candidates → 6,126 chain-filtered drafts, idempotent, verified traced into the prod bundle). What's missing is everything *after* import: bulk publish, embedding, refresh. |
| "No way for users to submit" | **Half-wrong.** A complete scout-submission → verify-bounty → quorum-publish loop exists in SQL and API, with sybil defenses. It just can't bootstrap (see §3.1) and its output is invisible to the recommender (§3.2). |
| "Premium/free tier shouldn't be there" | **Right**, and your own docs already agree (`INVESTOR_ONEPAGER.md` §5: "monetize the transaction, never the answer"). Full removal checklist in §2.1. |

**The single most important product bug:** on chat — the surface users
actually use — the personalized "why this place, for you" reason is **fake**.
`src/lib/chat/engine.ts:296` shows the static editor note to every user and
throws the LLM's real reasoning away. The one-answer brain that does this
correctly (`src/lib/now/recommend.ts`) is only reachable from the mobile-era
`/api/now` route. You maintain two brains and ship the weaker one.

**Honest launch distance:** not launchable today. With focused work: ~1 week
to kill the fires (security + premium removal + build fix), ~4–6 weeks to a
credible Delhi-NCR soft launch (web + Play internal testing), with content
ops (publishing drafts, photos) as the long pole. The merchant side of your
stated vision is 0% built and is a Month-2 project.

---

## 1. Fix immediately (security & legal — before anything else)

Ranked. Items 1–3 are exploitable or legally exposing today.

1. **IDOR → publish to a stranger's profile.**
   `src/app/api/quests/[id]/stops/[stopId]/complete/route.ts:36` validates
   `stopId` but never `id`. The quest id flows into
   `enqueueReelJob(admin, id, ctx.user.id)` (service-role), whose worker loads
   the *victim's* quest + media and inserts a **public post authored by the
   victim** (`src/lib/reels/render.ts:168-173`). Fix: uuid-validate `id`,
   verify stop∈quest and quest∈caller. (Or delete the reel pipeline — §2.2 —
   which removes the blast radius entirely.)
2. **CSAM scanning is a no-op in a live UGC app.**
   `src/lib/moderation/csam.ts:29` returns a stub scanner; every "mandatory"
   screen passes. With camera upload live this is legal exposure, not a
   feature gap. Wire a vendor (PhotoDNA/Thorn-class) or gate uploads until
   one exists.
3. **Bounty confirmation accepts arbitrary storage paths as evidence.**
   `src/app/api/bounties/[id]/confirm/route.ts:18-23,62-88` — no ownership/
   prefix check on client-supplied `bucket`/`path` (contrast the correct
   pattern at `places/[slug]/photos/confirm/route.ts:64`). Lets users claim
   others' photos for scout points, and a moderation hit triggers a
   **service-role delete of a client-chosen object**. `id` also not
   uuid-validated.
4. **Bot check and rate limiting both fail open, together.**
   `src/lib/security/turnstile.ts:15` (`if (!secret) return true`) and
   `src/lib/security/rate-limit.ts:21,36,41`. A deploy missing those env vars
   has zero abuse protection on an anonymous endpoint doing service-role
   writes. Add a production-only assertion that they're configured.
5. **`/api/notifications/token`** — no rate limit, and upsert-by-token lets
   any user re-bind a known device token to themselves (push hijack).
6. **Production build fails on a clean checkout.**
   `src/app/(admin)/admin/diagnostics/page.tsx` is statically prerendered and
   calls `createAdminClient()` at build time → build dies without Supabase
   env. Mark it (and any admin page doing this) dynamic.
7. **Chains leak through the fallback retrieval path.**
   `src/lib/catalog/search.ts:160-167` — `keywordSearch()` omits
   `.eq("is_chain", false)`. This is the LLM-outage and embeddings-outage
   fallback: the product law ("chains never surface") breaks exactly when
   degraded.
8. Missing rate limits on 7 write endpoints (`activity` POST, posts/comments/
   reactions DELETEs) and unvalidated `placeId` in `/api/interactions`
   (poisons the learning loop with arbitrary uuids).
9. **Zero tests on the security boundary.** No API-route tests, no RLS tests,
   no auth tests — all 373 green tests cover pure logic. Every finding above
   lives in the untested layer. Start with route tests for the fixes in this
   section so they can't regress.

---

## 2. REMOVE (subtraction is the fastest path to quality)

### 2.1 The premium/free tier — everything

Your call is correct and your own one-pager already ratified it. Two live
contradictions make this urgent, not cosmetic:

- The flagship 500-point scout reward pays **`"premium_days": 30`**
  (`supabase/migrations/00000000000031_scout_economy_logic.sql:198`) — the
  new economy's top prize is a month of the thing being killed.
- "Right Now" **withholds tonight's events to manufacture upgrade pressure**
  (`src/lib/now/recommend.ts:220-247`, `lockedTonightCount`) — directly
  against "never paywall the answer."

Removal checklist (sequencing matters — do it as a new migration
`00000000000044_remove_tiers.sql`, never by editing 0001/0002):

1. Recreate `handle_new_user` **without** the `insert into subscriptions`
   line (`00000000000001_init.sql:81`) — *do this first or signups break*.
2. Drop `event_teasers()`; replace the tier RLS policy on `events`
   (`init.sql:214-222`) with plain `is_published = true` **in the same
   transaction** (or `/events` goes dark); drop `events.required_tier`;
   drop `is_premium()`; drop table `subscriptions`.
3. Delete files: `src/lib/razorpay/`, `src/app/api/razorpay/`,
   `src/app/(marketing)/pricing/` (all three files),
   `src/components/marketing/premium.tsx`.
4. Edit: `src/lib/auth.ts` (drop `isPremium`),
   `src/app/(shell)/profile/page.tsx` (cancel action import :8, subscription
   query :66-70, tier badge :122-124, Membership card :308-343),
   `src/app/(shell)/events/page.tsx` (always run the full query; delete the
   blurred "Locked · premium" teaser :97-130), `events/[id]/page.tsx:47-49`,
   `src/lib/now/recommend.ts` (strip `lockedTonightCount` + the tease branch;
   check `/api/now` consumers of the field), `api/account/route.ts:96`,
   admin `page.tsx` / `members` / `events/{actions,form,page}` tier bits,
   `admin/diagnostics/page.tsx:58-62`, `marketing/cta.tsx:22` copy,
   `about/page.tsx` premium import, `src/lib/env.ts:31-34`,
   `src/types/database.ts` (5 blocks), `env.example:31-38`.
5. Reseed `reward_thresholds` without `premium_days` (see §4.2 for what
   replaces it).
6. Keep: `events.is_underground` (editorial, not paywall), the violet `under`
   token (rename meaning "premium" → "underground" in `globals.css:12`,
   `mobile/src/theme.ts`, brand book).
7. Docs: README, DEVELOPMENT.md, PROJECT_PLAN.md, RUNBOOK-prod.md,
   `scripts/make_brand_pdf.py` all still sell premium.

Zero tests cover the payment path, so removal breaks no test.

### 2.2 Dead and contradictory subsystems

1. **Reels render pipeline** — declared retired (`(shell)/reels/page.tsx:7`)
   yet still shipping: `src/lib/reels/*`, `/api/jobs/reel`, `reel_jobs`/
   `reels` tables, `/admin/reels`, `@ffmpeg-installer/ffmpeg`,
   `tests/reels/*`, profile `reelCount`. Deleting it also deletes security
   finding §1.1's blast radius.
2. **The waitlist/vetting funnel** — `/join` (855-line flow), `/thank-you`,
   vetting-media pipeline, `/admin/waitlist`, referral codes, Turnstile
   dependency. It gates **nothing**: sign-in is open and `requireOnboarded()`
   never checks waitlist status; zero inbound links to `/join` exist. Either
   enforce it or delete ~800+ lines. Recommendation: **delete** (invite
   scarcity can return later as a real mechanic).
3. **The retired Expo app** — `mobile/` (40 files, 1.1 MB, ~30 dead deps) plus
   `docs/EXPO_SDK_MIGRATION*.md` (a migration plan for an app you decided not
   to migrate). One active trap: `scripts/gen-mobile-icons.mjs:20` — the
   repo's *only* icon generator — writes Expo-named files into `mobile/assets`
   which nothing builds. Salvage icon art, repoint the script (§6), delete the
   directory. Also remove the stale sync comment `src/lib/taste/quiz.ts:5`.
4. **Dead scripts & doc:** `scripts/import-places.mjs` (superseded, broken
   `.ts` import, reads a gitignored path), `scripts/resolve-place-ids.mjs`
   (superseded by `jobs.ts`), and **`docs/DATA_PIPELINE.md`** — a discarded
   design describing tables/classifiers/auto-publish that were never built;
   it will mislead the next engineer. Mark superseded or delete.
5. **Grievances** — fold into `content_reports`. Two complaint intakes, two
   admin queues, one concept. (Keep the IT-Act SLA logic — port it onto the
   surviving queue.)
6. **Friends vs follows** — two parallel social graphs both feeding the feed
   (`api/feed/route.ts:25-39`). Keep **follows** (simpler, no accept round
   trip, already powers the feed); delete the friends request flow.
7. **Two of three map libraries.** Leaflet (the public map) stays — its
   raster-over-WebGL choice is documented and load-bearing for the WebView
   shell (`map-canvas.tsx:22-30`). Port `quest-run.tsx` off `maplibre-gl`;
   replace the Google-Maps `location-picker.tsx` (318 lines, 11 hardcoded
   hexes) with the Leaflet path. ~400 KB saved and one visual language for
   "a map."
8. **Smaller cuts:** `/card/[username]` taste-card (orphaned, no entry
   point — or give it an entry point; today it's dead weight); `weekend_plans`
   table (route already redirects); the `/admin/submissions` tab (§3.4 — it
   conflicts with `/admin/scout`).

### 2.3 Merge (bloat that isn't dead, just duplicated)

- **`recommend()` → chat.** One brain. Chat's answer path becomes the real
  pipeline (intent → `match_places` → rerank → *real* streamed per-pick
  reasons). Fixes the fake-personalization bug and deletes `lib/now` as a
  separate system. Keep `/api/now` as a thin wrapper if mobile needs it.
- **market-run → quests.** Both are "AI-built trackable multi-stop plans"
  with parallel schemas, state machines, and detail pages. One model with a
  `kind` discriminator. Keep the market-intelligence engine (`lib/market/*`)
  — it's the best-tested code in the repo — as a data source, not a sibling
  product.
- **events → places(kind='event')** — you already have the column; one
  catalog, one read model. (Lower priority; do when touching events anyway.)

**Post-cut product = six surfaces:** map, chat, feed+compose, quests
(+bounties), profile, events. Everything above survives as less code, not
less product.

---

## 3. REDO — the supply engine (the actual launch blocker)

The catalog is ~110 published places, 0 seeded images, across 22 areas — while
migration 43 just widened the map's promise to a 68-area NCR. Most of NCR
opens to an empty map. Meanwhile 6,126 clean drafts sit unreachable. The
pipeline exists; it's the last mile that's missing everywhere:

1. **Build the draft triage queue.** `/admin/places` has no search, no
   pagination, a hard `.limit(300)` (`admin/places/page.tsx:22-28`) — ~5,800
   drafts are physically unreachable in the UI. It also ships 300×1536-float
   embedding vectors into the RSC payload to render a badge. Needed: filter
   by source/area/enrichment-status, search, pagination, and **bulk publish**.
   This is the single highest-leverage build on the supply side.
2. **Embed on publish.** Quorum-published scout places flip `is_published` in
   SQL (`mig 31:485`) but `match_places` requires `embedding is not null`
   (`mig 01:336`) — so every community-published spot is **permanently
   invisible to chat/search/recommendations**, a bare map pin. Same for
   admin bulk publish. Needed: a publish → embed queue/worker (the admin
   place-save path already has `embedPlace` to reuse).
3. **Un-deadlock the scout economy.** `can_validate` requires
   `curator_score >= 3`; curator_score is minted **only** by bounty
   resolution (`mig 31:73` vs `:493,506`). Day one: nobody can validate,
   ever. The admin fallback is the undocumented mandatory bootstrap. Needed:
   a genesis grant (e.g. score 3 on onboarding for the first N members, or
   admin-mintable validator status) + document the bootstrap.
4. **One review desk.** `/admin/submissions` and `/admin/scout` both act on
   the same `source='submitted'` rows with different side effects —
   publishing via the former orphans the bounty and silently skips the
   points award. Kill `/admin/submissions`; scout desk owns the flow.
5. **Fix the enrichment runner's false "Done".**
   `admin/data/job-runner.tsx:67` stops on `processed === 0`, but declines
   are the *designed* outcome (`enrich.ts` anti-hallucination path) — one
   all-declining batch of 8 shows a green checkmark with thousands
   untouched. Distinguish "scanned N, enriched 0" from "nothing left."
6. **Route the unenrichable 53% somewhere.** 3,274 of 6,126 drafts have no
   website/Instagram and thus no enrichment path at all
   (`jobs.ts:302-312`). They should auto-spawn discover-bounties ("go find
   out") — that's your scout economy and your data gap solving each other.
7. **Make refresh repeatable.** Overture is a hand-run DuckDB ritual against
   a pinned release producing a git-committed 1.8 MB snapshot. A scheduled
   GitHub Action (extract → diff → import) is enough for v1; without it the
   catalog silently rots.
8. **Unblock photos.** `createImageModerator()` unconditionally holds
   everything for manual review (`moderation/image.ts:31-33`) — combined
   with 0 seeded images, the live product likely has **no photos at all**.
   Wire a real vendor for the obvious-pass cases; keep human review for the
   rest. Also `sharp` (cover generation) isn't in `package.json`, so seeded
   covers silently skip.
9. **Member-facing submission entry.** `/submit` is a tombstone redirect and
   the promised map long-press replacement is an open TODO
   (`map-canvas.tsx:287`). The only path in is buried at `/quests/bounties`.
   Build the long-press → submit sheet; it's the front door of the whole
   flywheel.

Also: `src/proxy.ts:10-24` `PROTECTED_PREFIXES` has drifted (missing
`/feed`, `/activity`, `/compose`, `/market-run`, `/welcome`, `/card` → those
lose the `?next=` return path). Replace the allowlist with route-group-based
matching or a test that pins it to the real route tree.

---

## 4. ADD — the two halves of your actual business model

Per the vision: *travelers earn by exploring; businesses (cafés, pottery
classes, barbers…) onboard as experiences.* Today: earn side ≈55% built but
0% monetary; merchant side **0%** — not stubbed, not scaffolded, absent.

### 4.1 Merchant side v1 (Month 2 — nothing depends on it for soft launch)

- `place_claims` table + owner role (`places.owner_user_id`), claim flow on
  the place page ("own this place?"), lightweight verification queue in
  admin.
- Merchant mini-dashboard: their listing, their photos, their stats
  (views/saves/visits), ability to fund a bounty/reward on their own place —
  that's the first money-in primitive and it reuses the existing bounty
  machinery instead of a new system.
- Do **not** build ads/promoted placement — your moat is that ranking can't
  be bought (INVESTOR_ONEPAGER §3).

### 4.2 Earn side — make the ledger mean something

The points ledger is genuinely well built (append-only, escrow → confirm →
clawback, geo-verified quorum, RLS-tight). What's missing is redemption:

- Nothing consumes `reward_thresholds.grant` — badges/invites/premium-days
  are written and never fulfilled (`lib/scout/reputation.ts:66` reads only
  the name). Ship one *real* redemption at launch, even if it's manual
  (e.g. UPI payout processed by hand from an admin queue, or a partner-café
  voucher). A visible "someone actually got paid" beats a wallet feature.
- The cash rail, when it comes, is **RazorpayX/payouts (disburse)** — the
  opposite direction from the deleted subscription code — plus KYC above a
  threshold. Design the points→INR conversion now (even if fixed-rate),
  build the rail in Month 2.
- The "verified transaction" primitive the one-pager stakes the moat on
  ("she went and paid") has no schema anywhere. Not launch-critical, but
  every week without it, the strongest signal isn't being collected. A
  minimal `visits` table (member, place, evidence, confidence) can start as
  scout-confirmation-grade and upgrade to payment-grade later.

### 4.3 Product-brain honesty

- Real per-pick reasons in chat (§2.3 merge does this).
- When AI is down, **say so** — today `engine.ts:223-229` silently swaps in
  keyword results indistinguishable from real answers.
- `recommend()`'s missing-OpenAI path throws uncaught (500s `/api/now` and
  crashes the activation reveal) while chat degrades silently — pick one
  posture (degrade with a banner) and apply it to both.

---

## 5. REDO — frontend ("why it feels garbage" is fixable in days)

The design system is **not** the problem — token discipline, reduced-motion
handling, and the brand identity (Fraunces italic + sodium amber) are
genuinely good. Verdict: keep the system, fix five root causes:

1. **The palette has no elevation.** Measured: card fill vs background =
   **1.06:1**, borders 1.29:1 — and then diluted to `/60`/`/70` in five
   files (bottom-tabs, side-rail, quests, feed). Every card and edge in the
   app is literally invisible on a phone; the UI reads as one flat black
   slab. Fix: lift `surface` → ~#1a1512, `raise` → ~#241d17, `line` →
   ~#4a3f33 (≈3.2:1), then ban `border-line/60|70`. Ten hex values; the
   single highest-impact change in this document.
2. **Nothing acknowledges a tap.** Zero `loading.tsx` files, one Suspense
   boundary, no route-level `error.tsx` (a Supabase hiccup nukes the whole
   shell to the root error page), no `touch-action`, no tap-highlight
   control, no `overscroll-behavior` on sheets. Add skeleton `loading.tsx` +
   `error.tsx` per route group; 3 lines of touch CSS in `globals.css`.
3. **No page primitive → no product coherence.** ~15 distinct `<main>`
   containers, 16 distinct `h1` styles, three card paddings across sibling
   tabs; 5 screens (feed, activity, profile/[username], feed/[id], compose)
   use `pb-28`/`pt-4` magic numbers instead of the safe-area tokens the
   codebase itself defines — **content renders under the notch on the five
   most-used screens.** Build `<Screen>`/`<PageHeader>`/`<EmptyState>`/
   `<Sheet>` primitives and migrate. The Sheet must consolidate the three
   half-implementations (place-sheet is missing `aria-modal`/Escape/focus
   trap; its close target is 28px).
4. **Web-page defaults on a mobile-first app.** `next/image` used **zero**
   times — 19 raw `<img>`s with no dimensions on an image-heavy feed (CLS,
   no srcset, no CDN resize). The feed is client-fetched in `useEffect`
   (spinner on every visit) while sibling tabs are server-rendered — convert
   feed to a server page + client island. Restore focus rings
   (`input.tsx:5`'s `focus:outline-none` kills the global `:focus-visible`
   ring for every form control).
5. **Enforcement.** The codebase states its own rules and then breaks them
   (`globals.css:16` "never hardcode colors" vs `quest-run.tsx:25-27`;
   `--tab-clearance` exists vs `pb-28`×5). Add ESLint bans: raw hex in
   `src/app|components`, `border-line/6x|7x`, raw `<img>`.

Estimated 3–5 focused days for items 1–3 + the worst of 4. Not a redesign —
an execution pass on the design that already exists.

---

## 6. Mobile — real distance to stores

Architecture (Capacitor hybrid over the hosted app) is sound and the native
seams (geolocation, camera, share, haptics, social auth) are complete and
well-written. But no installable artifact has ever been produced, and three
blockers are **code bugs**, not missing credentials:

1. `capacitor.config.ts` never sets **`server.errorPath`** → the
   carefully-built offline page (`mobile-shell/index.html`) is dead code;
   offline launch = raw WebView error (the exact Apple-4.2 failure it was
   written to prevent). One line.
2. **iOS entitlements are never generated** — `cap-native-permissions.mjs`
   writes Info.plist strings only; no `aps-environment`, no
   `com.apple.developer.applesignin`, no Google reversed-client-id URL
   scheme. A TestFlight build would go green with push and Apple sign-in
   silently dead. Extend the script (1–2 days; the fiddly one).
3. **`android-release.yml` ships `versionCode 1` forever** — the
   `-PversionCode` property is never read by the Capacitor Gradle template;
   Play accepts upload #1 and rejects all others. Patch `defaultConfig` in
   the permissions script.
4. **App icons:** both stores would currently get the default Capacitor logo.
   Repoint `gen-mobile-icons.mjs` to root `assets/` + `@capacitor/assets`
   generation in all four workflows.
5. **Privacy policy: absent entirely** (zero hits for "privacy" in `src/`).
   Hard blocker for both stores + DPDP. Write `/privacy` + `/terms`, link
   from footer and settings. (Account deletion, by contrast, is already
   done properly — full purge + typed confirmation UI.)
6. Deep links (assetlinks.json / AASA / `appUrlOpen`) and an Android
   back-button handler (`@capacitor/app` is installed and never imported).
7. Config only you can do: Play account + upload keystore (back it up —
   losing it is permanent), Apple Developer + ASC API key, Firebase
   `google-services.json`, APNs key, OAuth client IDs, `CAP_SERVER_URL` repo
   variable (today workflows silently default to production).

**Timeline:** Play internal ≈ 1 week of code + your accounts. A TestFlight
build that isn't lying ≈ 2–3 weeks. A sideloadable Android debug APK is
available **today** from `android-build.yml` with zero secrets — run it;
you'll learn more in an hour than from any further review.

---

## 7. Sequencing — the four-week path to soft launch

**Week 1 — stop the bleeding.**
Security fixes §1.1–1.8 · build fix · premium removal (§2.1) · delete reels
pipeline, waitlist, Expo app, dead scripts/docs (§2.2) · route tests pinning
the fixes.

**Week 2 — supply engine + UI foundation.**
Draft triage queue + bulk publish · embed-on-publish worker · scout genesis
grant · enrichment runner fix · one review desk · elevation palette +
`loading.tsx`/`error.tsx` layer + `<Screen>` primitive.

**Week 3 — coherence.**
Merge `recommend()` into chat (real reasons, honest degradation) ·
feed → server-render + `next/image` + notch fixes · `<Sheet>`/`<EmptyState>`
· map long-press submit · photo moderation vendor · start publishing drafts
(content ops begins and never stops).

**Week 4 — mobile + polish.**
errorPath/entitlements/versionCode/icons · privacy policy + terms ·
Play internal build · merge friends→follows, quests↔market-runs ·
mobile-verify surface list extended to the real route tree.

**Month 2 — the business model.**
Merchant claim flow + mini-dashboard · first real reward redemption ·
points→INR design + RazorpayX rail · verified-visit primitive · TestFlight.

**The one thing engineering cannot do:** the catalog. 110 places with no
photos is the product a user meets. The pipeline work in Week 2 makes 6,126
drafts publishable at rate — but someone has to run the triage desk daily,
and the NCR promise (68 areas) should be narrowed back to the areas with
real density until content catches up.

---

## Appendix — audit provenance

Five parallel audits over the full tree at `ffcb65a` (each finding cited to
file:line above): data/supply chain trace; monetization inventory (every
tier/Razorpay reference + scout-economy state); web core + all 53 API routes
(auth, rate limits, zod, IDOR, service-role reachability); mobile (Capacitor
config, plugin seams, all 7 workflows, store checklists); frontend (contrast
math on the token palette, container/typography drift counts, a11y,
bundle/perf). Plus clean-checkout `npm install → tsc → eslint → vitest →
next build` (all green except the build failure in §1.6).

---

## Appendix B — Strategy addendum (what the codebase cannot fix)

Recorded from the post-review strategy discussion; none of this is code.

1. **"Travelers earn money" needs a funder.** Before merchants fund rewards,
   every rupee paid to scouts is venture money buying data - fine if
   deliberate, with a budget and a fraud ceiling. Sequence: status first
   (badges, leaderboard, IRL perks at partner spots), cash last, and the
   first *transaction* primitive should be a **booking** for a limited-seat
   experience - it creates the verified visit, the merchant ROI proof, and a
   take-rate in one stroke. Points-first also defers TDS/KYC/entity work.
2. **Demand is the bigger blind spot than supply.** No acquisition loop
   exists. Cheapest four: the catalog itself as weekly Instagram content
   ("7 places in Hauz Khas that aren't on Google"); public, OG-rich place
   pages as SEO surface; QR table-tents at the first 50 hidden spots (zero
   CAC, opens the merchant conversation); and WhatsApp - a bot that answers
   "it's 11pm, I'm in GK2, surprise me" may onboard more of Delhi than any
   app-store listing. The weekly one-place drop belongs on WhatsApp, not push.
3. **The 3am promise is a physical-world liability.** One wrong answer at
   3am (closed shutter, dark lane) costs the user and the story they tell.
   Opening-hours freshness needs to be a first-class concept ("verified this
   week" - a perfect scout bounty type), and a **safety lens** (lighting,
   crowd type, women-recommended signal from scouts, share-my-plan) should
   sit *inside the ranking*, not in a settings toggle. Incumbents
   structurally will not do this at this granularity.
4. **An AI product needs evals.** Build a ~50-case golden set (persona ×
   ask × time → acceptable places) and run it in CI like unit tests, so a
   prompt tweak or model swap cannot silently change the core product.
   Hinglish asks ("koi sasta jagah chill karne ke liye") belong in that set.
5. **Close the loop nobody closes.** A next-morning "did you go? how was
   it?" nudge is simultaneously the north-star metric (Confident Answer
   Accept Rate - defined in the docs, measured nowhere), the training
   signal, the retention touchpoint, and verified-visits v0.
6. **Ring 3 needs no software.** One curated table of six at a hidden spot,
   hosted by the founder, is: an experience sold, a merchant relationship,
   six loyal users, and the week's content. Timeleft proves the demand with
   zero taste-matching; the taste graph is the better matcher later.
7. **Do things that don't scale, in this order:** debug APK on the
   founder's phone this week; twenty personally-onboarded users this month;
   the admin desks used daily from a phone in the field; one neighborhood
   made dense before 68 areas made wide.
