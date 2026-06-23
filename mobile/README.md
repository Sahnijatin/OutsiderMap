# OutsiderMap — mobile (Expo / React Native)

The invite-only mobile client. It talks to the existing Next.js backend
(`../`) over HTTP with a Supabase bearer token; the recommendation "brain"
lives server-side and is shared with the web.

> This app is **not built or verified in CI** — it has its own toolchain and is
> fenced off from the web app's tsc/lint/build (see root `tsconfig.json` /
> `eslint.config.mjs`). Verify it locally with the steps below.

## Setup

```bash
cd mobile
npm install
npx expo install   # reconciles native dep versions to the installed Expo SDK
cp .env.example .env   # fill in the three EXPO_PUBLIC_* values
```

- `EXPO_PUBLIC_API_URL` — the deployed web app that serves `/api/*`
  (e.g. your Vercel URL). For local backend dev use your machine's LAN IP, not
  `localhost`, so the device can reach it.
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same Supabase
  project as the web app.

## Run

```bash
npm run start        # Expo dev server; press i / a, or scan in Expo Go
npm run typecheck    # tsc --noEmit (this app only)
```

## What's here (Phase 1)

- **Auth gate** (`app/(auth)/sign-in.tsx`) — email OTP sign-in (invite-only:
  `shouldCreateUser: false`); non-members deep-link to the web `/join` to apply.
- **Onboarding** (`app/onboarding.tsx`) — the taste quiz (mirrors the web quiz +
  the new "anchors" question) → `POST /api/onboarding`.
- **Feed** (`app/(app)/index.tsx`) — `GET /api/feed` (for-you / tonight / fresh).
- **Right Now** (`app/(app)/chat.tsx`) — ask → one answer + streamed "why".
- **Experience story** (`app/experience/[slug].tsx`) — swipeable story cards +
  save / start / complete.
- **Bucket** (`app/(app)/bucket.tsx`) — saved / started / completed.
- **Profile** (`app/(app)/profile.tsx`) — the taste read + personalization
  consent toggle.

Design tokens are ported from the web `globals.css` `@theme` into
`src/theme.ts` (one brand, two clients).

## Still to do

- Brand assets: add `assets/icon.png`, `assets/splash.png`,
  `assets/adaptive-icon.png` and re-add them to `app.json`.
- Sign in with Apple + Google OAuth (required for App Store; email OTP works now).
- Map + filters surface; the in-experience companion; push notifications.
- A Skia version of the signature ConvergenceField (currently a Reanimated/Moti
  approximation in `src/ui/ConvergenceField.tsx`).
