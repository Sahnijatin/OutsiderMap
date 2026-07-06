# Phases 1 & 2 — Core SDK bump + React 19 (execution log)

> Executed 2026-07-06 per `docs/EXPO_SDK_MIGRATION_PHASES.md`, on branch
> `claude/expo-57-phases-0-2` (PR #29). Phases 1 and 2 turned out to be
> **atomically interdependent** and are landed in a single commit — see
> "Why one commit" below.

## What changed (`mobile/package.json`)

Driven by `npx expo install expo@^57.0.0 --fix`, which rewrote the manifest to
the SDK 57 targets, plus three manual fixes required to make the tree resolve
and typecheck.

| Package | 52 | 57 | Source |
|---|---|---|---|
| `expo` | ~52.0.0 | 57.0.2 | `--fix` |
| `react-native` | 0.76.5 | 0.86.0 | `--fix` |
| `react` | 18.3.1 | 19.2.3 | `--fix` |
| `react-native-reanimated` | ~3.16.1 | 4.5.0 | `--fix` (babel rename is **Phase 3**) |
| `@shopify/react-native-skia` | ^1.5.0 | 2.6.2 | `--fix` |
| `react-native-screens` | ~4.1.0 | 4.25.2 | `--fix` |
| `react-native-safe-area-context` | 4.12.0 | ~5.7.0 | `--fix` |
| `react-native-gesture-handler` | ~2.20.2 | ~2.32.0 | `--fix` |
| `@react-native-async-storage/async-storage` | 1.23.1 | 2.2.0 | `--fix` |
| `@expo/vector-icons` | ^14.0.4 | ^15.0.2 | `--fix` |
| all `expo-*` modules | SDK 52 | ~57.x | `--fix` |
| `@types/react` | ~18.3.12 | ~19.2.0 | **manual (Phase 2)** |
| `react-dom` | (absent) | 19.2.3 | **manual (see note 2)** |
| `typescript` | ~5.3.3 | ~6.0.3 | **manual (see note 3)** |

Installed resolved versions: `@types/react` 19.2.17, react-dom 19.2.3.

## Three problems hit and how they were fixed (error-free path)

1. **`--fix` couldn't materialize `node_modules`.** The command rewrote
   `package.json` + lockfile to SDK 57 but its incremental `npm install` failed
   on a stale, half-old/half-new tree (`skia@1.12.4` still on disk, lockfile
   still pinning it). **Fix:** delete `node_modules` *and* `package-lock.json`,
   reinstall clean so npm resolves the SDK 57 manifest from scratch.

2. **`@types/react` 18 blocked the clean install.** RN 0.86's
   `@react-native/virtualized-lists` requires `@types/react@^19.2.0` — the tree
   will not resolve on the old types. This is Phase 2, but the Phase 1 install
   depends on it, so the two phases are inseparable. **Fix:** bump
   `@types/react` to `~19.2.0`.

3. **`react`/`react-dom` version skew.** react is pinned exactly to `19.2.3`
   (Expo's SDK-tested version), but react-dom (pulled transitively for Expo web)
   re-resolved to the newer `19.2.7` patch, and react-dom requires an *exact*
   react match. **Fix:** pin `react-dom` to `19.2.3` to lockstep with react.

4. **TypeScript 5.3 couldn't parse the SDK 57 tsconfig.** `expo/tsconfig.base.json`
   uses a `--module` value newer than TS 5.3 understands (`error TS6046`). SDK 57
   expects `typescript@~6.0.3`. **Fix:** bump TypeScript to `~6.0.3`; typecheck
   then passes clean.

## Why one commit (not two)

The plan schedules Phase 1 (SDK bump) and Phase 2 (React 19) as separate commits.
In practice RN 0.86 **hard-requires** `@types/react` 19 to install at all, so
there is no ordering in which a Phase-1-only commit installs or typechecks. A
faked split would leave a non-installable intermediate commit — worse for
bisecting than one honest, self-consistent commit. They are landed together and
labeled as such.

## Gate results

| Phase | Gate | Result |
|---|---|---|
| 1 | `npx expo install --check` clean | ✅ only `eslint-config-expo@8` remains — **deferred to Phase 5** (next PR); all native/runtime deps aligned |
| 2 | `npm run typecheck` clean | ✅ clean on TS 6 + React 19 (exit 0) |

`npm audit`: **25 vulns (18 high) → 12 moderate** — the high-severity SDK 52
toolchain findings cleared by the bump, as predicted in the baseline.

## Deliberately NOT done in this PR

- **Bundle export is not run.** `--fix` moved Reanimated to 4.x, but the babel
  plugin rename (`react-native-reanimated/plugin` → `react-native-worklets/plugin`)
  is **Phase 3**. Until then the app won't bundle — expected, and exactly why the
  Phase 1/2 gates are `--check` + typecheck rather than a bundle. `babel.config.js`
  is intentionally unchanged here.
- **eslint / lint gate** — `eslint-config-expo` stays at 8.x; the flat-config
  swap is **Phase 5**.

## Next PR (Phases 3–5)

3. Reanimated 4 worklets runtime + babel plugin rename → restores bundling.
4. Moti compatibility decision.
5. Flat `eslint-config-expo` 57 → clears the last `--check` item and the lint gate.
