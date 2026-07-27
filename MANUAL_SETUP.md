# Manual setup & follow-ups

A living checklist of things that can't be done in code alone - infra,
secrets, accounts, and content decisions. See `README.md` for the go-live
sequence, `MOBILE_PLAN.md` for the store checklist, and `REVIEW.md` for the
audit these came from.

## Founder-only (accounts and keys)

- [ ] Google Play Developer account + upload keystore; secrets
      `ANDROID_KEYSTORE_BASE64/_PASSWORD`, `ANDROID_KEY_ALIAS/_PASSWORD`.
      Back the keystore up; losing it is permanent.
- [ ] Apple Developer Program; App ID `com.outsidermap.app` with Push +
      Sign in with Apple; App Store Connect API key secrets
      (`APP_STORE_CONNECT_API_KEY/_KEY_ID/_ISSUER_ID`, `APPLE_TEAM_ID`).
- [ ] Firebase project -> `google-services.json` (Android push) and an APNs
      key (iOS push); the in-app client half is already wired.
- [ ] Google Cloud OAuth clients (iOS + Web) ->
      `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`;
      enable Google + Apple providers in Supabase.
- [ ] Set the `CAP_SERVER_URL` repo variable to staging so native builds
      stop defaulting to production.
- [ ] CSAM scanning vendor (PhotoDNA/Thorn class) - the scanner interface
      exists, the implementation is a documented no-op until credentials.
- [ ] Image-moderation vendor for photo auto-approval - until then every
      member photo waits in /admin/photos for a manual pass.
- [ ] Counsel review of /privacy and /terms (drafted, marked as drafts);
      appoint and name the DPDP grievance officer.
- [ ] Store listing assets: screenshots, privacy nutrition labels / Play
      data-safety form, pre-approved demo account for review.

## Ops rhythm (until automated)

- [ ] Run the draft triage desk (/admin/places) daily; publish in bulk.
- [ ] Re-run the Overture extract when a new release ships (manual DuckDB
      ritual; a scheduled refresh is a known gap).
