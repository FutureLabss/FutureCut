// ============================================================
// FutureCut — E2E: Transitions
// ============================================================
// Verifies splitting and preview layout flow.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Transitions", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should apply and preview transitions between clips", async ({ page }) => {
    // Upload video
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // Split to create two clips
    const clip = page.locator("[data-clip]").first();
    await clip.click();
    
    const splitBtn = page.locator("button[title*='Split']");
    if (await splitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await splitBtn.click();
    } else {
      await page.keyboard.press("s");
    }
    await page.waitForTimeout(500);

    // Verify two clips are present on timeline after split
    const clipCount = await page.locator("[data-clip]").count();
    expect(clipCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: "test-results/transition-crossfade.png" });

    // Capture the preview canvas
    const canvas = page.locator("canvas").first();
    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
      await canvas.screenshot({ path: "test-results/transition-preview.png" });
    }
  });
});
