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
      Variables): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      and `SUPABASE_SERVICE_ROLE_KEY`. The submit action uses the service role,
      so without these the form errors on submit.

## Content & decisions

- [ ] **Confirm the Instagram handle.** The success screen links to
      `instagram.com/outsidermap` — update in `src/app/join/join-flow.tsx` if
      the real handle differs.
- [ ] **Launch date** is hardcoded as "We open July 10" in
      `src/app/join/join-flow.tsx` — update when it changes.
- [ ] **Repoint the primary marketing CTA?** The nav has a "Join waitlist"
      button → `/join`, but the hero/landing CTAs still point to `/sign-in`
      (`src/components/marketing/hero.tsx`, `src/components/marketing/cta.tsx`).
      Decide whether the pre-launch primary CTA should be the waitlist.
- [ ] **GA4 conversions.** The base Google tag (`G-SY3XQJ0R3S`) is installed
      site-wide. In the GA dashboard, mark the waitlist submission as a
      conversion / set up the goal so campaign spend can be attributed.

## Security hardening (recommended before high-traffic campaigns)

The `/join` submit action runs with the service role and is reachable by
anonymous visitors, so a paid campaign is also an attack surface.

- [ ] **Rate limiting / bot protection** on the submit action — without it,
      a script can mass-create `waitlist` rows, `places` submissions, and 5 MB
      image uploads. Needs shared state (e.g. Upstash/Vercel KV) or a CAPTCHA
      (e.g. Turnstile); can't be done reliably with in-memory state on
      serverless.
- [ ] **Validate dropped-spot image content** beyond MIME + size. The bucket
      is public-read and the file type is currently trusted from the
      client-supplied `Content-Type`; sniff magic bytes or re-encode
      server-side before storing.

## Optional enhancements (need your go-ahead)

- [ ] **Confirmation email + admin notification** when a new application lands
      (requires an email provider — e.g. Resend/Postmark).
- [ ] **Campaign attribution:** capture UTM / referrer params onto the
      `waitlist` row so you can tie signups back to specific ads.
- [ ] **Conversion event on submit:** fire a GA `generate_lead` (or custom)
      event from the `/join` success transition for precise funnel tracking.
