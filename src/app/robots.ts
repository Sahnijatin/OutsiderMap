import type { MetadataRoute } from "next";

/**
 * Robots. Crawlers are welcome on the front door, the brand story, and the
 * published place pages; everything personalized or write-facing is disallowed
 * (it redirects to sign-in anyway).
 *
 * Note /sign-in stays disallowed while `/` is allowed: the root renders the
 * same landing, so crawlers get the content without a redirect into a blocked
 * URL. Keep it that way - redirecting / to /sign-in would de-index the domain.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://outsidermap.com";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/account",
        "/profile",
        "/chat",
        "/quests",
        "/feed",
        
        "/now",
        "/setup",
        "/onboarding",
        "/weekend",
        "/saved",
        "/events",
        "/submit",
        "/sign-in",
        "/auth/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
