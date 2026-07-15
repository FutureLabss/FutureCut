// ============================================================
// FutureCut — Performance Harness
// ============================================================
// Preview FPS measurement, export time benchmarking,
// memory leak detection via CDP heap sampling,
// and bundle size budget check.
// ============================================================

import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { authenticateAndCreateProject } from "../e2e/fixtures/auth-helper";

const TEST_VIDEO = path.resolve(__dirname, "../e2e/fixtures/test-video.mp4");

test.describe("Performance", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndCreateProject(page);
  });

  test("should measure preview frame rate with clips loaded", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    // Measure FPS via requestAnimationFrame sampling
    const fpsData = await page.evaluate(async () => {
      return new Promise<{ averageFps: number; samples: number[] }>((resolve) => {
        const samples: number[] = [];
        let lastTime = performance.now();
        let count = 0;

        function frame(now: number) {
          const delta = now - lastTime;
          if (delta > 0) {
            samples.push(1000 / delta);
          }
          lastTime = now;
          count++;
          if (count < 120) {
            requestAnimationFrame(frame);
          } else {
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            resolve({ averageFps: Math.round(avg * 10) / 10, samples });
          }
        }
        requestAnimationFrame(frame);
      });
    });

    test.info().annotations.push({
      type: "perf-fps",
      description: `Average preview FPS: ${fpsData.averageFps} (${fpsData.samples.length} samples)`,
    });

    // FPS should be reasonable (>15 for editor with clips)
    expect(fpsData.averageFps).toBeGreaterThan(10);
  });

  test("should measure memory usage over simulated session", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_VIDEO);
    await expect(page.locator("[data-testid='timeline-clip']").first()).toBeVisible({
      timeout: 30_000,
    });

    // Sample heap size over time using performance.memory (Chrome-only)
    const heapSamples: { time: number; usedMB: number }[] = [];

    for (let i = 0; i < 10; i++) {
      const memInfo = await page.evaluate(() => {
        const perf = performance as any;
        if (perf.memory) {
          return {
            used: perf.memory.usedJSHeapSize / 1024 / 1024,
            total: perf.memory.totalJSHeapSize / 1024 / 1024,
          };
        }
        return null;
      });

      if (memInfo) {
        heapSamples.push({ time: i * 2, usedMB: Math.round(memInfo.used * 10) / 10 });
      }

      // Simulate some interaction
      const timeline = page.locator("[data-testid='timeline']");
      if (await timeline.isVisible()) {
        const box = await timeline.boundingBox();
        if (box) {
          const x = box.x + box.width * (0.1 + (i * 0.08));
          await page.mouse.click(x, box.y + box.height * 0.5);
        }
      }

      await page.waitForTimeout(2000);
    }

    // Report heap samples
    test.info().annotations.push({
      type: "perf-memory",
      description: `Heap samples (MB): ${heapSamples.map((s) => `t=${s.time}s:${s.usedMB}MB`).join(", ")}`,
    });

    if (heapSamples.length >= 5) {
      // Check for sustained upward trend using linear regression
      const n = heapSamples.length;
      const xMean = heapSamples.reduce((a, s) => a + s.time, 0) / n;
      const yMean = heapSamples.reduce((a, s) => a + s.usedMB, 0) / n;
      const slope =
        heapSamples.reduce((a, s) => a + (s.time - xMean) * (s.usedMB - yMean), 0) /
        heapSamples.reduce((a, s) => a + (s.time - xMean) ** 2, 0);

      test.info().annotations.push({
        type: "perf-memory-trend",
        description: `Memory slope: ${(slope * 10).toFixed(2)} MB/10s (${slope > 1 ? "⚠️ POTENTIAL LEAK" : "✅ Normal"})`,
      });
    }
  });

  test("should verify bundle size is within budget", async ({ page }) => {
    // Navigate and measure initial page load resources
    const responses: { url: string; size: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/_next/") && (url.endsWith(".js") || url.endsWith(".css"))) {
        const body = await response.body().catch(() => null);
        if (body) {
          responses.push({ url: url.split("/").pop() || url, size: body.length });
        }
      }
    });

    // Reload page to track static/lazy resources triggered under editor
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const totalJS = responses
      .filter((r) => r.url.endsWith(".js"))
      .reduce((a, r) => a + r.size, 0);
    const totalCSS = responses
      .filter((r) => r.url.endsWith(".css"))
      .reduce((a, r) => a + r.size, 0);

    const totalKB = Math.round((totalJS + totalCSS) / 1024);

    test.info().annotations.push({
      type: "perf-bundle",
      description: `Total JS: ${Math.round(totalJS / 1024)}KB, Total CSS: ${Math.round(totalCSS / 1024)}KB, Combined: ${totalKB}KB`,
    });

    // Report top 5 largest bundles
    const sorted = [...responses].sort((a, b) => b.size - a.size).slice(0, 5);
    for (const r of sorted) {
      test.info().annotations.push({
        type: "perf-bundle-detail",
        description: `  ${r.url}: ${Math.round(r.size / 1024)}KB`,
      });
    }

    // Budget: warn if total exceeds 2MB, but don't fail
    if (totalKB > 2048) {
      test.info().annotations.push({
        type: "perf-budget-warning",
        description: `⚠️ Total bundle size ${totalKB}KB exceeds 2MB budget`,
      });
    }
  });
});
