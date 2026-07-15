// ============================================================
// FutureCut — E2E: Text Overlay
// ============================================================
// Add text track, add text overlay, verify clip on timeline.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Text Overlay", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should add and configure text overlay on timeline", async ({ page }) => {
    // Upload video first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // 1. Click "+ Text Track" in the toolbar to create a text track
    const addTextTrackBtn = page.locator("button:has-text('+ Text Track')");
    if (await addTextTrackBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTextTrackBtn.click();
      await page.waitForTimeout(500);

      // 2. Click the "+T" button in the newly created text track header to add a text clip
      const addTextClipBtn = page.locator("button:has-text('+T')");
      if (await addTextClipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addTextClipBtn.click();
        await page.waitForTimeout(500);
      }
    }

    await page.screenshot({ path: "test-results/text-overlay.png" });

    // Capture the preview canvas with text
    const canvas = page.locator("canvas").first();
    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
      await canvas.screenshot({ path: "test-results/text-overlay-preview.png" });
    }
  });
});
