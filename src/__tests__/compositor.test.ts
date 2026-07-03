// ============================================================
// FutureCut — Compositor Unit Tests
// ============================================================
// Tests the compositor's track sorting, transitions, and
// text layout parameters using a mocked Canvas 2D context.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { renderFrame } from "@/lib/preview/compositor";
import type { Project, Track, Clip } from "@/lib/model/types";

// Helper to create a canvas 2D mock context
function createMockContext() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1.0,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("Visual Compositor", () => {
  it("should draw video tracks and text in order of track order stacking", async () => {
    const ctx = createMockContext();
    const mockImage = {} as ImageBitmap;
    const getVideoFrame = vi.fn().mockReturnValue(mockImage);

    // Project with 2 tracks: Video order 1, Text order 2
    const project: Project = {
      id: "p1",
      name: "Test",
      fps: 30,
      duration: 10,
      tracks: [
        {
          id: "track-text",
          type: "text",
          order: 2,
          clips: [
            {
              id: "c-text",
              sourceId: "text",
              trackId: "track-text",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              text: "Hello World",
              fontSize: 30,
              color: "#ff0000",
            },
          ],
        },
        {
          id: "track-video",
          type: "video",
          order: 1,
          clips: [
            {
              id: "c-video",
              sourceId: "asset-video",
              trackId: "track-video",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
            },
          ],
        },
      ],
    };

    await renderFrame({
      project,
      timeSeconds: 2.0,
      ctx,
      canvasWidth: 1920,
      canvasHeight: 1080,
      getVideoFrame,
    });

    // Verify background clear
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    // Verify video frame drawn (translated to 0.5 * 1920, 0.5 * 1080, drawn centered at -960, -540)
    expect(getVideoFrame).toHaveBeenCalledWith("c-video", 2.0);
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 960, 540);
    expect(ctx.drawImage).toHaveBeenCalledWith(mockImage, -960, -540, 1920, 1080);
    // Verify text drawn (translated to 0.5 * 1920, 0.5 * 1080, drawn at local 0,0)
    expect(ctx.translate).toHaveBeenNthCalledWith(2, 960, 540);
    expect(ctx.fillText).toHaveBeenCalledWith("Hello World", 0, 0);
  });

  it("should blend crossfade transition correctly between overlapping clips", async () => {
    const ctx = createMockContext();
    const mockImageA = { name: "A" } as unknown as ImageBitmap;
    const mockImageB = { name: "B" } as unknown as ImageBitmap;
    
    const getVideoFrame = vi.fn().mockImplementation((clipId) => {
      return clipId === "clip-a" ? mockImageA : mockImageB;
    });

    const project: Project = {
      id: "p1",
      name: "Test",
      fps: 30,
      duration: 10,
      tracks: [
        {
          id: "track-v1",
          type: "video",
          order: 0,
          clips: [
            {
              id: "clip-a",
              sourceId: "asset-1",
              trackId: "track-v1",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              transitionOut: { type: "crossfade", duration: 1.0 },
            },
            {
              id: "clip-b",
              sourceId: "asset-2",
              trackId: "track-v1",
              startTime: 4.0, // 1s overlap
              sourceInPoint: 0,
              sourceOutPoint: 5,
              transitionIn: { type: "crossfade", duration: 1.0 },
            },
          ],
        },
      ],
    };

    // Render at t = 4.5s (50% progress through 1s crossfade)
    await renderFrame({
      project,
      timeSeconds: 4.5,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    // Draw A first centered at -50,-50, then draw B centered at -50,-50 with globalAlpha = 0.5
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, mockImageA, -50, -50, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, mockImageB, -50, -50, 100, 100);
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it("should apply text slideIn animations correctly", async () => {
    const ctx = createMockContext();
    const project: Project = {
      id: "p1",
      name: "Test",
      fps: 30,
      duration: 10,
      tracks: [
        {
          id: "track-text",
          type: "text",
          order: 0,
          clips: [
            {
              id: "clip-text",
              sourceId: "text",
              trackId: "track-text",
              startTime: 1.0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              text: "Animated Text",
              animation: "slideIn",
              position: { x: 0.5, y: 0.5 },
            },
          ],
        },
      ],
    };

    // Render at t = 1.4s (50% progress since start = 1.0s, animationDuration = 0.8s)
    // progress = 0.4s / 0.8s = 0.5. t = 0.5 * 1.5 = 0.75 (eased)
    // slide offset = 50 * (1 - 0.75) = 12.5px
    // target Y = 0.5 * 1000 = 500. Rendered Y = 500 + 12.5 = 512.5
    await renderFrame({
      project,
      timeSeconds: 1.4,
      ctx,
      canvasWidth: 1000,
      canvasHeight: 1000,
      getVideoFrame: () => null,
    });

    expect(ctx.translate).toHaveBeenCalledWith(500, 512.5);
    expect(ctx.fillText).toHaveBeenCalledWith("Animated Text", 0, 0);
    expect(ctx.globalAlpha).toBeCloseTo(0.75); // check eased opacity alpha
  });
});
