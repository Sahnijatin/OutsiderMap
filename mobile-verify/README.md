# mobile-verify

The **mobile review loop** for OutsiderMap. Because the native apps are the web
app wrapped in Capacitor (issue #143), the mobile experience can be reviewed the
same way the web app is: boot the app, drive the key flows at real phone
viewports (iPhone + Pixel) with mocked location, screenshot everything, and
assert mobile-health invariants.

This is what lets development of the mobile app be validated continuously
without a device — for everything that lives in the web layer (~90% of the app:
all UI, layout, gestures, flows, functionality). The remaining ~10% (real APNs/
FCM push, native camera, device GPS, signed store builds) still needs a device/
simulator — see issue #143 for that device-only checklist.

## Run

```bash
npm run mobile:verify                      # auto-starts `next dev`, tests localhost
MOBILE_VERIFY_URL=https://<staging>.vercel.app npm run mobile:verify   # test a deploy
```

> **Needs a configured environment.** Since #116 made the map the anonymous
> front door, `/` and `/map` render Supabase-backed data server-side. Run
> against an env that has the Supabase keys — a local `.env.local`, or a
> `MOBILE_VERIFY_URL` staging/preview deploy. Without keys those two surfaces
> return HTTP 500 ("URL and Key required"); the other surfaces still pass.

- Screenshots land in `mobile-verify/screenshots/{iphone,pixel}/<surface>.png`.
- An HTML report lands in `mobile-verify/report/` (`npx playwright show-report mobile-verify/report`).
- Uses Playwright's managed Chromium by default (`npx playwright install
  chromium`). Point at a specific binary with `PW_CHROME=/path/to/chrome`
  (e.g. a pre-provisioned one).

**In CI:** `.github/workflows/mobile-verify.yml` runs this automatically against
each Vercel **preview** deployment (`deployment_status` success) and uploads the
screenshots + report as an artifact — the durable, proxy-free review loop. If
preview deployments are access-protected, set a repo secret
`VERCEL_AUTOMATION_BYPASS_SECRET` (a Vercel "Protection Bypass for Automation"
token); the harness sends it as `x-vercel-protection-bypass`. Trigger a one-off
run against any URL via **Actions → mobile-verify → Run workflow**.

## What it checks (per surface × device)

- **No horizontal scroll** — a hard invariant for mobile layouts.
- **Rendered, not crashed** — fails on a blank screen or a Next.js error overlay.
- **No 5xx** — server errors fail; 3xx redirects and 401 auth gates are expected.
- **Auth gating is recorded** — an auth-gated route that redirects to `/sign-in`
  is annotated (not failed), so the report doubles as a map of what's reachable.
- **Full-page screenshot** of every surface, on every device — the deliverable.

## Surfaces

Defined in `flows.spec.ts` (`SURFACES`): landing, sign-in, onboarding, map,
chat, reels, events, saved, profile. Add a surface by adding one line.

## Authed flows

Unauthenticated runs screenshot the public surfaces and capture the sign-in
redirect for the gated ones. To exercise authed surfaces (map with data, chat,
profile, feed), run against an environment with a seeded session:

1. Point `MOBILE_VERIFY_URL` at a deployment with Supabase + AI keys configured.
2. Add a Playwright `storageState` (a signed-in session) to the config `use`
   block, or a global-setup step that signs in once and reuses the cookies.

Until then the harness is still valuable: it proves the mobile *shell*, layout,
and routing on real device viewports and screenshots every surface.

## Relationship to the rest

- **Issue #143** — Native mobile via Capacitor. This harness is its review loop.
- **Issue #127** — mobile-web craft/perf. Extend the checks here with perf
  budgets (LCP, bundle) and add throttled-network profiles as that lands.
- **`MOBILE_PLAN.md`** (repo root) — the full mobile roadmap and sequence.
