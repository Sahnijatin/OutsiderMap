import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * The key surfaces the mobile app must get right. Auth-gated routes redirect to
 * sign-in when unauthenticated - the harness records that as an annotation
 * (not a failure) and screenshots wherever it lands, so the report doubles as a
 * live map of what's reachable. To exercise authed surfaces, point the harness
 * at an environment with a seeded session (see README → Authed flows).
 */
const SURFACES: { name: string; path: string }[] = [
  { name: "landing", path: "/" },
  { name: "sign-in", path: "/sign-in" },
  { name: "onboarding", path: "/onboarding" },
  { name: "map", path: "/map" },
  { name: "chat", path: "/chat" },
  { name: "reels", path: "/reels" },
  { name: "events", path: "/events" },
  { name: "saved", path: "/saved" },
  { name: "profile", path: "/profile" },
];

const SCREENSHOTS = path.join(__dirname, "screenshots");

/** A hard mobile-health invariant: the page must never scroll sideways. */
async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(
    overflow,
    `page overflows horizontally by ${overflow}px (mobile layouts must not scroll sideways)`,
  ).toBeLessThanOrEqual(2);
}

/** The page rendered something real - not a blank screen or a crash overlay. */
async function assertRendered(page: Page) {
  // Detect a real crash by its overlay text. NOTE: <nextjs-portal> is present
  // on every dev page (it hosts the dev tools), so its mere presence is NOT a
  // crash - only the error text is.
  const crashed = await page.evaluate(() =>
    /Unhandled Runtime Error|Application error: a (client|server)-side exception/i.test(
      document.body.innerText || "",
    ),
  );
  expect(crashed, "page shows a Next.js error/crash overlay").toBeFalsy();

  const meaningful = await page.evaluate(() => {
    const hasText = (document.body.innerText || "").trim().length > 0;
    const hasCanvas = !!document.querySelector("canvas"); // map / ConvergenceField
    const hasSvg = !!document.querySelector("svg");
    return hasText || hasCanvas || hasSvg;
  });
  expect(meaningful, "page appears blank (no text, canvas, or svg)").toBeTruthy();
}

for (const surface of SURFACES) {
  test(`${surface.name} - mobile health`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    const resp = await page.goto(surface.path, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    // Let async client work (map tiles, motion, data) settle briefly.
    await page.waitForTimeout(1200);

    const landed = new URL(page.url()).pathname;
    if (landed !== surface.path && landed.includes("sign-in")) {
      testInfo.annotations.push({
        type: "auth-gated",
        description: `${surface.path} redirected to ${landed} (sign-in required)`,
      });
    }

    // Always capture the screenshot - it's the deliverable of the review loop.
    await page.screenshot({
      path: path.join(SCREENSHOTS, testInfo.project.name, `${surface.name}.png`),
      fullPage: true,
    });

    if (pageErrors.length) {
      await testInfo.attach("page-errors", {
        body: pageErrors.join("\n"),
        contentType: "text/plain",
      });
    }

    // A 5xx is a real failure; redirects (3xx) and auth 401s are expected states.
    if (resp && resp.status() >= 500) {
      throw new Error(`${surface.path} returned HTTP ${resp.status()}`);
    }

    await assertRendered(page);
    await assertNoHorizontalScroll(page);
  });
}
