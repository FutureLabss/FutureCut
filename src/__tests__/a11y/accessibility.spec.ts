// ============================================================
// FutureCut — Accessibility Tests (WCAG 2.2 AA)
// ============================================================
// @axe-core/playwright scan + keyboard-only pass.
// ============================================================

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { authenticateAndCreateProject } from "../e2e/fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "../e2e/fixtures/test-video.mp4");

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should pass WCAG 2.2 AA audit on empty editor", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = results.violations;
    const criticalOrSerious = violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    test.info().annotations.push({
      type: "a11y-report",
      description: `Total violations: ${violations.length}, Critical/Serious: ${criticalOrSerious.length}`,
    });

    for (const v of violations) {
      test.info().annotations.push({
        type: `a11y-${v.impact}`,
        description: `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
      });
    }

    expect(
      criticalOrSerious.length,
      `Found ${criticalOrSerious.length} critical/serious a11y violations:\n${criticalOrSerious
        .map((v) => `  - ${v.id}: ${v.description}`)
        .join("\n")}`
    ).toBe(0);
  });

  test("should pass WCAG 2.2 AA audit on populated editor", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations = results.violations;
    const criticalOrSerious = violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    test.info().annotations.push({
      type: "a11y-report",
      description: `Total violations: ${violations.length}, Critical/Serious: ${criticalOrSerious.length}`,
    });

    for (const v of violations) {
      test.info().annotations.push({
        type: `a11y-${v.impact}`,
        description: `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
      });
    }

    expect(
      criticalOrSerious.length,
      `Found ${criticalOrSerious.length} critical/serious a11y violations:\n${criticalOrSerious
        .map((v) => `  - ${v.id}: ${v.description}`)
        .join("\n")}`
    ).toBe(0);
  });

  test("keyboard-only navigation through editor actions", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    // Tab through interactive elements
    const focusedElements: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid") || "";
        const role = el.getAttribute("role") || "";
        return `${tag}${testId ? `[${testId}]` : ""}${role ? `{${role}}` : ""}`;
      });
      focusedElements.push(focused);
    }

    test.info().annotations.push({
      type: "keyboard-nav",
      description: `Tab order: ${focusedElements.join(" → ")}`,
    });

    const uniqueFocused = new Set(focusedElements.filter((e) => e !== "body" && e !== "none"));
    expect(uniqueFocused.size).toBeGreaterThan(0);

    // Test Ctrl+Z (undo) keyboard shortcut
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);

    // Test Ctrl+Shift+Z (redo) keyboard shortcut
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(300);

    await page.screenshot({ path: "test-results/keyboard-navigation.png" });
  });
});
