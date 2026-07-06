# Phases 3–5 — Reanimated 4 / Moti / flat ESLint (execution log)

> Executed 2026-07-06 per `docs/EXPO_SDK_MIGRATION_PHASES.md`, on branch
> `claude/expo-57-phases-3-5` (stacked on `claude/expo-57-phases-0-2`, PR #29).
> This batch **restores bundling**, so it turns the red `expo export` CI check on
> PR #29 green as well.

## Phase 3 — Reanimated 4 worklets runtime + babel plugin

**Planned:** install `react-native-worklets`, rename the babel plugin
(`react-native-reanimated/plugin` → `react-native-worklets/plugin`, kept last).

**Also required (two unplanned blockers that stopped the bundle):**

1. **`babel-preset-expo` was not resolvable.** After the plugin rename the
   bundle still failed: `Cannot find module 'babel-preset-expo'`. npm kept
   `babel-preset-expo` **nested** under `node_modules/expo/node_modules/`, but
   `babel.config.js` references the preset by name and Babel resolves it from the
   project root — where it wasn't. A clean reinstall and `npm dedupe` both left
   it nested. **Fix:** declare `babel-preset-expo@~57.0.1` as a direct
   devDependency (correct hygiene — `babel.config.js` references it directly —
   and it forces the hoist to top-level).

2. **`@babel/runtime` was pinned to `^8.0.0` (Babel 8).** This is a pre-existing
   repo anomaly that only surfaced under SDK 57: `babel-preset-expo@57` and every
   other consumer (`expo`, `metro-runtime`) require `@babel/runtime@^7.x`, and
   nothing in the tree needs 8. The `^8` pin blocked declaring `babel-preset-expo`
   as a dep (peer conflict). **Fix:** correct `@babel/runtime` to `^7.20.0` (the
   version the whole SDK 57 graph expects).

**Files:** `babel.config.js` (plugin rename); `package.json`
(`+react-native-worklets@0.10.0`, `+babel-preset-expo@~57.0.1` dev,
`@babel/runtime ^8.0.0 → ^7.20.0`).

**Gate:** `npm run typecheck` clean; `expo export` **both bundles** ✅ (was the
red CI check on PR #29).

## Phase 4 — Moti compatibility decision → **KEEP**

**Doc correction:** `EXPO_SDK_MIGRATION.md` states moti's "only consumer left is
the Expo Go fallback ConvergenceField." That is **stale** — `MotiView` /
`AnimatePresence` are imported in **five** files, four of them core screens:

- `src/ui/convergence-field-fallback.tsx`
- `app/(auth)/sign-in.tsx`
- `app/onboarding.tsx`
- `app/(app)/chat.tsx`
- `app/(app)/index.tsx`

Had moti been incompatible, the planned "rewrite one file" fallback would have
been a five-file job across the core UX. It isn't needed: **moti 0.29 is
build-compatible with Reanimated 4** — its peer is `react-native-reanimated: *`,
all five files typecheck against the React 19 / Reanimated 4 types, and the
production `expo export` bundles every one of them cleanly.

**Decision:** keep moti (no dependency change, no rewrite). **Runtime** behavior
(actual animations) is verified on-device in Phase 8 — build-time green is not a
runtime guarantee.

## Phase 5 — Flat `eslint-config-expo` 57

**Planned:** swap to the SDK-matched flat config; delete the `FlatCompat` shim
and the direct `eslint-plugin-react-hooks` pin (the flat config bundles its own
plugin deps, incl. react-hooks — verified).

**Changes:**
- `package.json`: `eslint-config-expo ~8.0.1 → ^57.0.0`; removed
  `@eslint/eslintrc` and `eslint-plugin-react-hooks`.
- `eslint.config.js`: `FlatCompat(...).extends("expo")` → `...require("eslint-config-expo/flat")`.

**One extra rule adjustment:** the SDK 57 flat config newly enables
`react/no-unescaped-entities` as an **error**, producing 8 errors on intentional
copy (e.g. quoted example prompts in `chat.tsx`, "Editor's note" in
`experience/[slug].tsx`). This is a web/HTML rule — raw quotes/apostrophes are
irrelevant to React Native `<Text>`, and it was not enforced at the Phase 0
baseline. To keep the migration behavior-neutral (not rewrite product copy), the
rule is set to `off` in the override block, with a comment explaining why.

**Gate:** `npm run lint` — **0 errors** (6 warnings). The 4 `set-state-in-effect`
warnings match baseline; +2 are `@typescript-eslint/no-require-imports` on the
intentional platform-split `require()`s in `ConvergenceField.tsx` (warnings only,
non-blocking).

## Full batch verification (clean `npm ci`, = what CI runs)

| Check | Result |
|---|---|
| `npm ci` from committed lockfile | ✅ in sync |
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ 0 errors |
| `expo export` ios + android | ✅ both bundles |
| `babel-preset-expo` hoisted in clean tree | ✅ yes |
| `npm audit` | 12 moderate (high-severity findings cleared back in Phases 1–2) |

## Net dependency changes this batch

- `+ react-native-worklets@0.10.0`
- `+ babel-preset-expo@~57.0.1` (dev; makes the preset resolvable)
- `@babel/runtime`: `^8.0.0 → ^7.20.0` (correct the anomaly)
- `eslint-config-expo`: `~8.0.1 → ^57.0.0`
- `− @eslint/eslintrc`, `− eslint-plugin-react-hooks`

## What remains (final batch)

Phases 0–5 leave the app **static-green** (typecheck + lint + bundle). Still
outstanding from the plan, for a later batch/PR:
- **Phase 6** — final clean-reinstall gate (effectively done here; formalize +
  commit lockfile).
- **Phase 7** — rebuild native dev clients.
- **Phase 8** — device verification (the real gate: Skia finale, 60fps feed,
  chat stream, gestures + haptics, **moti animations at runtime**, edge-to-edge
  insets, auth).
- **Phase 9** — CI green + `eas build --profile preview`.
