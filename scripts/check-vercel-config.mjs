/**
 * CI guard: vercel.json must stay legal for the Vercel HOBBY plan, or every
 * production deployment silently fails while CI stays green (this exact
 * failure pinned prod at an old build for two sprints - issue #37).
 *
 * Hobby rules enforced here:
 *  - at most 2 cron jobs
 *  - every schedule is DAILY: fixed minute + fixed hour ("M H * * *")
 *
 * Run: node scripts/check-vercel-config.mjs   (exits 1 on violation)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));

const crons = config.crons ?? [];
const errors = [];

if (crons.length > 2) {
  errors.push(
    `Hobby allows at most 2 cron jobs; vercel.json declares ${crons.length}.`,
  );
}

const DAILY = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* \*$/;
for (const cron of crons) {
  if (!cron.path || !cron.schedule) {
    errors.push(`Malformed cron entry: ${JSON.stringify(cron)}`);
    continue;
  }
  if (!DAILY.test(cron.schedule)) {
    errors.push(
      `Cron "${cron.path}" schedule "${cron.schedule}" is not a fixed daily time. ` +
        `Hobby requires "M H * * *" (no steps, ranges, or wildcards in minute/hour).`,
    );
  }
}

if (errors.length > 0) {
  console.error("vercel.json is not deployable on the Hobby plan:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nFix vercel.json (or upgrade the Vercel plan and update this check).",
  );
  process.exit(1);
}

console.log(
  `vercel.json OK: ${crons.length} cron(s), all daily - deployable on Hobby.`,
);
