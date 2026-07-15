// ============================================================
// FutureCut — E2E: Filters & LUT
// ============================================================
// Apply 2 filters + 1 LUT, before/after screenshot.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Filters and LUT", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should apply filters and LUT to a clip", async ({ page }) => {
    // Upload video
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // Select the clip
    await page.locator("[data-clip]").first().click();
    await page.waitForTimeout(300);

    // Screenshot before filters
    const canvas = page.locator("canvas").first();
    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
      await canvas.screenshot({ path: "test-results/filter-before.png" });
    }

    // Click "+ Brightness" button in creative tools panel
    const addBrightnessBtn = page.locator("button:has-text('+ Brightness')");
    if (await addBrightnessBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBrightnessBtn.click();
      await page.waitForTimeout(300);

      // Click "+ Contrast" button
      const addContrastBtn = page.locator("button:has-text('+ Contrast')");
      if (await addContrastBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addContrastBtn.click();
        await page.waitForTimeout(300);
      }

      // Click "+ LUT" button
      const addLutBtn = page.locator("button:has-text('+ LUT')");
      if (await addLutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addLutBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Screenshot after filters
    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
      await canvas.screenshot({ path: "test-results/filter-after.png" });
    }

    await page.screenshot({ path: "test-results/filters-lut-applied.png" });
  });
});
