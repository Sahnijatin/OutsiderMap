# OutsiderMap — Development Status

> Living build tracker for the mobile-first rebuild. Single source of truth for
> what's done and what's left. Update it as work lands.
>
> **Vision:** `OutsiderMap_Vision.docx` (curated *experiences*, proactive
> suggestion, no chains, invite-only, in-app companion).
> **Note:** `PROJECT_PLAN.md` is the *original* plan and is partly superseded by
> the vision pivot — trust this file for current status.

_Last updated: 2026-06-26 · active branch: `claude/repo-review-adekxp` (PR #17)_

---

## Snapshot

Phase 1 = an invite-only mobile app (Expo) on the existing Next.js + Supabase
backend: reactive chat → one reasoned answer, a personalized feed, story-format
experiences, and a bucket. The recommendation "brain" already existed; this work
exposed it over HTTP and built the app on top.

| Area | State |
|---|---|
| Backend HTTP API | ✅ built, ⏳ not tested against live DB |
| DB schema (migrations 0006/0007) | ✅ written, ⏳ not applied to live DB |
| Expo mobile app | ✅ scaffolded + typechecks, ⏳ not run on a device |
| Social auth (Apple + Google) | ✅ coded, ⏳ needs credentials + dev build |
| Admin authoring + vetting UI | ❌ not built |
| Catalog content (experiences + stories) | ❌ not seeded |
| Store readiness | ❌ not started |

---

## How the pieces fit

- `src/` — Next.js web app: marketing + `/join` application + **API backend**
  (`src/app/api/*`) + the shared brain (`src/lib/{ai,now,taste,places}`).
- `mobile/` — the Expo/React Native app (own toolchain; fenced off from the web
  build). Talks to `src/app/api/*` with a Supabase bearer token.
- `supabase/migrations/` — schema; deployed to prod by `.github/workflows/migrate.yml`
  on merge to `main`.

---

## Done (PR #17)

- **Backend API** — `src/lib/api-auth.ts` (bearer **or** cookie → user-scoped
  client) + route handlers: `POST /api/now`, `POST /api/now/why` (stream, bearer),
  `POST /api/onboarding`, `POST /api/interactions`, `GET /api/feed`,
  `GET /api/experiences` (+`/[slug]`), `GET`/`PATCH /api/profile`.
- **Schema** — `0006_experiences` (`places.kind`, `is_chain` enforced in
  `match_places`, `story` jsonb, `experience-media` bucket, `saved_places.status`,
  richer `interaction_events` taxonomy, `profiles.personalization_enabled`),
  `0007_membership` (waitlist vetting fields + private `member-vetting` bucket).
  Learn-loop weights add `complete` as the gold signal; `recommend()` + feed
  honor the consent flag.
- **Onboarding** — anchors question added (`QUIZ_VERSION` 2).
- **Mobile app** — theme ported from `globals.css`, design system
  (`mobile/src/ui/*`), screens (auth, onboarding, feed, chat + streamed why,
  experience story, bucket, profile), ConvergenceField signature moment.
- **Auth** — Apple + Google (`mobile/src/lib/oauth.ts`) on top of email OTP.
- **Brand art** — generated placeholder icon/splash (`scripts/gen-mobile-icons.mjs`).

Baselines: web `tsc`/`lint`/`build` green; `mobile tsc` green.

---

## Phase 1 — remaining

1. **Apply migrations to live Supabase** — merge PR #17 (runs the migrate
   action) or `workflow_dispatch`; confirm the one-time `0001–0005` baseline
   repair was done.
2. **End-to-end API test** vs live DB — bearer scoping, 401s, rate-limit,
   `is_chain` exclusion.
3. **Run the app on a device** — experience pass: 60fps, animations, haptics,
   story gestures, streamed why; iterate on polish.
4. **Social-auth credentials** — Apple provider in Supabase; Google OAuth clients
   + Supabase config; reversed iOS client id in `mobile/app.json`; build a dev
   client (`npx expo run:ios`).
5. **Admin authoring gaps (web)** — the place form
   (`src/app/(admin)/admin/places/place-form.tsx` + `actions.ts`) doesn't expose
   `kind` / `is_chain` / `story`; no **member-vetting queue UI** (selfie review,
   approve/reject/waitlist); no **selfie capture** in `/join`.
6. **Catalog content** — seed real non-chain experiences with `kind` + story
   media (today `data/places.delhi.json` is restaurant-shaped, no stories).
7. **Final brand art** + **store prep** — Sign in with Apple compliance, privacy
   policy + nutrition labels, a pre-approved demo account for invite-only review,
   TestFlight / Play internal testing.

---

## Deferred (Phase 2+, by decision)

- Proactive **push notifications** (device tokens + sender + frequency caps).
- The in-app **companion** (the witty second voice) — load-bearing for
  historical/cultural experiences.
- **Map + filters** surface (fast-follow).
- **Payments / premium** reconciliation with the new vision.
- DPDP **consent-purge** endpoint (right-to-delete).
- **Skia** upgrade of the ConvergenceField (currently Reanimated/Moti).

---

## Open questions

1. Does the premium / underground / weekend-planner monetization model survive
   the vision, or is Phase 1 invite-only with payments later?
2. Who owns the **content pipeline** (story photo/video/narrative per experience)?

---

## Running it

- **Web/API:** `npm install && npm run dev` (root). Checks: `npx tsc --noEmit`,
  `npm run lint`, `npm run build`.
- **Mobile:** `cd mobile && npm install && npx expo start` (email OTP works in
  Expo Go; Apple/Google need `npx expo run:ios` — see `mobile/README.md`).
- **DB:** migrations auto-apply on merge to `main`; manual `npx supabase db push`.
