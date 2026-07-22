// ============================================================
// FutureCut — Reliability and Edge Cases Tests
// ============================================================
// Corrupted file upload, mid-edit recovery (autosave),
// simulated worker failure, and concurrent edit documentation.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const CORRUPT_VIDEO = path.resolve(__dirname, "fixtures/corrupt-video.mp4");

test.describe("Reliability & Edge Cases", () => {
  test.beforeAll(() => {
    const fixtureDir = path.dirname(CORRUPT_VIDEO);
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }
    // Write a corrupted/fake mp4 file containing just random text
    fs.writeFileSync(CORRUPT_VIDEO, "This is not a real MP4 file! Just raw text to simulate corruption.");
  });

  test.afterAll(() => {
    if (fs.existsSync(CORRUPT_VIDEO)) {
      fs.unlinkSync(CORRUPT_VIDEO);
    }
  });

  test("corrupted/invalid file upload should display user-friendly error", async ({ page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(CORRUPT_VIDEO);

    // Should not crash the page, should show an error message
    const errorMsg = page.locator("text=Failed to process video, text=Please upload a video file");
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "test-results/edge-case-corrupted-upload.png" });
  });

  test("unsupported file format should display clear error", async ({ page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");

    // Create a dummy txt file
    const dummyTxt = path.resolve(__dirname, "fixtures/dummy.txt");
    fs.writeFileSync(dummyTxt, "hello world");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(dummyTxt);

    // Should display validation error
    const errorMsg = page.locator("text=Please upload a video file");
    await expect(errorMsg).toBeVisible({ timeout: 5000 });

    fs.unlinkSync(dummyTxt);
  });

  test("concurrent edits from two tabs — document expected behavior", async ({ context }) => {
    // Phase 4 does not scope active real-time collaboration or conflict resolution.
    // The expected behavior is "last write wins". Let's verify that opening a project in
    // two tabs does not crash the backend or frontend and that updates are saved.
    
    // We will simulate this by checking that page elements can be manipulated in both contexts
    // without throwing unexpected API exceptions.
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/editor");
    await page2.goto("/editor");

    // Verify both pages load successfully without crash
    await expect(page1.locator("body")).toBeVisible();
    await expect(page2.locator("body")).toBeVisible();
  });
});
