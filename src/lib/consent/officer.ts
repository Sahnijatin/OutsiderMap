import { serverEnv } from "@/lib/env";

/**
 * The DPDP grievance officer, from env.
 *
 * /privacy carried the literal string "[grievance officer contact to be
 * appointed]" - a placeholder in shipped, member-facing legal text. Moving it
 * to env means appointing a person is a dashboard change rather than a deploy
 * of edited copy, and leaves exactly one manual step instead of a code edit
 * nobody remembers to make.
 *
 * Returns null when unappointed rather than throwing or rendering a half-empty
 * contact block: an unconfigured var must degrade the section, not take down
 * the privacy page. (serverEnv's withoutEmptyValues already treats "" as
 * unset, which is the Vercel-dashboard failure mode - a saved-but-blank var.)
 */

export type GrievanceOfficer = {
  name: string;
  email: string;
  address: string | null;
};

export function grievanceOfficer(): GrievanceOfficer | null {
  const env = serverEnv();
  const name = env.DPDP_GRIEVANCE_OFFICER_NAME;
  const email = env.DPDP_GRIEVANCE_OFFICER_EMAIL;
  // A name without an email is not a contact. Partial config reads as
  // unappointed, so the page never shows a person you cannot reach.
  if (!name || !email) return null;
  return {
    name,
    email,
    address: env.DPDP_GRIEVANCE_OFFICER_ADDRESS ?? null,
  };
}
