// ============================================================
// FutureCut — GPU Compositor Unit Tests
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { GpuCompositor } from "@/lib/preview/gpuCompositor";

describe("GpuCompositor", () => {
  function createMockCanvas() {
    const ctx2D = {
      fillStyle: "",
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      filter: "",
      globalAlpha: 1.0,
    };

    return {
      width: 1280,
      height: 720,
      getContext: vi.fn().mockImplementation((type: string) => {
        if (type === "webgl" || type === "experimental-webgl") return null;
        if (type === "2d") return ctx2D;
        return null;
      }),
      addEventListener: vi.fn(),
    } as unknown as OffscreenCanvas;
  }

  it("should initialize 2D fallback when WebGL is unavailable in test env", () => {
    const mockCanvas = createMockCanvas();
    const compositor = new GpuCompositor(mockCanvas);
    expect(compositor.isFallback).toBe(true);
  });

  it("should render layer stack on 2D fallback canvas without throwing", () => {
    const mockCanvas = createMockCanvas();
    const compositor = new GpuCompositor(mockCanvas);

    const mockBitmap = {
      width: 640,
      height: 360,
      close: vi.fn(),
    } as unknown as ImageBitmap;

    expect(() => {
      compositor.render(
        [
          {
            trackId: "track-1",
            clipId: "clip-1",
            bitmap: mockBitmap,
            opacity: 1.0,
            posX: 0,
            posY: 0,
            scale: 1.0,
            rotation: 0,
            filters: [{ type: "brightness", value: 0.2 }],
          },
        ],
        1280,
        720
      );
    }).not.toThrow();
  });
});
