import { expect, test } from "@playwright/test";

// Wheel automation cannot generate macOS's native swipe-between-pages gesture.
// Assert its CSS prerequisite on the rendered root, not the stylesheet text.
test("native horizontal history remains enabled while vertical overscroll stays suppressed", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior-x", "auto");
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior-y", "none");
  await page.goto("/");
  await page.goBack();
  await expect(page).toHaveURL(/\/auth/);
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
});
