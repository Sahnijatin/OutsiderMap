# Expo SDK 52 → 57 migration — phased execution plan

> Companion to `EXPO_SDK_MIGRATION.md`. That doc explains **why** and lists the
> target versions; this doc is the **ordered, error-free execution path**. Each
> phase is a self-contained commit with an explicit exit gate — do not start a
> phase until the previous phase's gate is green. If a gate fails, fix it inside
> that phase before moving on. Every command runs from `mobile/`.

## Ground rules

- **One phase = one commit.** Keeps `git bisect` trivial if something regresses.
- **Never skip a gate.** A phase is "done" only when its checklist passes.
- **Physical device required for Phase 8.** CI proves it compiles; only a device
  proves it runs.
- **Rollback unit is the phase.** If a phase goes bad, `git reset --hard` to the
  previous phase's commit and retry — you never lose more than one phase.
- **Do not combine with feature work.** Land the whole sequence as one focused PR.

---

## Phase 0 — Baseline & safety net

Establish a known-good starting point so every later phase has something to
compare against.

```bash
cd mobile
git switch -c chore/expo-57-migration   # or your designated branch
npm ci                                  # clean install from the current lockfile
npm run typecheck                       # must be clean BEFORE we touch anything
npm run lint                            # record current warning/error count
CI=1 npx expo export --platform ios --platform android --output-dir /tmp/baseline
```

**Record** the current state: typecheck clean, lint count, and that both bundles
export. Note the current SDK 52 versions (already captured in `package.json`).

**Gate:** typecheck clean, both bundles export. Commit nothing yet (no changes) —
this phase is a measurement, not a change.

---

## Phase 1 — Core SDK bump (Expo 57 + native dep alignment)

The single biggest step. Expo's `--fix` realigns every native module to its
SDK 57 version in one shot.

```bash
npx expo install expo@^57.0.0 --fix
```

This moves `expo`, `react-native` (→0.86.x), all `expo-*` modules, and the
native libraries (`react-native-screens`, `safe-area-context`,
`gesture-handler`, `async-storage`, `skia`, `expo-router`, google-signin) to
their SDK-matched versions.

**Do not run typecheck yet** — React 19 and Reanimated 4 aren't wired up, so
errors here are expected and misleading. Just confirm the install resolved:

```bash
npx expo install --check   # reports any dep still off the SDK 57 target
```

**Gate:** `expo install --check` reports no mismatches. Commit as
`chore(mobile): bump Expo SDK 52 → 57 core + native deps`.

> If this produces a wall of resolution errors, abort and use the two-hop path
> (see **Appendix: two-hop fallback**) — do the 52→54 hop as its own phase, then
> resume here at 54→57.

---

## Phase 2 — React 19

SDK 53+ requires React 19. `--fix` moves `react`/`react-native`'s peer, but the
types are a devDependency we set explicitly.

```bash
npm i -D @types/react@~19.2
```

`ref` is a plain prop in React 19. This codebase uses no `forwardRef` or string
refs, so no source changes are expected — but run the typecheck to confirm the
React 19 type surface is clean (Reanimated errors may still appear; that's
Phase 3).

**Gate:** no React-19-specific type errors (JSX, hooks, `ref`, component
signatures). Commit as `chore(mobile): React 19 + @types/react 19`.

---

## Phase 3 — Reanimated 4 + worklets runtime

Reanimated 4 splits its worklets engine into a separate package and renames the
Babel plugin. **The app will not bundle until this is done** — a "worklets"
error is the signature of a missed step here.

```bash
npx expo install react-native-worklets
```

Then edit `mobile/babel.config.js` — swap the plugin and keep it **last** in the
array:

```js
// before: plugins: ["react-native-reanimated/plugin"]
plugins: ["react-native-worklets/plugin"],
```

**Gate:** `npm run typecheck` clean AND a bundle succeeds:

```bash
npm run typecheck
CI=1 npx expo export --platform ios --output-dir /tmp/phase3
```

Commit as `chore(mobile): Reanimated 4 + worklets babel plugin`.

---

## Phase 4 — Moti compatibility decision

`moti` is only consumed by the Expo Go fallback component
`src/ui/convergence-field-fallback.tsx`. It either supports Reanimated 4 or it
doesn't — decide here, in isolation.

1. After Phase 3, try the bundle. If it builds and `moti` resolves against
   Reanimated 4, **keep it** — verify the pinned version supports RN-worklets.
2. If `moti` blocks the build (unmet Reanimated peer, worklets error tracing to
   moti), **rewrite that one file** in plain Reanimated —
   `Animated.View` + `withRepeat`/`withTiming` — and remove the dependency:

```bash
npm uninstall moti
```

**Gate:** bundle succeeds with the moti decision applied (kept-and-verified, or
removed-and-rewritten). Commit as either
`chore(mobile): verify moti on Reanimated 4` or
`refactor(mobile): drop moti, rewrite ConvergenceField in plain Reanimated`.

---

## Phase 5 — Lint config simplification

SDK 57's `eslint-config-expo` ships a native flat config and bundles its own
plugin deps, so the FlatCompat shim and the direct `eslint-plugin-react-hooks`
pin become dead weight.

```bash
npx expo install eslint-config-expo@^57   # or add to devDeps at the SDK-matched version
npm uninstall @eslint/eslintrc eslint-plugin-react-hooks
```

Rewrite `mobile/eslint.config.js` to consume the flat export directly (drop
`FlatCompat`):

```js
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  { ignores: ["dist/*", ".expo/*", "expo-env.d.ts", "eslint.config.js", "babel.config.js"] },
  ...expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
```

**Gate:** `npm run lint` — 0 errors (warnings acceptable, at or below the
Phase 0 baseline). Commit as `chore(mobile): flat eslint-config-expo 57, drop FlatCompat shim`.

---

## Phase 6 — Clean reinstall & full static verification

Prove the whole dependency graph resolves from scratch — not just incrementally
patched node_modules.

```bash
rm -rf node_modules
npm install
npm run typecheck                       # clean
npm run lint                            # 0 errors
CI=1 npx expo export --platform ios --platform android --output-dir /tmp/phase6
```

**Gate:** typecheck clean, lint 0 errors, **both** platform bundles export.
Commit the refreshed `package-lock.json` as
`chore(mobile): clean reinstall + lockfile for SDK 57`.

---

## Phase 7 — Rebuild native dev clients

Native modules changed, so the old dev client binary is stale — JS-only reloads
won't reflect the native side.

```bash
npx expo run:ios          # and/or:
npx expo run:android
# or, for a device build:
eas build --profile development-device
```

**Gate:** dev client builds and launches; app boots to the first screen without
a native crash. No commit (build artifacts aren't versioned) — this gates Phase 8.

---

## Phase 8 — Device verification (the real gate)

Automated checks can't catch runtime/native behavior. Walk the full app on a
**physical device**, in this order:

1. Onboarding quiz → **ConvergenceField finale** (Skia render + animation).
2. Feed scroll — confirm **60fps**, no jank.
3. Chat + **streamed "why"** response.
4. Story **swipe gestures + haptics**.
5. Bucket add/remove.
6. Profile **consent toggle**.
7. **Sign-out / sign-in** (Google token flow — re-check `src/lib/oauth.ts`
   response-shape read).
8. **Android edge-to-edge:** verify tab bar and story-screen insets aren't
   clipped on an Android 15+ device. Add `react-native-edge-to-edge` config
   **only if** something clips.
9. **Splash screen:** confirm `resizeMode`/`backgroundColor` still render (config
   options occasionally rename across majors — re-check against SDK 57 docs).

**Gate:** every item passes on device. File any runtime fix as its own follow-up
commit within this PR.

---

## Phase 9 — CI + installable sanity build

```bash
eas build --profile preview            # installable build for a final sanity check
```

Open the PR; CI runs the same three checks (typecheck, lint, dual-platform
export).

**Gate:** CI green **and** the preview build installs and launches. Ready to
merge.

---

## Web-side majors — separate, low urgency (do NOT bundle into this PR)

Tracked here only so they're not forgotten. Each is its own future PR.

| Package | Now | Action | Trigger to act |
|---|---|---|---|
| `eslint` | 9.x | → 10.x | Only once `eslint-config-next` declares eslint-10 support; bump both together |
| `typescript` | 5.9 | → 6.0 | Wait for Next.js + typescript-eslint official support |
| `@types/node` | 20.x | → **22.x** | Match the Node 22 CI/Vercel runtime (not 26) |
| `three` / `@types/three` | 0.184 | → 0.185 | Routine minor; bump with a visual check of the landing hero |

Everything else web-side is already current (Next 16.2.10, React 19.2.7,
Tailwind 4, zod 4, supabase-js 2.110).

---

## Appendix: two-hop fallback (52 → 54 → 57)

If the direct Phase 1 jump produces unresolvable errors, split it into two
sequenced hops, each with the same gate as Phase 1:

- **Phase 1a:** `npx expo install expo@^54.0.0 --fix` → `expo install --check`
  clean → commit.
- **Phase 1b:** `npx expo install expo@^57.0.0 --fix` → `expo install --check`
  clean → commit.

Then resume at Phase 2. React 19 is required from SDK 53, so if you stop at 54
for testing, still do Phase 2 before bundling.

---

## Phase gate summary

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 | Baseline recorded | typecheck clean, both bundles export |
| 1 | Expo 57 core + native deps | `expo install --check` clean |
| 2 | React 19 + types | no React-19 type errors |
| 3 | Reanimated 4 + worklets babel | typecheck clean, iOS bundle |
| 4 | Moti kept-or-dropped | bundle succeeds |
| 5 | Flat eslint config | `npm run lint` 0 errors |
| 6 | Clean reinstall | typecheck + lint + both bundles |
| 7 | Native dev clients | builds, boots without native crash |
| 8 | Device walkthrough | all 9 flows pass on device |
| 9 | CI + preview build | CI green, preview installs |

## Effort estimate

- Phases 0–6 (mechanical, compile-green): **~half a day**.
- Phases 7–9 (device verification + runtime fixes): **half a day to a day**,
  hardware-dependent.
