import { z } from "zod";

/**
 * Lazily validated env access. Validation happens at call time, not import
 * time, so builds and previews succeed without secrets configured - a
 * missing variable fails loudly only when the code path that needs it runs.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  AI_MODEL: z.string().min(1).optional(),
  /** Cheaper/faster model for latency-critical steps (chat decisions). */
  AI_FAST_MODEL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  /** Base URL for server-to-self calls (reel job kickoff). A bare domain
   *  ("outsidermap.com") is a common dashboard entry - normalize it. */
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (v) =>
      typeof v === "string" && v.length > 0 && !/^https?:\/\//.test(v)
        ? `https://${v}`
        : v,
    z.string().url().optional(),
  ),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_PREMIUM_PLAN_ID: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().min(1).optional(),
  RESEND_ADMIN_EMAIL: z.string().email().optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Comma-separated emails allowed to re-submit the waitlist (for testing).
  WAITLIST_TEST_EMAILS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Vercel's dashboard happily saves a variable with an empty value, and
 * "" fails min(1)/url() - which took down every route whose first line is
 * serverEnv() (the cron 500s in prod). Treat empty/whitespace values as
 * unset so optional vars degrade the feature instead of the whole route.
 */
function withoutEmptyValues(
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim() === "") continue;
    out[key] = value;
  }
  return out;
}

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(withoutEmptyValues(process.env));
    if (!parsed.success) {
      throw new Error(
        `Invalid environment configuration: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
