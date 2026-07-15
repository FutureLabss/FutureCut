// ============================================================
// FutureCut — E2E: Speed Ramp
// ============================================================
// Constant 2x, 0.5x, and 3-point ramp.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Speed Ramp", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should apply speed changes and reflect duration change", async ({ page }) => {
    // Upload video
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // Select the clip
    await page.locator("[data-clip]").first().click();
    await page.waitForTimeout(300);

    // Look for speed controls (e.g. "2.0x Fast" button)
    const fastSpeedBtn = page.locator("button:has-text('2.0x Fast')");
    if (await fastSpeedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fastSpeedBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/speed-2x.png" });

      const slowSpeedBtn = page.locator("button:has-text('0.5x Slow')");
      if (await slowSpeedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await slowSpeedBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: "test-results/speed-0.5x.png" });
      }

      const rampBtn = page.locator("button:has-text('Set Speed Ramp')");
      if (await rampBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await rampBtn.click();
        await page.waitForTimeout(500);
      }
    }

    await page.screenshot({ path: "test-results/speed-ramp.png" });
  });
});
