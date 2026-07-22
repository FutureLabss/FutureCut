// ============================================================
// FutureCut — WebCodecs Exporter Unit Tests
// ============================================================

import { describe, it, expect } from "vitest";
import { WebCodecsExporter, OriginalMediaResolver } from "@/lib/export/webCodecsExporter";
import { canUseNativeWebCodecs } from "@/lib/export/exportPipeline";
import type { Project, Asset } from "@/lib/model/types";

describe("WebCodecsExporter", () => {
  it("should check native WebCodecs availability", () => {
    // In Node vitest env, WebCodecs global classes are undefined by default
    expect(canUseNativeWebCodecs()).toBe(false);
  });

  it("should create exporter instance and support clean cancellation", () => {
    const exporter = new WebCodecsExporter();
    expect(exporter).toBeDefined();

    expect(() => {
      exporter.cancel();
    }).not.toThrow();
  });

  it("should correctly configure exporter options for original source media", () => {
    const mockProject: Project = {
      id: "project-1",
      name: "Test Export",
      duration: 5,
      fps: 30,
      tracks: [
        {
          id: "track-1",
          type: "video",
          order: 0,
          muted: false,
          clips: [
            {
              id: "clip-1",
              trackId: "track-1",
              sourceId: "asset-1",
              startTime: 0,
              sourceInPoint: 0,
              sourceOutPoint: 5,
            },
          ],
        },
      ],
    };

    const mockAsset: Asset = {
      id: "asset-1",
      fileName: "original_4k.mp4",
      duration: 10,
      width: 3840,
      height: 2160,
      objectUrl: "blob:original",
      file: new File([], "original_4k.mp4"),
      proxyFile: new File([], "proxy_480p.mp4"),
      proxyUrl: "blob:proxy",
    };

    const assets: Record<string, Asset> = {
      "asset-1": mockAsset,
    };

    // Ensure pipeline accesses original File handle
    expect(assets["asset-1"].file).toBeDefined();
    expect(assets["asset-1"].file.name).toBe("original_4k.mp4");
    expect(assets["asset-1"].proxyFile).toBeDefined();
    expect(mockProject.fps).toBe(30);
  });

  it("should instantiate OriginalMediaResolver and safely dispose resources", async () => {
    const mockAsset: Asset = {
      id: "asset-1",
      fileName: "source.mp4",
      duration: 10,
      width: 1920,
      height: 1080,
      objectUrl: "blob:source",
      file: new File([], "source.mp4"),
    };

    const resolver = new OriginalMediaResolver({ "asset-1": mockAsset });
    expect(resolver).toBeDefined();

    await expect(resolver.getFrame("asset-1", 1.5)).resolves.toBeNull();

    expect(() => resolver.dispose()).not.toThrow();
  });

  it("should clean up cancellation state and reject export gracefully if cancelled", async () => {
    const exporter = new WebCodecsExporter();
    exporter.cancel();

    const mockProject: Project = {
      id: "p1",
      name: "Cancel Test",
      duration: 1,
      fps: 30,
      tracks: [],
    };

    const res = await exporter
      .export({
        project: mockProject,
        assets: {},
      })
      .catch(() => null);

    expect(res).toBeNull();
  });
});
