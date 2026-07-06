# OutsiderMap

**Your city, your taste.** Hyper-personalized discovery for Delhi: tell us your
mood — we already know your taste — and get one confident answer for where to
go and what to do, even at 3am.

Generic tools give you ten thousand options; OutsiderMap builds a personal
taste profile (onboarding quiz + continuous learning from your behavior) and
gives you *the* answer. Free tier: instant "Right Now" recommendations.
Premium: AI-planned weekends + access to underground events and locations.

📋 **Full product + technical plan:** [DEVELOPMENT.md](./DEVELOPMENT.md) (the
north star; [PROJECT_PLAN.md](./PROJECT_PLAN.md) is the superseded web-first
plan, kept for history)

## Stack

- **Next.js** (App Router) on Vercel — TypeScript, Tailwind v4
- **Supabase** — Postgres + Auth + Storage + RLS, pgvector for taste matching
- **Provider-agnostic AI layer** (`src/lib/ai/`) — Anthropic/OpenAI adapters,
  server-side only
- **Motion + react-three-fiber** — cinematic, minimal, dark UI

## Getting started

```bash
npm install
cp env.example .env.local   # fill in Supabase + AI keys
npm run dev                 # http://localhost:3000
```

The app runs without any keys configured (the landing page and build don't
need them); Supabase- and AI-backed features fail with a descriptive error
until the corresponding env vars are set.

### Going live, end to end

1. **Supabase**: create a project, then `npx supabase db push` to apply
   `supabase/migrations/`. Enable the Email (OTP) and Google providers in
   Auth settings; add your domain to the redirect allowlist
   (`/auth/callback`).
2. **Seed the catalog**: `npm run seed` (needs `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`). Idempotent — re-run after
   editing `data/places.delhi.json`.
3. **AI keys**: `ANTHROPIC_API_KEY` (or `AI_PROVIDER=openai`), plus
   `OPENAI_API_KEY` for embeddings in all cases.
4. **Razorpay** (premium): create a monthly plan, set the `RAZORPAY_*` vars,
   and point a webhook at `/api/razorpay/webhook` subscribed to the
   `subscription.*` events.
5. **Cron**: `vercel.json` schedules the nightly learned-signals recompute
   (`/api/cron/recompute`, gated by `CRON_SECRET`).
6. **Admin**: flip `is_admin` on your profile row once —
   `update profiles set is_admin = true where id = '<your-uuid>';` — and the
   curation desk appears at `/admin`.

## Project layout

```
src/
├── app/                # App Router: (marketing) public, api/ route handlers
├── components/
│   ├── motion/         # shared Motion variants/presets
│   ├── three/          # R3F scenes (always dynamic-imported, ssr: false)
│   └── ui/             # design-system primitives (Phase 1)
├── lib/
│   ├── ai/             # provider-agnostic LLM layer + embeddings
│   ├── supabase/       # browser / server / admin clients
│   └── env.ts          # zod-validated env access
└── proxy.ts            # Supabase session refresh
supabase/migrations/    # schema (applied to a live project in Phase 2)
```

## Database

Schema lives in `supabase/migrations/00000000000001_init.sql` — profiling-first
design: `taste_profiles` (quiz + learned signals + embedding), `places` and
`events` with pgvector matching via the `match_places` function, append-only
`interaction_events` feeding the learning loop, tier-gated `events` via RLS.

Apply with the Supabase CLI once a project is linked:

```bash
npx supabase db push
npx supabase gen types typescript --linked > src/types/database.ts
```
