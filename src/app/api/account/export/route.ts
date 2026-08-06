import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bundleFooter,
  bundleHeader,
  planExport,
  serializeTablePage,
  type FetchPlan,
  type TruncationNote,
} from "@/lib/account/export";
import { PROCESSORS } from "@/lib/consent/processors";
import { PURPOSES } from "@/lib/consent/purposes";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent/policy";
import { RETENTION_RULES } from "@/lib/account/retention";

/**
 * DPDP §11: the right of access.
 *
 * Erasure shipped a long time ago; the read side never did, which is the wrong
 * half of the pair to have. You cannot check that a deletion was complete if
 * you were never able to look at what was there.
 *
 * Streamed rather than buffered. A member with a year of interaction events is
 * comfortably past the 4.5MB ceiling on a non-streamed response, and buffering
 * the whole bundle to find that out is a 500 at exactly the wrong moment.
 */

export const maxDuration = 60;

const PAGE = 500;

/**
 * PostgREST puts filters in the query string, so an `.in()` list is bounded by
 * URL length, not by memory. A member with a few hundred chat threads would
 * blow past it and get a broken export instead of a large one, so parent ids
 * go in fixed-size chunks.
 */
const PARENT_CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One table, paged to its limit. Errors become a note, not a dead request. */
async function* readPlan(
  supabase: ReturnType<typeof createAdminClient>,
  plan: FetchPlan,
  userId: string,
): AsyncGenerator<unknown[]> {
  // Rows reachable only through a parent (post_media -> posts) need the parent
  // ids first. `null` here means "no parent hop", which is different from an
  // empty list ("parent hop, but they own nothing").
  let parentChunks: (string[] | null)[] = [null];
  if (plan.via) {
    const { data } = await supabase
      .from(plan.via.parent)
      .select("id")
      .eq(plan.via.parentColumn, userId);
    const parentIds = (data ?? []).map(
      (r) => (r as unknown as { id: string }).id,
    );
    if (parentIds.length === 0) return;
    parentChunks = chunk(parentIds, PARENT_CHUNK);
  }

  let emitted = 0;
  for (const parentIds of parentChunks) {
    for (let offset = 0; offset < plan.limit; offset += PAGE) {
      if (emitted >= plan.limit) return;
      const size = Math.min(PAGE, plan.limit - emitted);
      let query = supabase
        .from(plan.table)
        .select(plan.select)
        .range(offset, offset + size - 1);

      if (parentIds) query = query.in(plan.via!.localColumn, parentIds);
      if (plan.orFilter) query = query.or(plan.orFilter);
      for (const filter of plan.filters) {
        query = query.eq(filter.column, filter.value);
      }

      const { data, error } = await query;
      if (error) {
        console.error("export page failed", {
          table: plan.table,
          message: error.message,
        });
        return;
      }
      const rows = (data ?? []) as unknown[];
      if (rows.length > 0) {
        emitted += rows.length;
        yield rows;
      }
      // A short page means this chunk is exhausted; move to the next one.
      if (rows.length < size) break;
    }
  }
}

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Two a day. This is a full read of everything a member has; more than that
  // is not a right being exercised, it is a scrape.
  const allowed = await checkRateLimit(
    `account-export:${ctx.user.id}`,
    2,
    86_400,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const subject = { userId: ctx.user.id, email: ctx.user.email ?? null };
  const plans = planExport(subject);
  const generatedAt = new Date().toISOString();

  // Service role, because several exportable tables have no owner-select
  // policy at all (they are written by the service and read through joins), so
  // the member's own client would silently return an empty section for them -
  // an export that under-reports is worse than one that fails.
  const admin = createAdminClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const truncated: TruncationNote[] = [];

      try {
        push(
          bundleHeader({
            generatedAt,
            policyVersion: PRIVACY_POLICY_VERSION,
            subject,
          }),
        );

        let first = true;
        for (const plan of plans) {
          const rows: unknown[] = [];
          for await (const page of readPlan(admin, plan, subject.userId)) {
            rows.push(...page);
          }
          if (rows.length >= plan.limit) {
            truncated.push({
              table: plan.table,
              exported: rows.length,
              limit: plan.limit,
            });
          }
          push(serializeTablePage(plan.table, rows, first));
          first = false;
        }

        // §11 asks for a summary of PROCESSING, not just a pile of rows. Built
        // from the same constants the app enforces, so it is a description of
        // the system rather than a second document that can disagree with it.
        const { data: consentLog } = await admin
          .from("consent_events")
          .select("purpose, action, policy_version, method, created_at")
          .eq("user_id", subject.userId)
          .order("created_at", { ascending: true });

        push(
          bundleFooter({
            truncated,
            processing: {
              purposes: PURPOSES,
              consent_history: consentLog ?? [],
              processors: PROCESSORS,
              retention: RETENTION_RULES,
            },
          }),
        );
      } catch (error) {
        // The document is already partly written, so there is no status code
        // left to change. Close it as valid JSON carrying the failure rather
        // than truncating mid-array and handing over an unparseable file.
        console.error("export stream failed", error);
        push(
          `\n  },\n  "error": "export incomplete - please try again"\n}\n`,
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="outsidermap-export-${generatedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
