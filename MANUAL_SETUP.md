# Manual setup & follow-ups

A living checklist of things that can't be done in code alone — infra, secrets,
content decisions, and optional enhancements awaiting a go-ahead. Items are
ticked off and removed as they're completed; when this list is empty the PR can
be closed.

> Most items below relate to the `/join` waitlist landing page and the broader
> go-live. See `README.md` → "Going live, end to end" for the full sequence.

## Required before `/join` accepts applications

- [ ] **Confirm all migrations are applied** to the live Supabase project.
      They auto-apply on merge to `main` via `.github/workflows/migrate.yml`
      (0006/0007 confirmed green; verify `0008_push.sql` ran). Manual fallback:
      `npx supabase db push`. The `/join` page depends on `0004_waitlist.sql`
      (the `waitlist` table), `0003_admin_curation.sql` (the `place-images`
      bucket), and `0007_membership.sql` (the private `member-vetting` bucket
      for selfie/photo vetting).
- [ ] **Set production env vars** (Vercel → Project → Settings → Environment
      Variables):
      - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
        `SUPABASE_SERVICE_ROLE_KEY` — the submit action uses the service role,
        so without these the form errors on submit.
      - `RESEND_API_KEY`, `RESEND_FROM` (verified sender), and
        `RESEND_ADMIN_EMAIL` — power the confirmation + admin-notification
        emails. If unset, signup still works but no emails are sent.
      - `NEXT_PUBLIC_APP_URL` — used to build absolute links in those emails
        (referral share link, admin review link). Set it to the production
        domain.
      - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — powers the map + location search on
        the "drop a spot" form and the admin place editor. In Google Cloud:
        enable **Maps JavaScript API**, **Places API (New)**, and **Geocoding
        API**; create an API key and **restrict it** to HTTP referrers
        (`https://outsidermap.com/*`, `http://localhost:3000/*`) and to those
        three APIs (the key is exposed in the browser — referrer restriction
        prevents quota theft); ensure billing is enabled. If unset, those
        surfaces fall back to plain text/number inputs. Redeploy after setting
        it (it's `NEXT_PUBLIC`, baked at build time).

## Content & decisions

- [ ] **Confirm the Instagram handle.** The success screen and the
      confirmation email link to `instagram.com/outsidermap` — update in
      `src/app/join/join-flow.tsx` and `src/lib/email/templates.ts` if the real
      handle differs.
- [ ] **Launch date** is hardcoded as "We open July 10" in
      `src/app/join/join-flow.tsx` — update when it changes.
- [ ] **GA4 conversions.** The base Google tag (`G-SY3XQJ0R3S`) is installed
      site-wide and the `/join` success now fires a `generate_lead` event. In
      the GA4 dashboard, mark `generate_lead` as a conversion and (optionally)
      import it into Google Ads so campaign spend can be attributed.

## Security hardening (recommended before high-traffic campaigns)

- [ ] **Provision the rate-limit + bot-protection backends.** The code is
      built (`src/lib/security/rate-limit.ts` uses Upstash Redis;
      `src/lib/security/turnstile.ts` verifies Cloudflare Turnstile) but both
      **fail open when unconfigured** — set `UPSTASH_REDIS_REST_URL`,
      `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and
      `TURNSTILE_SECRET_KEY` in production or the throttles are no-ops.

> UTM / referrer campaign attribution shipped (`0005_waitlist_utm.sql` +
> capture in `src/app/join`), so it's no longer listed here.
