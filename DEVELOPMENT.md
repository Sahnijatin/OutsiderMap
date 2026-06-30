# OutsiderMap — Development Status

> Living build tracker for the mobile-first rebuild. Single source of truth for
> what's done and what's left. Update it as work lands.
>
> **Vision:** `OutsiderMap_Vision.docx` (curated *experiences*, proactive
> suggestion, no chains, invite-only, in-app companion).
> **Note:** `PROJECT_PLAN.md` is the *original* plan and is partly superseded by
> the vision pivot — trust this file for current status.

_Last updated: 2026-06-30 · active branch: `claude/development-file-review-ro7ybf`_
_PR #17 is merged into `main`; the work below builds on it._

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
| Admin authoring + vetting UI | ✅ built (A1–A3, B1–B4); ⏳ runtime needs buckets |
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
   repair was done. ⏸️ **On hold** (by decision).
2. **End-to-end API test** vs live DB — bearer scoping, 401s, rate-limit,
   `is_chain` exclusion. ⏸️ **On hold** (by decision, gated on #1).
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

## Admin authoring + vetting UI — subphase plan (item #5)

Item #5 is the largest unblocked workstream. The `0006`/`0007` columns and the
TypeScript types (`src/types/database.ts`) already exist, so this is pure
additive UI/action code that compiles and builds without the live DB. Each
subphase is small and independently verifiable (`tsc --noEmit && lint && build`
green before moving on). Suggested order: **A1 → A2 → B1 → B2 → B3 → A3 → B4**.

> ⚠️ Runtime caveat: the `experience-media` and `member-vetting` buckets don't
> exist until migrations `0006`/`0007` are applied (item #1, on hold), so
> upload/read behavior can only be *functionally* verified once the DB is
> unlocked. All subphases still build and typecheck now.

### Workstream A — place → experience authoring

(`src/app/(admin)/admin/places/place-form.tsx` + `actions.ts` — today expose
neither `kind`, `is_chain`, nor `story`.)

- ✅ **A1 · scalar fields `kind` + `is_chain`** — `kind` `<Select>` (7 enum
  values) + `is_chain` checkbox, mirroring the existing `category`/`is_published`
  patterns; extend the Zod `FormSchema` and `row` mapping in `actions.ts`.
- ✅ **A2 · story plumbing (raw JSON)** — a `story` JSON `<Textarea>` like the
  existing `hours`/`best_for` fields, parsed via `parseStoryField` into the
  `story` column. A trusted stopgap that makes the column writable.
- ✅ **A3 · rich story editor + media upload** (`places/story-editor.tsx`) —
  client component for ordered story cards (add/remove/reorder; media file +
  `media_type` + caption); uploads media to the `experience-media` bucket via
  `lib/media/experience.ts` (shared magic-byte image sniff in `lib/media/image.ts`,
  plus an allowlisted video Content-Type); the action assembles the `story`
  jsonb from indexed form fields. Replaces the A2 textarea.

### Workstream B — member vetting

(No selfie capture in `/join`; no vetting queue UI.)

- ✅ **B1 · shared private-media helper** (`src/lib/vetting/media.ts`) —
  signed-URL reader for the private `member-vetting` bucket + a reusable
  sniff/upload helper. Built first because B2 (write) and B3 (read) depend on it.
- ✅ **B2 · `/join` selfie + photos capture** — extends `join-flow.tsx` with
  selfie capture + photo inputs + an explicit consent checkbox; extends
  `submitApplication` to upload to the private bucket and set `selfie_path`,
  `photo_paths`, `consent_personal_data`. Strictly additive and consent-gated —
  the existing waitlist write is unchanged.
- ✅ **B3 · vetting queue (read-only)** — extends `admin/waitlist/page.tsx` to
  select the new fields and render signed-URL thumbnails via B1. No mutations.
- ✅ **B4 · vetting actions** — `reviewApplicant` server action
  (`status` + `reviewed_at` + `reviewer_note`) wired to Accept/Waitlist/Reject
  buttons; input constrained to the four allowed statuses.

---

## Autonomous (code-only) development steps

Steps that can be built end-to-end in code and verified by `tsc`/`lint`/`build`
with **no manual work** (no live-DB clicks, credentials, device, real media, or
store actions). The API + mobile already consume `kind`/`story`/`is_chain`
(experiences API filters on `?kind=`; the mobile story screen renders cards), so
these outputs already have somewhere to land.

1. ✅ **Catalog content model in the seed (#6)** — `kind` / `is_chain` / `story`
   added to all 110 entries in `data/places.delhi.json`; `scripts/seed-places.mjs`
   upserts them. Code done; running the seed against the DB stays gated by #1.
2. ✅ **DPDP consent-purge endpoint** — `DELETE /api/account` purges all personal
   data (events, saved places, weekend plans, subscription, taste profile,
   profile, waitlist row + private vetting media) and deletes the auth user.
3. ✅ **Experience filters in mobile** — kind chips on the feed; selecting one
   switches to a filtered browse of `/api/experiences?kind=`, "All" shows the
   curated feed.
4. **In-app companion voice (backend)** — second-voice generation via the
   existing `src/lib/ai/adapters/*`; no new provider creds.
5. **Push-notification data layer** — migration for `device_tokens` + register
   /unregister API + frequency-cap logic (the sender needs APNs/FCM creds, so
   that part stays deferred).
6. **Skia upgrade of ConvergenceField** — mobile-only animation refactor.
7. **Test harness** — add a runner (e.g. Vitest) + unit tests for
   `buildStoryCards`, the media sniff/upload/signing helpers, and consent-gating.

Excluded (need manual work): apply migrations (#1), E2E vs live DB (#2), device
run (#3), OAuth creds (#4), real catalog media, final brand art, store
submission, the payments-vs-vision decision.

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
