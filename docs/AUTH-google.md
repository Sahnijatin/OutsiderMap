# Google sign-in: setup and troubleshooting

Everything needed to turn "Continue with Google" on, and what each failure
looks like when it isn't. Nothing here can be done in code - it is consoles,
credentials and one redeploy.

Related: `MANUAL_SETUP.md` (the founder checklist this satisfies),
`MOBILE_PLAN.md` §Native sign-in (the iOS/Android half), `docs/RUNBOOK-prod.md`
(production env vars).

## 1. What you are wiring

There are two entirely separate Google paths, and configuring one does not
configure the other.

| Path | Where | Mechanism | Gated on |
|---|---|---|---|
| **Web redirect** | Browser, `/sign-in` and `/` | `signInWithOAuth` → Google → Supabase → `/auth/callback` | `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (or `NEXT_PUBLIC_GOOGLE_WEB_AUTH=1`) |
| **Native sheets** | Capacitor app | OS account picker → id token → `signInWithIdToken` | `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` |

Each button only renders once its variable is set. That is deliberate: the
browser cannot ask Supabase whether the Google provider is enabled, so the
presence of the client ID - the same string you paste into Supabase - stands in
as proof that someone did the setup. **Unset means the button is hidden**, and
members see the email code alone, which always works.

`NEXT_PUBLIC_GOOGLE_WEB_AUTH` is the manual override: `1` forces the web button
on without shipping a client ID in the bundle, `0` forces it off when the
client ID exists for the native apps but the web provider is disabled.

## 2. Prerequisites

- A Google Cloud project.
- Your Supabase project ref (the `<ref>` in `https://<ref>.supabase.co`).
- Access to the Vercel project's environment variables.

## 3. Google Cloud - OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type **External**. Create.
3. App name `OutsiderMap`, a support email, and the logo if you have it.
4. **Authorised domains**: `outsidermap.com`.
5. **Scopes**: `openid`, `email`, `profile`. Nothing else - extra scopes trigger
   a verification review you do not need.
6. While the app is in **Testing**, only accounts listed under *Test users* can
   sign in; everyone else gets a 403 consent error. **Publish** when you want
   real members.

## 4. Google Cloud - the Web OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. **Authorised JavaScript origins**:
   - `https://www.outsidermap.com`
   - `http://localhost:3000`
4. **Authorised redirect URIs** — this is the step people get wrong:

   > **`https://<project-ref>.supabase.co/auth/v1/callback`**

   That is **Supabase's** callback, not ours. Google hands the code to
   Supabase, which then redirects to our `/auth/callback`. Putting
   `https://www.outsidermap.com/auth/callback` here produces
   `redirect_uri_mismatch` on every attempt.
5. Copy the **client ID** and **client secret**.

## 5. Supabase

1. **Authentication → Providers → Google** → enable, paste the client ID and
   secret, save.
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://www.outsidermap.com`
   - *Redirect URLs* must include:
     - `https://www.outsidermap.com/auth/callback`
     - `http://localhost:3000/auth/callback`

   A destination missing from this allowlist fails with "requested path is
   invalid" after an otherwise successful Google login.

## 6. Vercel - and the redeploy trap

Set on the project:

```
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the web client ID from step 4>
```

**`NEXT_PUBLIC_*` values are inlined into the client bundle at build time.**
Saving the variable changes nothing on its own - you must **redeploy** before
the button appears. This is the same trap documented for the other public vars
in `docs/RUNBOOK-prod.md`.

## 7. Native clients (iOS + Android)

Only needed for the Capacitor app; the web button works without them.

- An **iOS** OAuth client → `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- An **Android** OAuth client, registered with the SHA-1 of your upload key.
- The **web** client from step 4 doubles as the token audience for both.
- In Supabase, add those client IDs to the Google provider's *Authorized Client
  IDs*.
- `scripts/cap-native-permissions.mjs` injects the reversed iOS client ID as a
  `CFBundleURLScheme`. See `MOBILE_PLAN.md`.

## 8. Verify, in order

1. Open an incognito window on the deployed site.
2. `/sign-in` shows **Continue with Google**. If it doesn't, the env var is
   unset or you have not redeployed since setting it (§6).
3. Click it → Google's account picker appears.
4. Choose an account → you land back on the app, signed in, at `/setup` (new
   member) or wherever `?next=` pointed.
5. A brand-new account should reach the identity screen in `/setup` with the
   name and photo **already filled in** from the Google profile - that is the
   whole payoff.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The redirect URI in Google Cloud isn't Supabase's callback | §4 step 4 - use `https://<ref>.supabase.co/auth/v1/callback` |
| "Google sign-in isn't switched on yet" on screen | Supabase's Google provider is disabled | §5 step 1 |
| No Google button at all | `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` unset, **or** set but not redeployed | §6 |
| Button appears but nothing happens | Popup/redirect blocked by the browser | Check the console; the redirect is top-level, so an extension is the usual cause |
| "requested path is invalid" after Google | The return URL isn't in Supabase's redirect allowlist | §5 step 2 |
| 403 / "app is being tested" | Consent screen still in Testing | Add a test user, or publish - §3 step 6 |
| Signed in but landed on the wrong page | The `om_auth_next` cookie was dropped | It is `SameSite=Lax` and `secure` on https by design; check for a proxy stripping cookies |
| Works on web, missing in the app | Native client IDs not set | §7 |

## 10. Rotation and revocation

- **Rotating the secret**: create a new secret in Google Cloud, paste it into
  Supabase, then delete the old one. Google accepts both during the overlap, so
  there is no downtime.
- **Revoking**: a member removes the app at
  <https://myaccount.google.com/permissions>. Their existing session survives
  until it expires - delete the account through the app's own delete flow if
  they want it gone now.
