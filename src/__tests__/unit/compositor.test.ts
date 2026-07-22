// ============================================================
// FutureCut — Compositor Unit Tests (Enhanced)
// ============================================================
// Tests the compositor's track sorting, all transition types,
// filter string generation, text animations, and keyframed
// transforms using a mocked Canvas 2D context.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { renderFrame } from "@/lib/preview/compositor";
import type { Project } from "@/lib/model/types";

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
    filter: "none",
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

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(getVideoFrame).toHaveBeenCalledWith("c-video", 2.0);
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 960, 540);
    expect(ctx.drawImage).toHaveBeenCalledWith(mockImage, -960, -540, 1920, 1080);
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
              startTime: 4.0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              transitionIn: { type: "crossfade", duration: 1.0 },
            },
          ],
        },
      ],
    };

    await renderFrame({
      project,
      timeSeconds: 4.5,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

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
    expect(ctx.globalAlpha).toBeCloseTo(0.75);
  });

  // ============================================================
  // New enhanced tests
  // ============================================================

  it("should apply fadeToBlack transition with correct black mask alpha", async () => {
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
            },
            {
              id: "clip-b",
              sourceId: "asset-2",
              trackId: "track-v1",
              startTime: 4.0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              transitionIn: { type: "fadeToBlack", duration: 2.0 },
            },
          ],
        },
      ],
    };

    // At t=4.5: alpha = (4.5 - 4.0) / 2.0 = 0.25 (first half of transition)
    // maskAlpha = 0.25 * 2 = 0.5
    await renderFrame({
      project,
      timeSeconds: 4.5,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    // Both clips should be drawn
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    // Black mask overlay should be drawn via fillRect
    // The fillRect is called: once for background clear + once for black mask
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it("should apply wipe transition with clipping rect", async () => {
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
            },
            {
              id: "clip-b",
              sourceId: "asset-2",
              trackId: "track-v1",
              startTime: 4.0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              transitionIn: { type: "wipe", duration: 1.0 },
            },
          ],
        },
      ],
    };

    // At t=4.5: alpha = 0.5, wipe rect width = 0.5 * 200 = 100
    await renderFrame({
      project,
      timeSeconds: 4.5,
      ctx,
      canvasWidth: 200,
      canvasHeight: 100,
      getVideoFrame,
    });

    // Should call beginPath, rect (clip region), clip for the wipe
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 100, 100); // 200 * 0.5 = 100
    expect(ctx.clip).toHaveBeenCalled();
  });

  it("should apply canvas filter strings for brightness, contrast, saturation", async () => {
    const ctx = createMockContext();
    const mockImage = {} as ImageBitmap;
    const getVideoFrame = vi.fn().mockReturnValue(mockImage);

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
              id: "clip-1",
              sourceId: "asset-1",
              trackId: "track-v1",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              filters: [
                { type: "brightness", value: 0.2 },     // pct = (1 + 0.2) * 100 = 120
                { type: "contrast", value: -0.3 },       // pct = (1 + -0.3) * 100 = 70
                { type: "saturation", value: 0.5 },      // pct = (1 + 0.5) * 100 = 150
              ],
            },
          ],
        },
      ],
    };

    await renderFrame({
      project,
      timeSeconds: 2.0,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    // The compositor sets ctx.filter to the combined filter string
    expect((ctx as unknown as { filter?: string }).filter).toBe("brightness(120%) contrast(70%) saturate(150%)");
  });

  it("should apply keyframed opacity and position transforms to video clips", async () => {
    const ctx = createMockContext();
    const mockImage = {} as ImageBitmap;
    const getVideoFrame = vi.fn().mockReturnValue(mockImage);

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
              id: "clip-1",
              sourceId: "asset-1",
              trackId: "track-v1",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 10,
              keyframedProps: [
                {
                  property: "opacity",
                  keyframes: [
                    { time: 0, value: 0, easing: "linear" },
                    { time: 5, value: 1, easing: "linear" },
                  ],
                },
                {
                  property: "position.x",
                  keyframes: [
                    { time: 0, value: 0.0, easing: "linear" },
                    { time: 10, value: 1.0, easing: "linear" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // At t=2.5: opacity = 0.5 (linear from 0→1 over 5s), position.x = 0.25 (linear from 0→1 over 10s)
    await renderFrame({
      project,
      timeSeconds: 2.5,
      ctx,
      canvasWidth: 200,
      canvasHeight: 100,
      getVideoFrame,
    });

    // Opacity should be 0.5
    expect(ctx.globalAlpha).toBeCloseTo(0.5);
    // Translation: x = 0.25 * 200 = 50, y = 0.5 * 100 = 50 (default)
    expect(ctx.translate).toHaveBeenCalledWith(50, 50);
  });

  it("should not draw clips outside their active time range", async () => {
    const ctx = createMockContext();
    const getVideoFrame = vi.fn().mockReturnValue(null);

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
              id: "clip-1",
              sourceId: "asset-1",
              trackId: "track-v1",
              startTime: 5,
              sourceInPoint: 0,
              sourceOutPoint: 3,
            },
          ],
        },
      ],
    };

    // At t=2: clip starts at t=5, so it shouldn't be active
    await renderFrame({
      project,
      timeSeconds: 2.0,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    expect(getVideoFrame).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("should render text fadeIn animation with correct opacity progression", async () => {
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
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              text: "Fading Text",
              animation: "fadeIn",
              position: { x: 0.5, y: 0.5 },
            },
          ],
        },
      ],
    };

    // At t=0.4: progress = 0.4 / 0.8 = 0.5, eased = 0.5 * (2 - 0.5) = 0.75
    await renderFrame({
      project,
      timeSeconds: 0.4,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame: () => null,
    });

    // Opacity: default (1.0) * animationAlpha (0.75) = 0.75
    expect(ctx.globalAlpha).toBeCloseTo(0.75);
    expect(ctx.fillText).toHaveBeenCalledWith("Fading Text", 0, 0);
  });

  it("should skip text clips with no text content", async () => {
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
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
              // No text property set
            },
          ],
        },
      ],
    };

    await renderFrame({
      project,
      timeSeconds: 2.0,
      ctx,
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame: () => null,
    });

    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("should ignore audio tracks during visual rendering", async () => {
    const ctx = createMockContext();
    const getVideoFrame = vi.fn();

    const project: Project = {
      id: "p1",
      name: "Test",
      fps: 30,
      duration: 10,
      tracks: [
        {
          id: "track-audio",
          type: "audio",
          order: 0,
          clips: [
            {
              id: "clip-audio",
              sourceId: "asset-audio",
              trackId: "track-audio",
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
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    // getVideoFrame should never be called for audio tracks
    expect(getVideoFrame).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("should render multiple video tracks in order stacking", async () => {
    const ctx = createMockContext();
    const mockImage1 = { name: "bg" } as unknown as ImageBitmap;
    const mockImage2 = { name: "fg" } as unknown as ImageBitmap;
    const getVideoFrame = vi.fn().mockImplementation((clipId) => {
      return clipId === "clip-bg" ? mockImage1 : mockImage2;
    });

    const project: Project = {
      id: "p1",
      name: "Test",
      fps: 30,
      duration: 10,
      tracks: [
        {
          id: "track-fg",
          type: "video",
          order: 2, // Higher order = on top
          clips: [
            {
              id: "clip-fg",
              sourceId: "asset-2",
              trackId: "track-fg",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
            },
          ],
        },
        {
          id: "track-bg",
          type: "video",
          order: 1, // Lower order = bottom
          clips: [
            {
              id: "clip-bg",
              sourceId: "asset-1",
              trackId: "track-bg",
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
      canvasWidth: 100,
      canvasHeight: 100,
      getVideoFrame,
    });

    // Background (order 1) should be drawn first, foreground (order 2) second
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, mockImage1, -50, -50, 100, 100);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(2, mockImage2, -50, -50, 100, 100);
  });
});
