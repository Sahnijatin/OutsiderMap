# Processor register (DPDP)

Under the Digital Personal Data Protection Act, 2023, OutsiderMap is the **data
fiduciary**. Every company below is a **data processor** acting on our
instructions, and §8(2) requires us to bind each one by contract before they
touch personal data.

**The source of truth for this list is `src/lib/consent/processors.ts`.** The
privacy page and the member data export both render from that constant, so a
vendor added to the stack and not to the register shows up as a contradiction
between this file and the app rather than quietly going unrecorded. Update the
constant first; update this file in the same commit.

## Status

`dpaStatus` in the constant is the honest state of the paperwork, not an
aspiration. Flip one to `signed` only when the contract is actually executed
and filed.

| Processor | What they do | Country | DPA |
|---|---|---|---|
| Supabase | Database, auth, file storage — the primary store | Singapore / US | ⬜ pending |
| Vercel | Application hosting and scheduled jobs | US | ⬜ pending |
| Anthropic | The concierge: question + taste profile → answer | US | ⬜ pending |
| OpenAI | Embeddings for taste and place matching; some chat | US | ⬜ pending |
| Upstash | Rate limiting | US | ⬜ pending |
| Resend | Transactional email (no marketing email is sent) | US | ⬜ pending |
| Google Cloud | Sign in with Google; Places API for navigation ids | US | ⬜ pending |
| Apple | Sign in with Apple; iOS push delivery | US | ⬜ pending |
| Google Firebase | Android push delivery | US | ⬜ pending |
| Image moderation vendor | Automated photo screening | TBD | ⬜ not engaged |
| CSAM scanning vendor | Detection of child sexual abuse material | TBD | ⬜ not engaged |

The last two are not yet engaged. Until they are, every member photo is
reviewed by a person in `/admin/photos` and the CSAM scanner is a documented
no-op — see `docs/moderation/vendor-selection.md`.

## Cross-border transfers

§16 permits transfer to any country the central government has **not**
specifically restricted. As of this writing no restriction list has been
notified. Two consequences worth holding on to:

1. The position above is contingent on a list that does not yet exist. If one
   is notified, every US-hosted row in this table needs re-checking, and the
   privacy page's transfer paragraph needs rewriting.
2. Supabase region choice is the one lever that materially changes exposure
   here — it holds the primary copy of everything. Confirm the project's actual
   region rather than assuming.

## What to do when adding a vendor

1. Add it to `src/lib/consent/processors.ts` with the real data categories.
2. Add the row here.
3. Execute the DPA before the vendor sees production data.
4. If it processes a **new category** of personal data, the privacy notice and
   the purpose list in `src/lib/consent/purposes.ts` may both need to change —
   and if the purpose is new, existing members must be asked again (bump
   `PRIVACY_POLICY_VERSION` and list it in `MATERIAL_POLICY_VERSIONS`).
