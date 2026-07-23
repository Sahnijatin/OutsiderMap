import type { MetadataRoute } from "next";

/**
 * Robots (#116). Crawlers are welcome on the front door, the brand story, and
 * the published place pages; everything personalized or write-facing is
 * disallowed (it redirects to sign-in anyway).
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
        "/reels",
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
