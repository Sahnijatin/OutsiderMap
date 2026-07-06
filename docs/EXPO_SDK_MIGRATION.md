# Expo SDK 52 → 57 migration plan (+ web dependency majors)

> Written 2026-07-02. The mobile app is five Expo SDK majors behind. This is
> the playbook for the jump — **do it with a physical device in hand**; the
> CI bundle check catches compile breakage but not runtime/native behavior.

## Why this is required (not optional)

1. **Store submission.** Google Play's target-API floor moves yearly; SDK 52
   (RN 0.76 / Android target 34) will be rejected. Apple similarly requires a
   recent Xcode/iOS SDK toolchain, which old Expo SDKs don't support.
2. **Expo Go.** The Expo Go app in the stores only speaks the newest SDKs —
   testing on SDK 52 via Expo Go gets harder every month.
3. **Security.** The `npm audit` findings in the build toolchain
   (`@xmldom/xmldom` via `@expo/cli`) are all fixed by the SDK bump.

## Current → target

| Package | Now (SDK 52) | Target (SDK 57) | Notes |
|---|---|---|---|
| `expo` | ~52.0.0 | ~57.x | `npx expo install expo@^57 --fix` drives most of the rest |
| `react-native` | 0.76.5 | 0.86.x | New Architecture only (we already run `newArchEnabled: true` ✅) |
| `react` / `@types/react` | 18.3.1 / 18.x | 19.2.x / 19.x | SDK 53+ requires React 19 |
| `react-native-reanimated` | ~3.16 | ~4.x | v4 splits worklets into `react-native-worklets`; babel plugin becomes `react-native-worklets/plugin` |
| `moti` | 0.29/0.30 | verify v4-compat | Only consumer left is the Expo Go fallback ConvergenceField — if moti blocks the upgrade, rewrite that one component in plain Reanimated and **drop moti** |
| `@shopify/react-native-skia` | ^1.5 | ^2.x | API we use (`Canvas`, `Circle`, `useClock`, derived values) is stable across v2 |
| `expo-router` | ~4.0 | ~6.x | File conventions unchanged; typed routes now stable (drop `experiments.typedRoutes` if the field moves) |
| `@react-native-async-storage/async-storage` | 1.23.1 | 3.x | Storage format compatible; API unchanged for our usage |
| `react-native-safe-area-context` | 4.12 | 5.x | `SafeAreaView` import path unchanged |
| `react-native-screens` | 4.1 | 4.25+ | No app-code changes expected |
| `react-native-gesture-handler` | 2.20 | 3.x | We don't use the deprecated gesture APIs; low risk |
| `@react-native-google-signin/google-signin` | ^16 | latest | Config-plugin shape (`iosUrlScheme`) unchanged; re-check the "response shape" defensive read in `src/lib/oauth.ts` |
| `react-native-url-polyfill` | 2.x | keep | supabase-js still wants a full URL impl on Hermes; re-test before removing |
| `eslint-config-expo` | ~8.0 (legacy + FlatCompat) | 57.x (native flat config) | **Simplification:** delete the FlatCompat shim in `mobile/eslint.config.js` and the direct `eslint-plugin-react-hooks` pin — the SDK-matched config ships flat config and its own plugin deps |
| All `expo-*` modules | SDK 52 versions | `--fix` aligned | `expo-asset`, `expo-font`, `expo-haptics`, `expo-image`, `expo-linear-gradient`, `expo-splash-screen`, `expo-dev-client`, `expo-apple-authentication`, `expo-web-browser`, `expo-status-bar`, `expo-system-ui`, `expo-constants`, `expo-linking` |

## Procedure

Work on a branch; keep each phase a separate commit so bisecting is trivial.

```bash
cd mobile

# 1. The big bump — let Expo align every native dep to SDK 57
npx expo install expo@^57.0.0 --fix

# 2. React 19 types
npm i -D @types/react@~19.2

# 3. Reanimated 4: install the worklets runtime and update babel
npx expo install react-native-worklets
#    babel.config.js: 'react-native-reanimated/plugin' → 'react-native-worklets/plugin'
#    (must stay LAST in the plugins array)

# 4. Lint config simplification (see table): eslint-config-expo@^57,
#    remove FlatCompat + the react-hooks pin, use its flat export directly.

# 5. Reinstall clean + verify
rm -rf node_modules && npm install
npm run typecheck && npm run lint
CI=1 npx expo export --platform ios --platform android --output-dir /tmp/x

# 6. Rebuild dev clients (native modules changed!)
npx expo run:ios     # and/or: eas build --profile development-device
```

If the direct 52→57 jump produces a wall of errors, fall back to two hops
(52→54, then 54→57) — same commands with `expo@^54` first.

## Known breakage to expect

- **Reanimated 4 / babel:** the app won't bundle until the babel plugin is
  renamed. Error mentions "worklets" — that's this.
- **Moti:** if `moti` hasn't published Reanimated-4 support, the fallback
  ConvergenceField (`src/ui/convergence-field-fallback.tsx`) is the only file
  that imports it. Rewrite with `Animated.View` + `withRepeat`/`withTiming`
  and remove the dependency rather than blocking the upgrade.
- **React 19:** `ref` is a normal prop now; we don't use `forwardRef` or
  string refs, so expect no changes — but watch third-party warnings.
- **Android edge-to-edge (SDK 54+):** enforced on Android 15+. We already use
  `react-native-safe-area-context` everywhere (`SafeAreaView` edges) — verify
  the tab bar and story screen insets on a device; add
  `react-native-edge-to-edge` config only if something clips.
- **expo-splash-screen:** config-plugin options occasionally rename across
  majors; re-check `resizeMode`/`backgroundColor` under the SDK 57 docs.
- **Google sign-in:** rebuild the dev client (native), re-test the token
  response shape (`oauth.ts` already reads both shapes defensively).

## Verification checklist (in order)

1. `npm run typecheck` — clean.
2. `npm run lint` — 0 errors.
3. `CI=1 npx expo export --platform ios --platform android` — both bundles.
4. CI green on the PR (same three checks run there).
5. **Device pass (the real gate):** onboarding quiz → ConvergenceField finale
   (Skia), feed scroll at 60fps, chat + streamed why, story swipe gestures +
   haptics, bucket, profile consent toggle, sign-out/in.
6. `eas build --profile preview` for an installable sanity build.

## Web-side majors (separate, low urgency)

| Package | Now | Latest | Recommendation |
|---|---|---|---|
| `eslint` | 9.x | 10.x | Wait until `eslint-config-next` declares eslint-10 support, then bump both together |
| `typescript` | 5.9 | 6.0 | Wait for Next.js + typescript-eslint official support; zero product value in rushing |
| `@types/node` | 20.x | 26.x | Bump to **22.x** (match the Node 22 runtime used in CI/Vercel), not 26 |
| `three` / `@types/three` | 0.184 | 0.185 | Routine minor; bump with a visual check of the landing hero |

Everything else on the web side is already current (Next 16.2.10, React
19.2.7, Tailwind 4, zod 4, supabase-js 2.110).

## Effort estimate

- Mechanical upgrade + compile-green: **half a day**.
- Device verification + fixing runtime niggles (insets, animations, auth):
  **half a day to a day**, hardware-dependent.
- Don't combine with feature work; land it as one focused PR.
