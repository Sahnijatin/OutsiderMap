/**
 * Configuration warnings, checked once when a server instance starts.
 *
 * These are for settings that are *optional to the code and expensive to get
 * wrong* - the app runs fine without them, so nothing fails, and the cost shows
 * up on a bill weeks later instead of in a stack trace. A missing required
 * variable already fails loudly at the call site; this is the other category.
 *
 * Deliberately warnings, never throws. Refusing to boot over a model alias
 * would turn a billing footgun into an outage, which is a strictly worse
 * trade.
 *
 * ## Why this reads process.env rather than serverEnv()
 *
 * `serverEnv()` validates the whole schema and throws when a required variable
 * is missing. That validation is lazy on purpose (see `env.ts`) so builds and
 * previews succeed without secrets configured - and calling it here, before the
 * server is ready to handle requests, would make every deploy without a full
 * secret set fail at boot. So this reads the raw values and applies the same
 * empty-means-unset rule by hand.
 */

/**
 * Vercel's dashboard happily saves a variable with an empty value, and an empty
 * string is not a configured model - it is the same footgun `withoutEmptyValues`
 * exists to absorb in `env.ts`. Treating "" as set here would make this check
 * confidently report that everything is fine in exactly the case someone is
 * most likely to have got wrong.
 */
function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** Just the shape this reads - `process.env` satisfies it, and so does a test. */
type RawEnv = Record<string, string | undefined>;

export function configWarnings(env: RawEnv = process.env): string[] {
  const warnings: string[] = [];

  // Memory extraction reads every answered chat turn for durable facts. It only
  // runs when it can write what it finds and when a provider is configured -
  // the same two conditions `rememberFromTurn` and the AI factory check before
  // doing anything - so a missing fast model costs nothing until both hold.
  const canWrite = isSet(env.SUPABASE_SERVICE_ROLE_KEY);
  const provider = env.AI_PROVIDER === "openai" ? "openai" : "anthropic";
  const hasProviderKey = isSet(
    provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY,
  );

  if (canWrite && hasProviderKey && !isSet(env.AI_FAST_MODEL)) {
    warnings.push(
      "AI_FAST_MODEL is not set. Memory extraction runs on every answered " +
        `chat turn and will fall back to ${
          isSet(env.AI_MODEL) ? `AI_MODEL (${env.AI_MODEL})` : "the adapter default"
        }, paying flagship rates for a small classification job. ` +
        "Set AI_FAST_MODEL (e.g. claude-haiku-4-5-20251001) and redeploy. " +
        "Nothing will break either way - that is the problem.",
    );
  }

  return warnings;
}
