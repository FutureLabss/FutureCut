// ============================================================
// FutureCut — Proxy Generator Unit Tests
// ============================================================

import { describe, it, expect } from "vitest";
import { requiresProxy, generateProxy } from "@/lib/proxy/proxyGenerator";
import type { Asset } from "@/lib/model/types";

describe("Proxy Generator", () => {
  it("should determine whether an asset requires proxy generation", () => {
    const highResAsset: Asset = {
      id: "asset-1",
      fileName: "4k_sample.mp4",
      duration: 10,
      width: 3840,
      height: 2160,
      objectUrl: "blob:highres",
      file: new File([], "4k_sample.mp4"),
    };

    const lowResAsset: Asset = {
      id: "asset-2",
      fileName: "480p_sample.mp4",
      duration: 10,
      width: 640,
      height: 480,
      objectUrl: "blob:lowres",
      file: new File([], "480p_sample.mp4"),
    };

    expect(requiresProxy(highResAsset)).toBe(true);
    expect(requiresProxy(lowResAsset)).toBe(false);
  });

  it("should return original objectUrl for lightweight assets", async () => {
    const lowResAsset: Asset = {
      id: "asset-3",
      fileName: "sd_clip.mp4",
      duration: 5,
      width: 640,
      height: 360,
      objectUrl: "blob:sd_clip",
      file: new File([], "sd_clip.mp4"),
    };

    const res = await generateProxy(lowResAsset);
    expect(res.proxyUrl).toBe("blob:sd_clip");
    expect(res.width).toBe(640);
    expect(res.height).toBe(360);
  });

  it("should calculate proportional 480p dimensions for high-res assets", async () => {
    const highResAsset: Asset = {
      id: "asset-4",
      fileName: "1080p_clip.mp4",
      duration: 12,
      width: 1920,
      height: 1080,
      objectUrl: "blob:1080p",
      file: new File([], "1080p_clip.mp4"),
    };

    const res = await generateProxy(highResAsset);
    expect(res.height).toBe(480);
    expect(res.width).toBe(854);
    expect(res.proxyUrl).toBeTruthy();
  });
});
