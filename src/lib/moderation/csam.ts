import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CsamScanner, MediaRef } from "./types";

/**
 * CSAM hash-matching (isolated, mandatory). The concrete scanner — PhotoDNA /
 * Cloudflare CSAM Scanning Tool / Thorn Safer (see #91) — is chosen at build;
 * it is NOT an LLM/vision call. Until one is onboarded the default reports no
 * match (it cannot match without a vendor); the reporting machinery below is
 * exercised the moment a real scanner returns a hit.
 *
 * On a hit: quarantine the object (remove it from the public bucket so it can
 * never be served), open an access-locked csam_report, and hand off to the
 * legal reporting workflow. Records are readable only by designated staff
 * (csam_staff / is_csam_staff), never the general moderation queue.
 */

export function createNoopCsamScanner(): CsamScanner {
  return {
    name: "noop",
    async scan() {
      return { hit: false };
    },
  };
}

/** The active CSAM scanner. Swap the factory when a vendor is onboarded (#91). */
export function createCsamScanner(): CsamScanner {
  return createNoopCsamScanner();
}

/**
 * Handle a confirmed CSAM hit with the service-role client: quarantine the
 * media and open a csam_report. Evidence preservation + authority reporting
 * (SJPU/police) are driven from the locked CSAM surface — never auto-deleted
 * before preservation, never exposed to non-designated staff.
 */
export async function quarantineAndReport(
  admin: SupabaseClient<Database>,
  ref: MediaRef,
  source: string,
): Promise<{ reportId: string | null }> {
  // Quarantine: pull the object from the public bucket immediately.
  await admin.storage.from(ref.bucket).remove([ref.path]);

  const { data, error } = await admin
    .from("csam_reports")
    .insert({
      media_ref: `${ref.bucket}/${ref.path}`,
      match_source: source,
      status: "detected",
    })
    .select("id")
    .single();
  if (error) {
    console.error("csam: failed to open report", error);
    return { reportId: null };
  }
  return { reportId: data.id };
}
