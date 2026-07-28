import { describe, expect, it } from "vitest";

import { configWarnings } from "@/lib/startup";

/**
 * The config check that runs once per server instance.
 *
 * This exists for one category of mistake: a setting the code treats as
 * optional, whose absence costs money rather than raising an error. Nothing
 * fails, so nothing tells you - which is why the warning has to be right about
 * when it fires, and silent when it would be noise.
 */

type RawEnv = Record<string, string | undefined>;

const LIVE: RawEnv = {
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  ANTHROPIC_API_KEY: "sk-ant-test",
  AI_FAST_MODEL: "claude-haiku-4-5-20251001",
};

const env = (over: RawEnv = {}): RawEnv => ({
  ...LIVE,
  ...over,
});

const warnsAboutFastModel = (e: RawEnv) =>
  configWarnings(e).some((w) => w.includes("AI_FAST_MODEL"));

describe("configWarnings", () => {
  it("says nothing when everything is configured", () => {
    expect(configWarnings(env())).toEqual([]);
  });

  it("warns when the fast model is missing and extraction can actually run", () => {
    expect(warnsAboutFastModel(env({ AI_FAST_MODEL: undefined }))).toBe(true);
  });

  it("treats an empty value as unset", () => {
    // The specific trap: Vercel's dashboard saves a variable with an empty
    // value quite happily, and "" is not a configured model. A check that read
    // it as set would report all clear in exactly the case someone is most
    // likely to have got wrong.
    expect(warnsAboutFastModel(env({ AI_FAST_MODEL: "" }))).toBe(true);
    expect(warnsAboutFastModel(env({ AI_FAST_MODEL: "   " }))).toBe(true);
  });

  it("names what it would fall back to, so the cost is legible", () => {
    const [warning] = configWarnings(
      env({ AI_FAST_MODEL: undefined, AI_MODEL: "claude-opus-4-8" }),
    );
    expect(warning).toContain("claude-opus-4-8");
    expect(warning).toContain("claude-haiku-4-5-20251001");
  });

  it("falls back to naming the adapter default when AI_MODEL is unset too", () => {
    const [warning] = configWarnings(env({ AI_FAST_MODEL: undefined }));
    expect(warning).toContain("adapter default");
  });

  it("stays quiet when extraction cannot write what it finds", () => {
    // Without a service-role key `rememberFromTurn` returns before it spends a
    // single token, so the fast model costs nothing. Warning here would be
    // noise on every preview deploy, and a warning people learn to scroll past
    // is worse than no warning at all.
    expect(
      warnsAboutFastModel(
        env({ AI_FAST_MODEL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }),
      ),
    ).toBe(false);
  });

  it("stays quiet when no provider is configured", () => {
    expect(
      warnsAboutFastModel(
        env({ AI_FAST_MODEL: undefined, ANTHROPIC_API_KEY: undefined }),
      ),
    ).toBe(false);
  });

  it("checks the key belonging to the selected provider", () => {
    // An Anthropic key set while AI_PROVIDER is openai configures nothing. The
    // check has to follow the same branch the AI factory does, or it warns
    // about a cost that cannot be incurred.
    const openai = { AI_FAST_MODEL: undefined, AI_PROVIDER: "openai" };
    expect(warnsAboutFastModel(env(openai))).toBe(false);
    expect(
      warnsAboutFastModel(env({ ...openai, OPENAI_API_KEY: "sk-test" })),
    ).toBe(true);
  });

  it("returns warnings rather than throwing", () => {
    // Refusing to boot over a model alias would turn a billing footgun into an
    // outage. `register` runs before the server accepts requests, so anything
    // that throws here takes the whole deploy down.
    expect(() => configWarnings({})).not.toThrow();
    expect(Array.isArray(configWarnings({}))).toBe(true);
  });
});
