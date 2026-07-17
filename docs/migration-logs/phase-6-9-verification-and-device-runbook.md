# Phases 6–9 — Verification gate, native validation & device runbook

> Executed / prepared 2026-07-06 per `docs/EXPO_SDK_MIGRATION_PHASES.md`, on
> branch `claude/expo-57-phases-0-2` (PR #29, Phases 0–5).
>
> **Environment note:** Phases 6 and 7-config-validation were run here. Phases 7
> (native compile), 8 (device), and 9 (`eas build`) **require a macOS/Android
> toolchain, a physical device, and an authenticated EAS account — none of which
> exist in the headless Linux CI container.** Those sections are a runbook for a
> human operator, not a completed log.

## Phase 6 — Clean-reinstall gate ✅ (done here)

Verified on a from-scratch tree (`rm -rf node_modules && npm ci` from the
committed lockfile — exactly what CI does):

| Check | Result |
|---|---|
| `npm ci` (committed lockfile in sync) | ✅ |
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ 0 errors (6 warnings) |
| `expo export` ios + android | ✅ both bundles |
| `babel-preset-expo` hoisted in clean tree | ✅ |
| `npm audit` | 12 moderate (all high-severity SDK 52 findings cleared) |

The committed HEAD (`9cf20dc`) is exactly this verified tree, so PR #29's CI
(`npm ci` → typecheck → lint → `expo export`) is expected green.

## Phase 7 — Native config validation ✅ (runnable part done here)

Full `expo run:ios` / `expo run:android` compiles need Xcode / Android SDK
(absent here). The **config-plugin + native-project generation** step *was* run
via `expo prebuild` for both platforms — this is where SDK 57 config-plugin
breakage would surface, and it's the risk area the migration doc called out.

```
npx expo prebuild --platform android --no-install   → ✔ Finished prebuild (exit 0)
npx expo prebuild --platform ios     --no-install   → ✔ Finished prebuild (exit 0)
```

**All config plugins applied cleanly under SDK 57:** `expo-router`, `expo-font`,
`expo-dev-client`, `expo-apple-authentication`, `@react-native-google-signin/google-signin`,
`expo-splash-screen`, `expo-asset`.

Findings against the doc's flagged risks:

| Doc risk | Generated-project reality | Verdict |
|---|---|---|
| New Architecture | `newArchEnabled=true`, `hermesEnabled=true` | ✅ on, as expected |
| **Android edge-to-edge (enforced 15+)** | SDK 57 auto-set `edgeToEdgeEnabled=true` | ⚠️ **must verify insets on device** (Phase 8) |
| Splash-screen option renames | `windowSplashScreenBackground=#0c0a08`, logo drawables, iOS `SplashScreen.storyboard` + colorset all generated from the existing `resizeMode`/`backgroundColor` config | ✅ no rename breakage |
| Google-signin plugin shape | `iosUrlScheme` still the config key; URL scheme written into iOS `Info.plist` | ✅ shape unchanged |

> **Pre-existing config gap (not a migration issue):** `app.json`'s google-signin
> `iosUrlScheme` is still the placeholder `com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID`.
> A real reversed iOS client ID must be set (or injected) before the Google
> sign-in flow works in a real build — relevant to the Phase 8 auth test.

The generated `android/` and `ios/` directories were **removed after validation**
(managed workflow — they are regenerated at build time and are not committed).
No code changes result from Phase 7.

## Phase 8 — Device verification ⏳ (RUNBOOK — needs a physical device)

This is the real gate. Build a dev client and walk the app on a device.

```bash
cd mobile
# Build + install a dev client (pick your platform / path):
npx expo run:ios            # macOS + Xcode + device/simulator
npx expo run:android        # Android SDK + device/emulator
# or a cloud device build:
eas build --profile development-device
```

Walk these flows **in order** and check each:

- [ ] Onboarding quiz → **ConvergenceField finale** — Skia render + animation smooth.
- [ ] Feed scroll — **60fps**, no jank.
- [ ] Chat + **streamed "why"** response renders incrementally.
- [ ] Story **swipe gestures + haptics** fire.
- [ ] **Moti animations at runtime** — MotiView/AnimatePresence on **sign-in,
      onboarding, chat, and feed**. *Phase 4 kept Moti 0.29 on build-compat
      evidence only; this is the runtime confirmation. If any Moti animation is
      broken/janky under Reanimated 4, that's the trigger to revisit Phase 4
      (upgrade or replace Moti).*
- [ ] **Android edge-to-edge** (Android 15+ device) — tab bar + story-screen
      insets not clipped under status/nav bars. If clipped, add
      `react-native-edge-to-edge` config.
- [ ] Splash screen — background `#0c0a08` + logo render correctly on cold start.
- [ ] Bucket add/remove.
- [ ] Profile **consent toggle** persists.
- [ ] **Google + Apple sign-out / sign-in** (needs the real `iosUrlScheme`; re-check
      the token response-shape read in `src/lib/oauth.ts`).

## Phase 9 — CI green + installable build ⏳ (RUNBOOK)

- [ ] Confirm PR #29 CI is green (typecheck, lint, `expo export` — all three).
- [ ] `eas build --profile preview` → install the artifact on a device for a
      final sanity check.
- [ ] Merge PR #29 → `main`.

## Summary of what's left for a human operator

Everything statically verifiable is **green** (typecheck, lint, both bundles,
all config plugins). The remaining work is inherently hardware/account-gated:
1. Set the real google-signin `iosUrlScheme`.
2. Build a dev client (Xcode/Android SDK or EAS).
3. Walk the Phase 8 device checklist — **Moti runtime and Android edge-to-edge
   insets are the two items most likely to need a fix.**
4. `eas build --profile preview` and merge.

## Post-review refinements (2026-07-07)

Two `mobile/package.json` cleanups from the PR review, both re-verified on a
clean `npm ci` (typecheck, lint 0 errors, ios+android bundles all green):

1. **`react-dom` moved from `dependencies` → `overrides`.** The app is
   native-only (`app.json` → `platforms: ["ios","android"]`), so `react-dom` is
   never a runtime dependency — it is only pulled transitively and needs its
   version constrained to match react's exact-match peer. An `overrides` entry
   (`"react-dom": "19.2.3"`) pins the transitive version without declaring a
   phantom production dependency. Confirmed react-dom still resolves to 19.2.3.

2. **`babel-preset-expo` pin widened `~57.0.1` → `^57.0.0`.** The tight `~`
   range could drift from `expo` (`^57.0.0`): a future `expo` 57.x patch bundling
   a newer `babel-preset-expo` would collide with a 57.0.x lock. `^57.0.0` tracks
   the same range as `expo`, so it stays a single hoisted copy across SDK patch
   bumps. (This dep is declared directly only to force npm to hoist the preset to
   the top level, where `babel.config.js` resolves it — see Phase 3.) Confirmed
   still hoisted (resolved 57.0.1).
