import { test, expect, type Page } from "@playwright/test";

/**
 * Guided tour, at phone viewports.
 *
 * This is the half of the tour that the unit suite cannot reach. vitest here
 * runs in a node environment over `tests/**\/*.test.ts` with no jsdom, so the
 * placement math, the store and the focus-trap indices are covered there while
 * everything DOM-shaped - data-tour actually reaching the navs, the resolver
 * picking the visible one of the two, the overlay's z-order, focus movement,
 * click-through - only exists here.
 *
 * Prerequisites (see README -> Authed flows). Both are environment setup, not
 * something the spec can arrange for itself:
 *   MOBILE_VERIFY_AUTHED=1  and a seeded session whose profile has
 *   activated_at set and tour_completed_at NULL.
 * Without them the tour never arms and every assertion below would be a false
 * failure, so the whole file skips.
 */

const AUTHED = !!process.env.MOBILE_VERIFY_AUTHED;

const PANEL = '[role="dialog"]';
const STEP_ORDER = [
  "nav-map",
  "nav-chat",
  "nav-quests",
  "nav-feed",
  "nav-blog",
  "nav-profile",
] as const;
/** The route each step is viewed on, in the same order. */
const ROUTES = [
  "/map",
  "/chat",
  "/quests",
  "/feed",
  "/blog",
  "/profile",
] as const;

/** Same invariant flows.spec.ts enforces: never scroll sideways. */
async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(
    overflow,
    `page overflows horizontally by ${overflow}px while the tour is open`,
  ).toBeLessThanOrEqual(2);
}

/** The panel must sit entirely inside the viewport, not just avoid overflow. */
async function assertPanelOnScreen(page: Page) {
  const box = await page.locator(PANEL).boundingBox();
  expect(box, "tour panel has no box").not.toBeNull();
  if (!box) return;
  const view = page.viewportSize();
  if (!view) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
}

/** Dismiss the map's welcome card, which deliberately holds the tour off. */
async function clearWelcome(page: Page) {
  const card = page.getByText(/This is your city now/i);
  if (await card.isVisible().catch(() => false)) await card.click();
}

async function openTour(page: Page) {
  await page.goto("/map");
  await clearWelcome(page);
  await expect(page.locator(PANEL)).toBeVisible({ timeout: 10_000 });
}

test.describe("guided tour", () => {
  test.skip(!AUTHED, "needs a seeded session with tour_completed_at NULL");

  test("walks all six surfaces on Next alone, and stays on screen", async ({
    page,
  }) => {
    await openTour(page);

    for (let i = 0; i < STEP_ORDER.length; i += 1) {
      const anchor = STEP_ORDER[i];

      await expect(page.locator(PANEL)).toContainText(
        `Step ${i + 1} of ${STEP_ORDER.length}`,
      );
      // Next must actually TAKE you to the surface it is describing. An earlier
      // revision advanced the counter and then snapped straight back, which
      // looks identical to a step that never moved unless the URL is checked.
      await expect(page).toHaveURL(new RegExp(`${ROUTES[i]}$`));
      await assertNoHorizontalScroll(page);
      await assertPanelOnScreen(page);

      // Exactly one of the two navs is painted; the resolver must have picked
      // that one, so the visible anchor is what the spotlight is framing.
      await expect(page.locator(`[data-tour="${anchor}"]:visible`)).toHaveCount(
        1,
      );

      await page
        .locator(PANEL)
        .getByRole("button", { name: i === STEP_ORDER.length - 1 ? "Finish" : "Next" })
        .click();
    }

    await expect(page.locator(PANEL)).toBeHidden();
  });

  test("Back walks the tour in reverse", async ({ page }) => {
    await openTour(page);
    await page.locator(PANEL).getByRole("button", { name: "Next" }).click();
    await expect(page.locator(PANEL)).toContainText("Step 2 of 6");
    await expect(page).toHaveURL(/\/chat$/);

    await page.locator(PANEL).getByRole("button", { name: "Back" }).click();
    await expect(page.locator(PANEL)).toContainText("Step 1 of 6");
    await expect(page).toHaveURL(/\/map$/);
  });

  test("the arrow keys move the tour too", async ({ page }) => {
    await openTour(page);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(PANEL)).toContainText("Step 2 of 6");
    await expect(page).toHaveURL(/\/chat$/);

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(PANEL)).toContainText("Step 1 of 6");
  });

  test("advances when the spotlit nav item is tapped", async ({ page }) => {
    await openTour(page);
    await expect(page.locator(PANEL)).toContainText("Step 1 of 6");

    await page.locator('[data-tour="nav-map"]:visible').click();
    await expect(page.locator(PANEL)).toContainText("Step 2 of 6");
  });

  test("follows the member to another surface instead of fighting them", async ({
    page,
  }) => {
    await openTour(page);
    await page.locator('[data-tour="nav-blog"]:visible').click();

    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.locator(PANEL)).toContainText("Step 5 of 6");
  });

  test("Escape ends it for good", async ({ page }) => {
    await openTour(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toBeHidden();

    // Skipping is a completion: it must not come back on a reload.
    await page.reload();
    await clearWelcome(page);
    await expect(page.locator(PANEL)).toBeHidden({ timeout: 5_000 });
  });

  test("keeps keyboard focus inside the panel", async ({ page }) => {
    await openTour(page);
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      );
      expect(inside, `focus escaped the tour panel after ${i + 1} tabs`).toBe(
        true,
      );
    }
  });

  test("can be replayed from profile settings", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Show me around/i }).click();

    await expect(page).toHaveURL(/\/map$/);
    await expect(page.locator(PANEL)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(PANEL)).toContainText("Step 1 of 6");
  });
});

test.describe("guided tour on a laptop", () => {
  test.skip(!AUTHED, "needs a seeded session with tour_completed_at NULL");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("spotlights the side rail, not the hidden bottom tabs", async ({
    page,
  }) => {
    await openTour(page);

    const rail = page.locator('[data-tour="nav-map"]:visible');
    await expect(rail).toHaveCount(1);
    const box = await rail.boundingBox();
    expect(box, "no visible nav anchor at lg").not.toBeNull();
    // The rail is --rail-w (13.5rem) wide and pinned left; a bottom tab would
    // be centred and far lower.
    expect(box?.x ?? 999).toBeLessThan(220);
  });
});
