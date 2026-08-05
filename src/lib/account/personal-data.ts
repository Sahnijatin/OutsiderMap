import type { Database } from "@/types/database";
import { MEMBER_VETTING_BUCKET } from "@/lib/vetting/media";
import { QUEST_MEDIA_BUCKET } from "@/lib/media/quest";
import { POST_MEDIA_BUCKET } from "@/lib/media/post";

/**
 * One registry of everywhere a member's personal data lives.
 *
 * Erasure, export and retention all need the same list, and until now only
 * erasure had one - hand-written inline in DELETE /api/account, and already
 * stale: it omitted member_memory, posts, follows, grievances, subscriptions
 * and a dozen more. Most of those survive by ON DELETE CASCADE, which is why
 * nobody noticed. Two things did not survive: post-media and experience-media
 * storage objects, which have been orphaned on every account deletion to date,
 * because deleting a row does not delete the file it points at.
 *
 * Building the §11 export against a second hand-written list would have
 * guaranteed the same drift twice. So the list is built once, here, and
 * tests/account/personal-data.test.ts parses the migrations and fails the
 * build when a new user-keyed table is not classified. Adding a table now
 * forces an answer to "what happens to this on export and erasure" at the
 * moment you add it, instead of eighteen months later during a subject access
 * request.
 */

export type TableName = keyof Database["public"]["Tables"];

/** How rows on this table are attributed to the data subject. */
export type SubjectKey =
  /** A column holding the subject's uuid. */
  | { by: "column"; column: string }
  /** Two-party rows (follows, friendships, blocks): either side matches. */
  | { by: "columns"; columns: string[] }
  /** Keyed by email rather than uuid - the dormant waitlist table. */
  | { by: "email"; column: string }
  /** Reached only through a parent (post_media -> posts.author_id). */
  | {
      by: "via";
      parent: TableName;
      localColumn: string;
      parentColumn: string;
    };

export type ErasePlan =
  /** Explicitly deleted by the erasure route, in registry order. */
  | "explicit"
  /** Removed by an ON DELETE CASCADE - asserted against the SQL, not assumed. */
  | "cascade"
  /** Survives erasure. retainReason is required and is shown on /privacy. */
  | "retain";

export type PersonalTable = {
  table: TableName;
  key: SubjectKey;
  /** Section name in the export bundle and on the privacy page. */
  label: string;
  export: boolean;
  erase: ErasePlan;
  retainReason?: string;
  /**
   * PostgREST select for the export. Defaults to "*". Used to drop embeddings
   * (1536 floats, meaningless to a human, ~30KB a row) and to avoid handing
   * the subject another member's uuid.
   */
  select?: string;
  /** Rows exported before the bundle marks this section truncated. */
  exportLimit?: number;
  /** Storage objects reachable from this table; purged BEFORE the rows. */
  storage?: { bucket: string; pathColumn: string; arrayColumn?: string };
};

const DEFAULT_EXPORT_LIMIT = 10_000;

/**
 * Order matters for erasure: tables carrying storage pointers come before the
 * rows that would cascade them away, or the paths are gone before the objects
 * are.
 */
export const PERSONAL_DATA: readonly PersonalTable[] = [
  // --- Identity -----------------------------------------------------------
  {
    table: "profiles",
    key: { by: "column", column: "id" },
    label: "Your profile",
    export: true,
    // Deleted last by eraseSubject, after everything that cascades from it.
    erase: "explicit",
  },

  // --- Consent and rights -------------------------------------------------
  {
    table: "consents",
    key: { by: "column", column: "user_id" },
    label: "What you consented to",
    export: true,
    erase: "cascade",
  },
  {
    table: "consent_events",
    key: { by: "column", column: "user_id" },
    label: "Your consent history",
    export: true,
    erase: "cascade",
  },
  {
    table: "nominees",
    key: { by: "column", column: "user_id" },
    label: "Who you nominated",
    export: true,
    erase: "cascade",
  },

  // --- The personalization loop -------------------------------------------
  {
    table: "taste_profiles",
    key: { by: "column", column: "user_id" },
    label: "Your taste profile",
    export: true,
    erase: "explicit",
    // embedding omitted deliberately: 1536 floats say nothing to a reader.
    select:
      "user_id, quiz_answers, learned_signals, taste_summary, version, updated_at",
  },
  {
    table: "interaction_events",
    key: { by: "column", column: "user_id" },
    label: "What you tapped, saved and skipped",
    export: true,
    erase: "explicit",
    exportLimit: 50_000,
  },
  {
    table: "member_memory",
    key: { by: "column", column: "user_id" },
    label: "What the concierge remembers about you",
    export: true,
    erase: "explicit",
  },

  // --- Things you made ----------------------------------------------------
  {
    table: "saved_places",
    key: { by: "column", column: "user_id" },
    label: "Places you saved",
    export: true,
    erase: "explicit",
  },
  {
    table: "weekend_plans",
    key: { by: "column", column: "user_id" },
    label: "Your weekend plans",
    export: true,
    erase: "explicit",
  },
  {
    table: "chat_threads",
    key: { by: "column", column: "user_id" },
    label: "Your conversations",
    export: true,
    erase: "explicit",
  },
  {
    table: "chat_messages",
    key: {
      by: "via",
      parent: "chat_threads",
      localColumn: "thread_id",
      parentColumn: "user_id",
    },
    label: "Your messages",
    export: true,
    erase: "cascade",
    exportLimit: 20_000,
  },
  {
    table: "quests",
    key: { by: "column", column: "user_id" },
    label: "Your quests",
    export: true,
    erase: "explicit",
  },
  {
    table: "quest_stops",
    key: {
      by: "via",
      parent: "quests",
      localColumn: "quest_id",
      parentColumn: "user_id",
    },
    label: "The stops on your quests",
    export: true,
    erase: "cascade",
  },
  {
    table: "quest_stop_media",
    key: { by: "column", column: "user_id" },
    label: "Photos you took on quests",
    export: true,
    erase: "explicit",
    storage: { bucket: QUEST_MEDIA_BUCKET, pathColumn: "storage_path" },
  },
  {
    table: "posts",
    key: { by: "column", column: "author_id" },
    label: "Your posts",
    export: true,
    erase: "explicit",
  },
  {
    table: "post_media",
    key: {
      by: "via",
      parent: "posts",
      localColumn: "post_id",
      parentColumn: "author_id",
    },
    label: "Photos on your posts",
    export: true,
    erase: "cascade",
    // The leak this registry closes: these objects were never removed.
    storage: {
      bucket: POST_MEDIA_BUCKET,
      pathColumn: "path",
      arrayColumn: undefined,
    },
  },
  {
    table: "post_articles",
    key: {
      by: "via",
      parent: "posts",
      localColumn: "post_id",
      parentColumn: "author_id",
    },
    label: "Your blog posts",
    export: true,
    erase: "cascade",
  },
  {
    table: "post_article_places",
    key: {
      by: "via",
      parent: "posts",
      localColumn: "post_id",
      parentColumn: "author_id",
    },
    label: "Places you referenced in your writing",
    export: true,
    erase: "cascade",
  },
  {
    table: "post_comments",
    key: { by: "column", column: "author_id" },
    label: "Your comments",
    export: true,
    erase: "explicit",
  },
  {
    table: "post_reactions",
    key: { by: "column", column: "user_id" },
    label: "Your reactions",
    export: true,
    erase: "explicit",
  },

  // --- Social graph -------------------------------------------------------
  {
    table: "follows",
    key: { by: "columns", columns: ["follower", "followee"] },
    label: "Who you follow, and who follows you",
    export: true,
    erase: "cascade",
  },
  {
    table: "friendships",
    key: { by: "columns", columns: ["requester", "addressee"] },
    label: "Your friendships",
    export: true,
    erase: "cascade",
  },
  {
    table: "user_blocks",
    key: { by: "columns", columns: ["blocker", "blocked"] },
    // Exported as counts only: telling a member who blocked THEM would turn a
    // safety feature into a targeting list.
    label: "Accounts you blocked",
    export: false,
    erase: "cascade",
  },
  {
    table: "activity_events",
    key: { by: "columns", columns: ["recipient_id", "actor_id"] },
    label: "Your activity feed",
    export: true,
    erase: "cascade",
    exportLimit: 20_000,
  },

  // --- Scouting and rewards -----------------------------------------------
  {
    table: "points_ledger",
    key: { by: "column", column: "user_id" },
    label: "Points you earned",
    export: true,
    erase: "cascade",
  },
  {
    table: "reward_grants",
    key: { by: "column", column: "user_id" },
    label: "Rewards you were granted",
    export: true,
    erase: "cascade",
  },
  {
    table: "user_trust",
    key: { by: "column", column: "user_id" },
    label: "Your scout trust level",
    export: true,
    erase: "cascade",
  },
  {
    table: "quest_confirmations",
    key: { by: "column", column: "validator_id" },
    label: "Spots you validated",
    export: true,
    erase: "cascade",
  },
  {
    table: "market_runs",
    key: { by: "column", column: "user_id" },
    label: "Your market runs",
    export: true,
    erase: "cascade",
  },
  {
    table: "place_claims",
    key: { by: "column", column: "user_id" },
    label: "Places you claimed to own",
    export: true,
    erase: "explicit",
  },

  // --- Device and delivery ------------------------------------------------
  {
    table: "device_tokens",
    key: { by: "column", column: "user_id" },
    label: "Your devices",
    export: true,
    erase: "explicit",
  },
  {
    table: "notification_sends",
    key: { by: "column", column: "user_id" },
    label: "Notifications we sent you",
    export: true,
    erase: "cascade",
    exportLimit: 5_000,
  },

  // --- The dormant application path ---------------------------------------
  {
    table: "waitlist",
    key: { by: "email", column: "email" },
    label: "Your membership application",
    export: true,
    erase: "explicit",
    storage: {
      bucket: MEMBER_VETTING_BUCKET,
      pathColumn: "selfie_path",
      arrayColumn: "photo_paths",
    },
  },

  // --- Records that outlive the account ------------------------------------
  {
    table: "grievances",
    key: { by: "column", column: "reporter_id" },
    label: "Grievances you filed",
    export: true,
    erase: "retain",
    retainReason:
      "Statutory grievance register under the IT Rules 2021. reporter_id is " +
      "ON DELETE SET NULL, so the case survives with you removed from it.",
  },
  {
    table: "content_reports",
    key: { by: "column", column: "reporter_id" },
    label: "Content you reported",
    export: true,
    erase: "cascade",
  },
  {
    table: "moderation_cases",
    key: { by: "column", column: "author_id" },
    label: "Moderation decisions about your content",
    export: true,
    erase: "retain",
    retainReason:
      "Moderation record required under the IT Rules 2021. author_id is ON " +
      "DELETE SET NULL, so the decision survives de-identified.",
  },
  {
    table: "place_media",
    key: { by: "column", column: "contributor_id" },
    label: "Photos you contributed to places",
    export: true,
    erase: "retain",
    retainReason:
      "The photo is catalog content other members rely on to find the place. " +
      "contributor_id is ON DELETE SET NULL, so it survives unattributed.",
  },
  {
    table: "ingest_items",
    key: { by: "column", column: "created_by" },
    label: "Spots you submitted",
    export: true,
    erase: "retain",
    retainReason:
      "A submitted spot becomes part of the shared catalog. created_by is ON " +
      "DELETE SET NULL, so the place stays and your name comes off it.",
  },
];

/**
 * Tables with a profiles or auth.users FK that are NOT personal data of a
 * member, each with the reason. The drift test requires every user-keyed table
 * to be in one list or the other, so this is where "it's staff/catalog/admin
 * metadata" gets written down once instead of being re-litigated.
 */
export const NOT_PERSONAL: readonly { table: TableName; reason: string }[] = [
  {
    table: "places",
    reason:
      "The shared catalog. submitted_by and claimed_by are SET NULL, so a " +
      "place a member added stays on the map with their name off it - the " +
      "alternative is one deletion tearing holes in everyone else's map.",
  },
  {
    table: "events",
    reason: "Catalog content, authored by staff and tied to a place, not a member.",
  },
  {
    table: "moderation_actions",
    reason:
      "The audit trail of what a moderator did. Belongs to the case, not to " +
      "the member it concerns.",
  },
  {
    table: "scout_candidate_media",
    reason: "Catalog candidate photos from the harvest pipeline, not member uploads.",
  },
  {
    table: "scout_tasks",
    reason: "Work items inside an admin-triggered catalog run.",
  },
  {
    table: "csam_staff",
    reason:
      "Staff authorization roster, not member data. Removed when the person " +
      "leaves the team, not by a member erasure request.",
  },
  {
    table: "bounty_quests",
    reason:
      "Catalog work item. lister_id is SET NULL; the bounty belongs to the " +
      "city, not the lister.",
  },
  {
    table: "harvest_cities",
    reason: "Admin configuration. created_by is SET NULL and is staff, not a member.",
  },
  {
    table: "scout_runs",
    reason: "Admin-triggered catalog job. created_by is staff and SET NULL.",
  },
  {
    table: "scout_candidates",
    reason: "Catalog candidates. reviewed_by is staff and SET NULL.",
  },
  {
    table: "scout_verification_audit",
    reason: "Admin decision log. admin_id is staff and SET NULL.",
  },
  {
    table: "erasure_log",
    reason:
      "The record that an erasure happened. Holds a bare uuid and nothing " +
      "else, and deleting it would destroy the proof it exists to provide.",
  },
  {
    table: "retention_runs",
    reason: "Operational sweep log. Contains counts, no member data.",
  },
];

// --- Derived views over the registry (pure, no I/O) ------------------------

export function exportTables(): PersonalTable[] {
  return PERSONAL_DATA.filter((t) => t.export);
}

/** Explicitly deleted by eraseSubject, in registry order. */
export function eraseTables(): PersonalTable[] {
  return PERSONAL_DATA.filter((t) => t.erase === "explicit");
}

export function retainedTables(): PersonalTable[] {
  return PERSONAL_DATA.filter((t) => t.erase === "retain");
}

/** Tables carrying storage objects; purged before any rows are deleted. */
export function storageTargets(): PersonalTable[] {
  return PERSONAL_DATA.filter((t) => t.storage != null);
}

export function exportLimitFor(entry: PersonalTable): number {
  return entry.exportLimit ?? DEFAULT_EXPORT_LIMIT;
}

export type Subject = { userId: string; email: string | null };

/**
 * The concrete filters for one table and one subject, or null when the entry
 * does not apply (a subject with no email cannot match the waitlist) or is
 * only reachable through a parent.
 */
export function subjectFilters(
  entry: PersonalTable,
  subject: Subject,
): { column: string; value: string }[] | null {
  switch (entry.key.by) {
    case "column":
      return [{ column: entry.key.column, value: subject.userId }];
    case "columns":
      return entry.key.columns.map((column) => ({
        column,
        value: subject.userId,
      }));
    case "email":
      return subject.email
        ? [{ column: entry.key.column, value: subject.email }]
        : null;
    case "via":
      // Resolved by the caller against the parent table.
      return null;
  }
}
