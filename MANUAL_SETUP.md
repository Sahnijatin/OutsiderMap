# Manual setup & follow-ups

A living checklist of things that can't be done in code alone — infra, secrets,
content decisions, and optional enhancements awaiting a go-ahead. Items are
ticked off and removed as they're completed; when this list is empty the PR can
be closed.

> Most items below relate to the `/join` waitlist landing page and the broader
> go-live. See `README.md` → "Going live, end to end" for the full sequence.

## Required before `/join` accepts applications

- [ ] **Apply the database migrations** to the live Supabase project:
      `npx supabase db push`. The page depends on `0004_waitlist.sql` (the
      `waitlist` table) and `0003_admin_curation.sql` (the `place-images`
      storage bucket used for dropped-spot photos).
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
      - The admin place editor's location picker runs on Leaflet +
        OpenStreetMap (CARTO tiles, Nominatim search) and needs no API key.
        (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is retired; the server-side
        `GOOGLE_MAPS_API_KEY` for place-id resolution is separate and still
        applies.)

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

- [ ] **Rate limiting / bot protection** on the submit action — it runs with
      the service role and is anonymous-reachable, so without a throttle a
      script can mass-create `waitlist` rows, `places` submissions, and image
      uploads. Needs shared state (e.g. Upstash/Vercel KV) or a CAPTCHA (e.g.
      Cloudflare Turnstile); can't be done reliably with in-memory state on
      serverless.

## Optional enhancements (need your go-ahead)

- [ ] **Campaign attribution:** capture UTM / referrer params onto the
      `waitlist` row so you can tie signups back to specific ads. (Currently
      only the in-app referral code is captured.)
