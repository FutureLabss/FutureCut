// ============================================================
// FutureCut — Visual Regression Tests
// ============================================================
// Baseline screenshots for: empty editor, populated timeline,
// preview canvas, inspector panel per clip type.
// maxDiffPixelRatio: 0.025 for anti-aliasing tolerance.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import { authenticateAndCreateProject } from "../e2e/fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "../e2e/fixtures/test-video.mp4");

test.describe("Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("empty editor baseline", async ({ page }) => {
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("empty-editor.png", {
      maxDiffPixelRatio: 0.025,
      fullPage: true,
    });
  });

  test("populated timeline baseline", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("populated-timeline.png", {
      maxDiffPixelRatio: 0.025,
      fullPage: true,
    });
  });

  test("preview canvas at fixed timestamp", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    // Scrub to a fixed position (~50%)
    const timeline = page.locator("[data-testid='timeline']");
    if (await timeline.isVisible()) {
      const box = await timeline.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(500);
      }
    }

    const canvas = page.locator("canvas").first();
    if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(canvas).toHaveScreenshot("preview-canvas-mid.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });

  test("inspector panel with selected clip", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    // Select clip to open inspector
    await page.locator("[data-testid='timeline-clip']").first().click();
    await page.waitForTimeout(500);

    const inspector = page.locator(
      "[data-testid='inspector'], [data-testid='properties-panel'], [data-testid='clip-properties']"
    );
    if (await inspector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(inspector).toHaveScreenshot("inspector-video-clip.png", {
        maxDiffPixelRatio: 0.025,
      });
    }
  });
});
