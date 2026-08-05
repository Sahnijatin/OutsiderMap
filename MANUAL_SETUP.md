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
- [ ] **Appoint the DPDP grievance officer** — a named person with a working
      email — then set `DPDP_GRIEVANCE_OFFICER_NAME` / `_EMAIL` (and optionally
      `_ADDRESS`) in Vercel, all environments. Until set, /privacy and /blocked
      render "to be appointed"; the pages work, but you are not compliant.
      Needs a redeploy to take effect. Launch blocker.
- [ ] **Counsel review of /privacy and /terms** (drafted, marked as drafts),
      then remove the Draft banner in `src/app/(marketing)/privacy/page.tsx`.
      Have counsel confirm three things while they are in there: the retention
      windows in `src/lib/account/retention.ts` (they are rendered verbatim on
      the privacy page), the 18+ cut-off, and the 30-day expiry of an
      under-18 refusal record. Launch blocker.
- [ ] **Sign a DPA with every processor** in `src/lib/consent/processors.ts`,
      then record each as `signed` there and in
      `docs/dpdp/processor-register.md`. Confirm each vendor's data residency,
      and re-check the register if the government ever notifies a restricted
      country list. Launch blocker.
- [ ] Supply the legal entity details the policy needs: legal entity name,
      registered address, support email. Placeholders are listed in
      `docs/moderation/policy-docs-outline.md`.
- [ ] Set `PRIVACY_POLICY_VERSION` in `src/lib/consent/policy.ts` to the date
      counsel approves, and list it in `MATERIAL_POLICY_VERSIONS`. Every future
      policy change means deciding whether it is material — that decision is
      what re-prompts every member, so it must never be a drive-by edit.
- [ ] Decide the fiduciary classification: is OutsiderMap a Significant Data
      Fiduciary? If so, §10 adds a DPO, a DPIA and independent audits. Counsel's
      call, based on volume and sensitivity.
- [ ] Brief whoever is on call on `docs/dpdp/breach-response.md` and run one
      tabletop exercise, so the Data Protection Board timeline is not being read
      for the first time during a real breach. Fill in the Board's notification
      channel in that file's contacts table.
- [ ] Update the store compliance forms — Play Data Safety and Apple privacy
      nutrition labels — to match the rewritten policy, including the new date
      of birth collection.
- [ ] Store listing assets: screenshots, privacy nutrition labels / Play
      data-safety form, pre-approved demo account for review.

## Ops rhythm (until automated)

- [ ] Run the draft triage desk (/admin/places) daily; publish in bulk.
- [ ] Re-run the Overture extract when a new release ships (manual DuckDB
      ritual; a scheduled refresh is a known gap).
