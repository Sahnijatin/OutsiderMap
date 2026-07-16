import { NextResponse } from "next/server";

/**
 * Liveness + "which build is this" in one curl. Vercel injects the commit
 * SHA at build time; locally it's absent.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "outsidermap",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
  });
}
