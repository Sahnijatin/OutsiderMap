# OutsiderMap

**Your city, your taste.** Hyper-personalized discovery for Delhi: tell us your
mood — we already know your taste — and get one confident answer for where to
go and what to do, even at 3am.

Generic tools give you ten thousand options; OutsiderMap builds a personal
taste profile (onboarding quiz + continuous learning from your behavior) and
gives you *the* answer. Free tier: instant "Right Now" recommendations.
Premium: AI-planned weekends + access to underground events and locations.

📋 **Full product + technical plan:** [PROJECT_PLAN.md](./PROJECT_PLAN.md)

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
