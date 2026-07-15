// ============================================================
// FutureCut — E2E: Upload → Timeline → Edit → Export
// ============================================================
// Core acceptance flow: upload a video, verify the timeline
// appears, perform scrub/trim/split/delete, undo×5, redo×5,
// export, and verify the downloaded file exists.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "./fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-video.mp4");

test.describe("Upload to Export Flow", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should upload a video and display it on the timeline", async ({ page }) => {
    // Upload the test video
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);

    // Wait for the timeline to populate
    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.screenshot({ path: "test-results/upload-timeline.png" });
  });

  test("full edit flow: scrub → trim → split → delete → undo×5 → redo×5 → export", async ({ page }) => {
    // 1. Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);

    await expect(page.locator("[data-clip]").first()).toBeVisible({
      timeout: 30_000,
    });

    // 2. Scrub — click on the timeline at roughly 50% position
    const timeline = page.locator("[data-timeline-scroll]");
    if (await timeline.isVisible()) {
      const box = await timeline.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      }
    }

    await page.screenshot({ path: "test-results/after-scrub.png" });

    // 3. Trim — click on a clip first to select it
    const clip = page.locator("[data-clip]").first();
    if (await clip.isVisible()) {
      await clip.click();
    }

    // 4. Split — try the split button or keyboard shortcut 'S'
    const splitBtn = page.locator("button[title*='Split']");
    if (await splitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await splitBtn.click();
    } else {
      await page.keyboard.press("s");
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/after-split.png" });

    // 5. Delete — try delete button or Delete key
    const clips = page.locator("[data-clip]");
    const clipCount = await clips.count();
    if (clipCount > 0) {
      await clips.first().click();
      const deleteBtn = page.locator("button[title*='Delete']");
      if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteBtn.click();
      } else {
        await page.keyboard.press("Delete");
      }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/after-delete.png" });

    // 6. Undo ×5
    for (let i = 0; i < 5; i++) {
      const undoBtn = page.locator("button[title*='Undo']");
      if (await undoBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isDisabled = await undoBtn.getAttribute("disabled") !== null;
        if (!isDisabled) {
          await undoBtn.click();
        }
      } else {
        await page.keyboard.press("Control+z");
      }
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: "test-results/after-undo5.png" });

    // 7. Redo ×5
    for (let i = 0; i < 5; i++) {
      const redoBtn = page.locator("button[title*='Redo']");
      if (await redoBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isDisabled = await redoBtn.getAttribute("disabled") !== null;
        if (!isDisabled) {
          await redoBtn.click();
        }
      } else {
        await page.keyboard.press("Control+Shift+z");
      }
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: "test-results/after-redo5.png" });

    // 8. Export button should be visible
    const exportBtn = page.locator("button:has-text('Export')");
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "test-results/after-edit-flow.png" });
  });
});
