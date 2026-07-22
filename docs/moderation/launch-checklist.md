# Moderation launch checklist (tracks #91)

Operationalizes the **non-code** launch dependencies for the UGC-Moderation
epic (#70). The machinery (#81–#90) is built and merged behind swappable
interfaces; the items below are **business / legal / vendor decisions and
onboarding** that must land before the feed opens to the public. Each row
notes what it unblocks and the code hook already waiting for it.

> ⚠️ This is an engineering tracking document, not legal advice. Every legal
> item must be confirmed with qualified Indian counsel before go-live.

## Blocking for public launch

| # | Item | Owner | Status | Unblocks | Code hook (already in place) |
|---|------|-------|--------|----------|------------------------------|
| 1 | **Community Guidelines** authored + published | Product + counsel | ☐ TODO | Public feed (#67) | Enforced by the whole pipeline; see `policy-docs-outline.md` |
| 2 | **Terms of Service** authored + published | Counsel | ☐ TODO | Public feed (#67) | — |
| 3 | **Privacy / DPDP notice** authored + published | Counsel | ☐ TODO | Public feed (#67) | — |
| 4 | **Grievance Officer** designated (resident in India), name + contact published | Business | ☐ TODO | #90 | `grievances.officer_id`; officer works `/admin/grievances` |
| 5 | **CSAM vendor** onboarded (PhotoDNA / Cloudflare / Thorn) | Eng + legal | ☐ TODO | #85 | Swap `createCsamScanner()` in `src/lib/moderation/csam.ts`; set env (see `env.example`) |
| 6 | **CSAM reporting channel** confirmed (local police / SJPU per IT Act §67B + POCSO §19) + evidence retention | Counsel | ☐ TODO | #85 | `quarantineAndReport()` + `csam_reports` workflow; wire the report step |
| 7 | **Image/video provider** selected (Hive / Rekognition / Vision) | Eng | ☐ TODO | #84 | Swap `createImageModerator()` in `src/lib/moderation/image.ts`; set env. See `vendor-selection.md` |
| 8 | **Retention periods** set (audit log + CSAM evidence) | Counsel | ☐ TODO | #81 / #85 / #90 | `moderation_actions` is append-only; retention is a deliberate superuser op |
| 9 | Designate **CSAM staff** members | Business | ☐ TODO | #85 | Insert into `public.csam_staff` (service role); gates `is_csam_staff()` |
| 10 | Confirm exact **statutory SLA windows** with counsel | Counsel | ☐ TODO | #90 | `src/lib/moderation/sla.ts` encodes the researched defaults |

## Interim posture (what happens today, pre-vendor)

- **Text** is screened live (heuristics + LLM). Trusted members' clean text
  auto-publishes; uncertain text is held.
- **Media** has no provider yet, so `createImageModerator()` **holds every
  media item for human review** — nothing media-bearing auto-publishes. The
  "no unscreened media goes public" invariant holds even before item 7.
- **CSAM** scanner is a no-op until item 5; the moment a real scanner returns a
  hit, `quarantineAndReport()` runs. Until then, media held-for-review is the
  backstop.
- **Grievances** can be filed and worked in `/admin/grievances`; the named
  officer (item 4) and published contact are still required for compliance.

## Definition of done for public launch

All rows 1–10 checked, plus a dry-run: file a test report → case appears in
`/admin/moderation`; file a test grievance → SLA countdown in
`/admin/grievances`; confirm a media post stays pending until a reviewer or the
image provider clears it.
