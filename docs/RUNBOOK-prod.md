# Production Runbook

The operations manual for outsidermap.com. Everything here is founder-runnable
from a laptop; the phone-readable state of production lives at
**/admin/diagnostics** (env booleans + catalog counts).

## 1. Vercel environment variables

Set in Vercel → Project → Settings → Environment Variables (Production).
**Never save a variable with an empty value** - the app treats empty as unset
(since PR #49), but keep the dashboard clean.

| Variable | Without it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Nothing works. Required. |
| `SUPABASE_SERVICE_ROLE_KEY` | Crons, ingest, account deletion all fail. |
| `OPENAI_API_KEY` | Embeddings die: chat, quest generation, Right Now, seeding. Needed even with `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_API_KEY` | Chat + quest generation fail (default provider). |
| `CRON_SECRET` | Ingest never processes, the embed sweep and nightly learning recompute never run. Any long random string; must match nothing else. |
| `NEXT_PUBLIC_APP_URL` | Absolute links in email and share flows break. Set to `https://www.outsidermap.com`. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limiting silently off (fails open). |
| `RESEND_API_KEY` / `RESEND_FROM` / `RESEND_ADMIN_EMAIL` | Transactional email silently skipped. |
| `AI_MODEL` / `AI_FAST_MODEL` | Optional overrides; sensible defaults per provider. |

After changing env vars, **redeploy** (Vercel → Deployments → Redeploy) -
serverless functions cache the environment per deployment.

## 2. Vercel plan limits (we are on Hobby)

- Crons: max 2, daily-only. `vercel.json` is guarded by
  `scripts/check-vercel-config.mjs` in CI - if you add a cron, CI fails
  before Vercel can silently reject the deployment.
- Function duration: routes declare `maxDuration = 300` (needs Fluid
  compute, which is on by default).
- If you upgrade to Pro later: sub-daily crons become legal; loosen the
  checker script consciously in the same PR.

## 3. Seeding the catalog (110 Delhi places + 12 experiences)

Requires three env vars and runs from your machine against production:

```bash
cd OutsiderMap
npm ci
npm install sharp --no-save   # optional but recommended: generates cover art

NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
OPENAI_API_KEY="<openai key>" \
node scripts/seed-places.mjs --dry-run    # sanity check, no writes

# then the real run (idempotent - re-running never duplicates, and never
# overwrites images an admin uploaded):
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
node scripts/seed-places.mjs
```

Verify: /admin/diagnostics → "Published places · delhi" should be ~122.

Notes:
- Without `sharp` installed, cover-art generation is skipped silently -
  places seed fine but have no images.
- Cities are seeded by migration 09 (Delhi, live). Adding a city = insert a
  `cities` row (slug, name, lat/lng/zoom, `is_live`, areas[]) + seed places
  with that `city` slug.

## 4. Storage buckets

Created by migrations (not by the seeder): `place-images` (public),
`experience-media` (public), `quest-media` (private), `reel-media` (public, legacy renders only),
`member-vetting` (private, dormant). A fresh Supabase project gets them by
running the migrations; nothing manual needed. If media 404s, check
Storage → the bucket exists and is public/private as listed.

## 5. Events

No seed file exists. Events enter through **/admin/events/new**: title,
venue, area, start time (IST), underground flag, publish. Published events
are visible to every member.

## 6. Feed content (cold start)

Until members post: seed the feed by completing a quest or two on the
founder account and posting the captures via /compose. The reel render
pipeline was retired; video posts upload like any other post media.

## 7. Routine checks

- **/admin/diagnostics**: env all "set", places > 0, ingest not stuck.
- `curl https://www.outsidermap.com/api/health` → `{status, commit}` -
  confirms which build is live.
- Vercel → Crons: two entries, both green on last run.
- After a deploy that touches migrations: Actions → "Deploy DB migrations"
  is green.

## 8. Known dormant surfaces

`/join`, `/thank-you`, and the vetting flow are retired (open signup won) -
code kept, nothing links to them. The old Expo app has been deleted; mobile
is the Capacitor hybrid shell (see MOBILE_PLAN.md).
