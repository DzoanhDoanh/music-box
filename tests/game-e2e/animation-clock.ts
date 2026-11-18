import type { Page } from '@playwright/test';

/** Pause an installed clock without racing a timestamp against a browser round trip. */
export async function pauseAnimationClock(page: Page) {
  const now = await page.evaluate(() => Date.now());
  // Fix wall time first; performance/RAF keep their existing timeline. pauseAt
  // can then stop at that exact timestamp without skipping pending animation frames.
  await page.clock.setFixedTime(now);
  await page.clock.pauseAt(now);
  await page.clock.setSystemTime(now);
}
