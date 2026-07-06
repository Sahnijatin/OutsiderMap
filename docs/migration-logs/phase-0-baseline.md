# Phase 0 — Baseline & safety net (execution log)

> Executed 2026-07-06 per `docs/EXPO_SDK_MIGRATION_PHASES.md`. Phase 0 is a
> **measurement**, not a change — this log is the recorded known-good starting
> point that every later phase compares against. No source or dependency files
> were modified in this phase.

## Environment

| Tool | Version |
|---|---|
| Node | v22.22.2 |
| npm | 10.9.7 |
| Branch | `claude/expo-57-phases-0-2` (off `origin/main`) |

## Starting versions (SDK 52)

| Package | Version |
|---|---|
| `expo` | 52.0.49 |
| `react-native` | 0.76.5 |
| `react` | 18.3.1 |
| `react-native-reanimated` | 3.16.7 |

(Full dependency set as pinned in `mobile/package.json` / `package-lock.json` at
this commit.)

## Gate results

| Check | Command | Result |
|---|---|---|
| Clean install | `npm ci` | ✅ 1187 packages installed from lockfile |
| Typecheck | `npm run typecheck` | ✅ clean (exit 0) |
| Lint | `npm run lint` | ✅ **0 errors**, 4 warnings |
| iOS bundle | `CI=1 npx expo export --platform ios` | ✅ `entry.hbc` 5.4 MB |
| Android bundle | `CI=1 npx expo export --platform android` | ✅ `entry.hbc` 5.4 MB |

**Gate: PASSED** — typecheck clean, both platform bundles export.

### Lint baseline detail (4 warnings, expected)

All four are the intentional `react-hooks/set-state-in-effect` pattern, already
downgraded to `warn` in `eslint.config.js`:

- `app/(app)/profile.tsx:29` — `load()` in effect
- `src/lib/session.tsx:51` — `setProfileReady(false)` in effect
- (plus the two paired occurrences the rule reports for the same effects)

These are the acceptable baseline. Later phases must stay **at or below** this
count — a lint gate is "0 errors", warnings ≤ 4.

### Known audit findings (expected, resolved by the SDK bump)

`npm audit` reports **25 vulnerabilities (7 moderate, 18 high)** in the SDK 52
build toolchain (e.g. `@xmldom/xmldom` via `@expo/cli`). These are the findings
the migration is expected to clear — recorded here so Phase 6 can confirm they
drop after the SDK 57 upgrade.

## Rollback anchor

This branch at this commit is the safe rollback point for Phase 1. If Phase 1
(the core Expo 57 bump) goes bad, `git reset --hard` to this commit and retry.

## Next

Proceed to **Phase 1 — Core SDK bump** (`npx expo install expo@^57.0.0 --fix`)
on this same branch (this PR carries phases 0–2).
