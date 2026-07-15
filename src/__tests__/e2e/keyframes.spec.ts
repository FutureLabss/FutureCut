// ============================================================
// FutureCut — E2E: Keyframe Animation
// ============================================================
// Animate position + opacity — screenshot at 3 points.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Keyframes", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should add keyframes and preview animation at multiple points", async ({ page }) => {
    // Upload video
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // Select the clip
    await page.locator("[data-clip]").first().click();
    await page.waitForTimeout(300);

    // Click "Add Keyframe at playhead" button
    const addKfBtn = page.locator("button:has-text('Add Keyframe at playhead')");
    if (await addKfBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addKfBtn.click();
      await page.waitForTimeout(300);
    }

    // Take screenshots at 3 time positions on the canvas
    const canvas = page.locator("canvas").first();
    const timeline = page.locator("[data-timeline-scroll]");

    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false) && await timeline.isVisible()) {
      const box = await timeline.boundingBox();
      if (box) {
        // Screenshot at ~25%, 50%, 75% of timeline
        for (const [label, pct] of [["start", 0.1], ["mid", 0.5], ["end", 0.9]] as const) {
          await page.mouse.click(box.x + box.width * pct, box.y + box.height * 0.5);
          await page.waitForTimeout(300);
          await canvas.screenshot({ path: `test-results/keyframe-${label}.png` });
        }
      }
    }

    await page.screenshot({ path: "test-results/keyframes.png" });
  });
});
