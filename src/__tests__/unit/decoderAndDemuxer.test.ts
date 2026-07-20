// ============================================================
// FutureCut — Decoder & Demuxer Unit Tests
// ============================================================
// Tests WebCodecs Decoder lifecycle (reset & re-configure),
// Demuxer keyframe calculation without extraction mutation,
// and FrameCache maximum distance thresholding.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { Decoder } from "@/lib/preview/decoder";
import { Demuxer } from "@/lib/preview/demuxer";
import { FrameCache } from "@/lib/preview/frameCache";

// Mock VideoDecoder for Node test environment
class MockVideoDecoder {
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  private outputCb: (frame: unknown) => void;
  private errorCb: (error: unknown) => void;

  constructor(init: { output: (frame: unknown) => void; error: (error: unknown) => void }) {
    this.outputCb = init.output;
    this.errorCb = init.error;
  }

  configure(_config: unknown) {
    this.state = "configured";
  }

  decode(_chunk: unknown) {
    if (this.state !== "configured") {
      throw new Error("Decoder not configured");
    }
  }

  reset() {
    this.state = "unconfigured";
  }

  close() {
    this.state = "closed";
  }

  static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
}

vi.stubGlobal("VideoDecoder", MockVideoDecoder);

describe("Decoder Lifecycle", () => {
  it("re-configures VideoDecoder upon reset() call", async () => {
    const onFrame = vi.fn();
    const decoder = new Decoder({ onFrame });

    await decoder.configure({
      codec: "avc1.42E01E",
      codedWidth: 1280,
      codedHeight: 720,
    });

    expect(decoder.isConfigured).toBe(true);

    // Call reset
    await decoder.reset();

    // Verify that after reset(), decoder remains in configured state due to re-configuration
    expect(decoder.isConfigured).toBe(true);

    const chunk = { type: "key", timestamp: 0, duration: 33000, data: new Uint8Array() } as unknown as EncodedVideoChunk;
    const accepted = decoder.decode(chunk);
    expect(accepted).toBe(true);
  });
});

describe("Demuxer Keyframe Calculation", () => {
  it("returns 0 when no video track is initialized", () => {
    const demuxer = new Demuxer();
    const keyframeTime = demuxer.getKeyframeTime(5.4);
    expect(keyframeTime).toBe(0);
  });

  it("calculates keyframe timestamp from track sample metadata", () => {
    const demuxer = new Demuxer();
    (demuxer as unknown as { videoTrackId: number }).videoTrackId = 1;

    // Mock mp4File track samples
    (demuxer as unknown as { mp4File: unknown }).mp4File = {
      getTrackById: () => ({
        mdia: { mdhd: { timescale: 1000 } },
        samples: [
          { cts: 0, is_sync: true },
          { cts: 1000, is_sync: false },
          { cts: 2000, is_sync: true },
          { cts: 3000, is_sync: false },
          { cts: 4000, is_sync: false },
          { cts: 5000, is_sync: false },
        ],
      }),
    };

    // For time 3.5s (cts 3500), closest preceding keyframe is at cts 2000 (2.0s)
    const keyframeTime = demuxer.getKeyframeTime(3.5);
    expect(keyframeTime).toBe(2.0);
  });
});

describe("FrameCache Distance Thresholds", () => {
  it("returns null if nearest frame exceeds maxDistanceUs", () => {
    const cache = new FrameCache(10);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    // Manually set internal cache entry via put or test nearest lookup
    (cache as unknown as { cache: Map<number, ImageBitmap> }).cache.set(0, mockBitmap);

    // Looking for frame at 10 seconds (10,000,000µs) with max distance of 2,000,000µs
    const result = cache.getNearest(10_000_000, 2_000_000);
    expect(result).toBeNull();
  });

  it("returns nearest frame if within maxDistanceUs", () => {
    const cache = new FrameCache(10);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    (cache as unknown as { cache: Map<number, ImageBitmap> }).cache.set(1_000_000, mockBitmap);

    const result = cache.getNearest(1_500_000, 1_000_000);
    expect(result).toBe(mockBitmap);
  });
});
