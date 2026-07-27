import "server-only";
import { serverEnv } from "@/lib/env";

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  /** Where replies should go (e.g. the applicant's email on admin alerts). */
  replyTo?: string;
};

/**
 * Sends a transactional email via the Resend REST API. No SDK - a raw fetch
 * keeps the dependency surface small. Returns false (rather than
 * throwing) when Resend isn't configured, so callers can treat email as
 * best-effort and never block the primary action.
 */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: SendArgs): Promise<boolean> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.warn(
      "Resend not configured (RESEND_API_KEY / RESEND_FROM) - skipping email.",
    );
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
  return true;
}
