import { expect, test } from '@playwright/test';

// KRTX-4744: marketing pages must scroll like the browser scrolls. The
// marketing, SEO and services shells used to mount a Lenis smooth-scroll
// component that intercepted the wheel and animated the scroll position with
// a lerp. A native page never carries the hijacker's `lenis lenis-smooth`
// classes on <html>, and the wheel moves it directly.

// One route per shell: the marketing shell ('/', '/pricing'), the SEO shell
// ('/use-cases') and the services sales shell ('/services').
const SHELL_ROUTES = ['/', '/pricing', '/use-cases', '/services'] as const;

test('marketing pages scroll natively: no scroll hijack on the wheel', async ({ page }) => {
  for (const route of SHELL_ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });

    // No smooth-scroll hijack: the document root carries no Lenis classes.
    await expect(page.locator('html')).not.toHaveClass(/lenis/, { timeout: 10_000 });

    // The wheel moves the page, like on every native page.
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 1200);
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeGreaterThan(0);
  }
});
