# Personal data breach: response runbook

DPDP §8(6) requires a data fiduciary to notify **both** the Data Protection
Board of India and every affected data principal when personal data is
breached. There is no materiality threshold in the Act — "we judged it minor"
is not one of the available responses.

This runbook exists so the timeline is not being read for the first time during
an incident. Read it now, not then.

## What counts

A personal data breach is any unauthorised processing, accidental disclosure,
acquisition, sharing, use, alteration, destruction, or loss of access. In this
stack, the realistic shapes are:

- **Supabase service-role key leaked.** The worst case: it bypasses RLS
  entirely. Treat any exposure of `SUPABASE_SERVICE_ROLE_KEY` as a breach of
  everything until proven otherwise.
- **An RLS policy regression** that exposes one member's rows to another.
- **A storage bucket** (`member-vetting`, `post-media`, `quest-media`) served
  publicly when it should be private.
- **A vendor's breach** — Supabase, Vercel, Anthropic, OpenAI, Resend, Upstash.
  Their breach involving our data is still our notification obligation.
- **Account takeover** at scale, e.g. an auth flow flaw.

## Immediate (first hour)

1. **Contain before investigating.** Rotate the exposed credential, revoke the
   key, or take the surface down. A perfect diagnosis of an ongoing leak is
   worth less than a rough one that stops it.
2. **Preserve evidence.** Do not `git push --force`, do not delete logs, do not
   truncate tables. The Board can ask what happened; you need to be able to
   answer.
3. **Start a written timeline**, in UTC, from the earliest known event. Every
   later step depends on it.
4. **Name one owner.** Everything below routes through one person.

## Assess (first day)

Answer these four, in writing:

- **What data?** Categories, not vibes. Use `src/lib/account/personal-data.ts`
  as the checklist — it is the complete inventory of where personal data lives.
- **Whose?** Get the count and, if possible, the list of affected `user_id`s.
- **When did it start and has it stopped?**
- **Could it cause harm?** Identity, safety, or reputational. Location data and
  vetting selfies are the two categories where the answer is most likely yes.

## Notify

**The Data Protection Board of India.** As soon as the breach is known — before
the investigation is complete. An initial notification with unknowns marked as
unknown, followed by an update, is correct; waiting until you have the full
picture is not. Include: what happened, when, categories and volume of data,
likely consequences, what you have done, and what affected people should do.

**Affected members.** Also promptly, in plain language. Say what happened, what
of theirs was involved, what you have done, what they should do (change a
password, watch for phishing), and how to reach the grievance officer. Send it
via Resend to the affected addresses. Do not minimise, and do not send a
notification that is mostly reassurance.

**Sequence note:** the two notifications are independent. Do not hold the member
notification waiting for a Board response.

## After

- **Post-incident record.** What happened, why, what changed. Keep it; the Board
  can ask, and the next person to touch that subsystem should be able to read it.
- **File it in `docs/dpdp/`** alongside this runbook.
- **Fix the class, not the instance.** If an RLS regression caused it, the
  question is what test would have caught it — see
  `tests/account/personal-data.test.ts` for the shape of a guard that fails the
  build rather than trusting a reviewer.
- **Check `grievances`** for related complaints filed before you noticed. A
  member reporting something odd is often the first signal.

## Contacts

| Role | Who | Where |
|---|---|---|
| Grievance officer | *(to be appointed — see `MANUAL_SETUP.md`)* | `DPDP_GRIEVANCE_OFFICER_EMAIL` |
| Data Protection Board of India | — | Per the Board's notified channel |
| Supabase support | — | Project dashboard |
| Vercel support | — | Project dashboard |

## Before you need this

- [ ] Appoint the grievance officer and set the three `DPDP_GRIEVANCE_OFFICER_*`
      variables.
- [ ] Confirm the Board's current notification channel and put it in the table
      above — it is the one detail you cannot look up calmly mid-incident.
- [ ] Run one tabletop exercise against the "service-role key leaked" scenario.
- [ ] Confirm `RESEND_API_KEY` can actually send to a large recipient list, and
      what the rate limit is.
