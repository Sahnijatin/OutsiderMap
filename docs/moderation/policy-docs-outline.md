# Policy documents — required-sections outline (informs #91 items 1–3)

A **reference outline** of the sections these three documents typically must
cover for an India-operated UGC platform under the IT Rules 2021 (amended 2023)
and the DPDP Act 2023. Its purpose is to hand counsel a concrete starting
structure and to note the placeholders the business must supply.

> ⚠️ **Not legal advice, and not a draft policy.** This lists sections a
> platform of this kind generally needs; the binding text must be authored and
> reviewed by qualified Indian counsel before publication. Nothing here should
> be published as-is.

Placeholders to be supplied by the business (do **not** fabricate):
`[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[GRIEVANCE OFFICER NAME]`,
`[GRIEVANCE OFFICER EMAIL]`, `[SUPPORT EMAIL]`, `[EFFECTIVE DATE]`.

## 1. Community Guidelines

- What the platform is for (place-anchored discovery) and the tone expected.
- Prohibited content: illegal content; CSAM (zero tolerance); non-consensual
  intimate imagery; hate/harassment; threats/violence; self-harm promotion;
  spam/scams; impersonation; IP infringement.
- Place/authenticity rules (no fabricated shops/prices — ties to #68).
- Consequences: the enforcement ladder (warn → mute → ban) and appeals.
- How to report content and how blocking works.

## 2. Terms of Service

- Parties, eligibility (age), acceptance, `[EFFECTIVE DATE]`.
- Account rules; user-generated-content licence grant to the platform.
- Acceptable-use (referencing the Community Guidelines).
- Moderation + takedown rights; suspension/termination; appeals.
- **Grievance redressal** clause: `[GRIEVANCE OFFICER NAME]` +
  `[GRIEVANCE OFFICER EMAIL]`, and the statutory timelines (ack 24h; resolve
  15d; intimate imagery 24h; court/govt orders 36h) — mirrors `sla.ts`.
- Grievance Appellate Committee (GAC) reference.
- Liability, disclaimers, governing law/jurisdiction, changes to terms.

## 3. Privacy / DPDP notice

- Data fiduciary identity + `[REGISTERED ADDRESS]`.
- What's collected (account, content, device tokens, interaction signals,
  moderation records) and the purpose of each.
- Legal basis / consent under the DPDP Act 2023.
- Sharing with processors (AI/moderation/CSAM vendors — list once selected).
- Data-principal rights (access, correction, erasure, grievance).
- **Retention periods** — including the immutable moderation audit log and CSAM
  evidence (#91 item 8), confirmed with counsel.
- Data Protection / Grievance Officer contact; complaint path.
- Security measures; cross-border transfer stance; children's data.

## Where these plug into the build

- Enforcement of the Guidelines is the pipeline (#82–#89).
- The grievance clause's timelines are encoded in `src/lib/moderation/sla.ts`
  and worked in `/admin/grievances`.
- Retention governs `moderation_actions` (append-only) and `csam_reports`.
