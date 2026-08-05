# DPDP compliance map

Each obligation, and the code that implements it. This is the table an auditor,
an acquirer, or the next engineer asks for.

| Section | Obligation | Where it lives |
|---|---|---|
| §5 | Notice at or before collection | `src/app/setup/notice-step.tsx` — step 0 of `/setup`, before the username or the quiz |
| §6 | Consent: free, specific, informed, unambiguous, itemized | `src/lib/consent/purposes.ts` (one purpose per thing, only `essential` required, all optional boxes start unticked) |
| §6 | Consent must be provable | `consents` + `consent_events` (migration 57). No insert/update/delete policy for anyone; the only write path is `record_consent()` |
| §6(4) | Notice must name the policy version agreed to | `src/lib/consent/policy.ts`; `profiles.policy_version_accepted` |
| §6(6) | Withdrawal as easy as giving | `ConsentCard` in `src/app/(shell)/profile/settings-cards.tsx`; `PATCH /api/consent` |
| §6(6) | Consequences of withdrawal | `src/lib/consent/withdraw.ts` — purges the taste profile's derived columns, remembered facts, and the behavioural log. Enforced below the app by the `interaction_events` insert policy (migration 58) |
| §7 | Legitimate uses | `essential` purpose; see `PURPOSES` |
| §8(2) | Processors bound by contract | `src/lib/consent/processors.ts`; `docs/dpdp/processor-register.md`. **DPAs unsigned — see MANUAL_SETUP.md** |
| §8(5) | Reasonable security safeguards | RLS throughout; `is_active_member()` restrictive policies; column-level grants on `profiles` (migration 58); service-role key never client-side |
| §8(6) | Breach notification to the Board and to members | `docs/dpdp/breach-response.md` (procedure; no code path) |
| §8(7) | Storage limitation — erase when the purpose is served | `src/lib/account/retention.ts` + `retention-sweep.ts`, run nightly from `/api/cron/daily`. Audited in `retention_runs` |
| §9 | No children; verifiable parental consent otherwise | Age gate: `profiles.date_of_birth`, `set_date_of_birth()` (migration 58), `src/lib/consent/age.ts`, `/blocked`. Under-18s are refused outright |
| §9(3) | No behavioural tracking of children | Follows from §9: no under-18 account exists to track. The refusal record self-deletes after 30 days |
| §11 | Right to access and to a summary of processing | `GET /api/account/export` — data, consent history, processors and retention windows, all rendered from the enforcing constants |
| §12 | Right to correction and erasure | Correction: self-service fields, `DELETE /api/memory`, `/setup?redo=1`, and `category: "data_correction"` grievances. Erasure: `DELETE /api/account` → `src/lib/account/erase.ts` |
| §13 | Grievance redressal | `grievances` table (migration 24), `POST /api/grievances`, `/admin/grievances`, SLA clocks in `src/lib/moderation/sla.ts`, appeals (migration 29) |
| §14 | Right to nominate | `nominees` (migration 60), `src/app/api/account/nominee/route.ts` |
| §16 | Cross-border transfer | `docs/dpdp/processor-register.md`; the transfer paragraph on `/privacy` |

## The guards

Three tests exist specifically to stop this map going stale:

- **`tests/account/personal-data.test.ts`** parses every migration (replaying
  `drop table`, and reading FKs added by `ALTER`) and fails when a user-keyed
  table is classified neither as personal data nor as explicitly not-personal.
  This is what keeps export, erasure and retention covering the whole schema.
  It found eight unclassified tables when it was written, two of which —
  `quest_stops` and `post_article_places` — were never being erased.
- **`tests/consent/purposes.test.ts`** diffs the TypeScript purpose union
  against the SQL check constraint in migration 57. They are two declarations
  of one fact; drift means the UI offers a purpose the database rejects.
- **`tests/consent/gate.test.ts`** pins the order of the front-door steps, so
  the redirect in `requireOnboarded()` and the page it redirects to cannot
  disagree.

## Known limits

- The privacy page is still **banner-marked Draft** pending counsel.
- **No DPA is signed.** The register records that honestly rather than
  implying otherwise.
- **The grievance officer is unappointed.** `/privacy` says so rather than
  naming a placeholder.
- **Significant Data Fiduciary status is undetermined.** If OutsiderMap is
  notified as one, §10 adds a DPO, a DPIA and independent audits — none of
  which exist yet.
- Deleting `interaction_events` on withdrawal and at 400 days moves the counts
  on `/admin` and the precise-answer accept rate. The right fix is a
  non-personal aggregate rollup; it does not exist yet.
