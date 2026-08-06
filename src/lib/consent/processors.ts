/**
 * The processor register, as code.
 *
 * DPDP makes OutsiderMap the data fiduciary and everyone below a processor
 * acting on our instructions - which we are required to bind by contract, and
 * to be able to name. There was no register at all: the list existed only as
 * env vars in env.example, so "who has your data" had no answer that survived
 * being asked.
 *
 * Kept here rather than in a markdown file alone so /privacy, the §11 export
 * bundle and docs/dpdp/processor-register.md all render from one list. A
 * register that lives only in prose drifts from the stack within a quarter.
 *
 * Not `server-only`: the marketing page renders this.
 *
 * dpaStatus is the honest state of the paperwork, not an aspiration. Flipping
 * one to "signed" is a deliberate edit made when the contract is actually
 * executed - see MANUAL_SETUP.md.
 */

export type DpaStatus = "signed" | "pending" | "not_engaged";

export type Processor = {
  name: string;
  /** What they do for us, in one line a member can follow. */
  purpose: string;
  /** The categories of personal data that reach them. */
  dataShared: string[];
  /** Where the processing happens, for the §16 transfer position. */
  country: string;
  dpaStatus: DpaStatus;
};

export const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    purpose: "Database, authentication and file storage - the primary store.",
    dataShared: [
      "account details",
      "profile",
      "taste profile",
      "interaction history",
      "chat",
      "photos",
    ],
    country: "Singapore / United States",
    dpaStatus: "pending",
  },
  {
    name: "Vercel",
    purpose: "Application hosting and the scheduled jobs.",
    dataShared: ["request metadata", "anything in transit through the app"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Anthropic",
    purpose:
      "The concierge - turning your question and taste profile into an answer.",
    dataShared: ["chat messages", "taste summary", "remembered facts"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "OpenAI",
    purpose:
      "Embeddings for taste and place matching, and some chat generation.",
    dataShared: ["taste summary", "quiz-derived dimensions", "chat messages"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Upstash",
    purpose: "Rate limiting - keeping the app usable and abuse-resistant.",
    dataShared: ["hashed rate-limit keys derived from user id or IP"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Resend",
    purpose: "Transactional email. We do not send marketing email.",
    dataShared: ["email address"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Google Cloud",
    purpose:
      "Sign in with Google, and the Places API used only to resolve a place " +
      "id for navigation.",
    dataShared: ["email address", "place lookups"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Apple",
    purpose: "Sign in with Apple, and push notification delivery on iOS.",
    dataShared: ["email address (or Apple's relay address)", "device token"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Google Firebase",
    purpose: "Push notification delivery on Android.",
    dataShared: ["device token"],
    country: "United States",
    dpaStatus: "pending",
  },
  {
    name: "Image moderation vendor",
    purpose:
      "Automated screening of uploaded photos before they are shown to " +
      "anyone. Not yet engaged - every photo is reviewed by a person today.",
    dataShared: ["uploaded photos"],
    country: "To be determined",
    dpaStatus: "not_engaged",
  },
  {
    name: "CSAM scanning vendor",
    purpose:
      "Detection of child sexual abuse material in uploads, as required by " +
      "the IT Rules. Not yet engaged; the scanner interface is a documented " +
      "no-op until credentials exist.",
    dataShared: ["uploaded photo hashes"],
    country: "To be determined",
    dpaStatus: "not_engaged",
  },
];

/** Vendors actually in the request path today. */
export function engagedProcessors(): Processor[] {
  return PROCESSORS.filter((p) => p.dpaStatus !== "not_engaged");
}
