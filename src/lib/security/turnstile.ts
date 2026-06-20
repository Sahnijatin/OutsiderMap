import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Verifies a Cloudflare Turnstile token server-side. Returns true when
 * Turnstile isn't configured (TURNSTILE_SECRET_KEY unset), so local/dev and
 * previews without keys keep working. When configured, a missing or invalid
 * token returns false.
 */
export async function verifyTurnstile(
  token: string | null,
  ip: string | null,
): Promise<boolean> {
  const secret = serverEnv().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
