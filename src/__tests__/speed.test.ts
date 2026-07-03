// ============================================================
// FutureCut — Speed Ramp Mapping Unit Tests
// ============================================================

import { describe, it, expect } from "vitest";
import {
  sourceTimeForTimelineTime,
  speedAdjustedClipDuration,
} from "@/lib/utils/speed";
import type { Clip } from "@/lib/model/types";

describe("Speed Mapping Calculator", () => {
  it("should map time linearly with constant 1x speed", () => {
    const clip = {
      id: "c1",
      sourceId: "asset-1",
      trackId: "track-1",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
    } as Clip;

    expect(sourceTimeForTimelineTime(clip, 4.0)).toBe(4.0);
    expect(speedAdjustedClipDuration(clip)).toBe(10.0);
  });

  it("should calculate speed-adjusted durations for constant 2x and 0.5x speed", () => {
    const clip = {
      id: "c1",
      sourceInPoint: 0,
      sourceOutPoint: 10,
      speed: {
        points: [{ time: 0, speed: 2.0 }],
      },
    } as Clip;

    expect(sourceTimeForTimelineTime(clip, 3.0)).toBe(6.0);
    expect(speedAdjustedClipDuration(clip)).toBe(5.0);

    const slowClip = {
      ...clip,
      speed: {
        points: [{ time: 0, speed: 0.5 }],
      },
    } as Clip;

    expect(sourceTimeForTimelineTime(slowClip, 3.0)).toBe(1.5);
    expect(speedAdjustedClipDuration(slowClip)).toBe(20.0);
  });

  it("should compute exact points on linear speed ramping curves", () => {
    const clip = {
      id: "c1",
      sourceInPoint: 0,
      sourceOutPoint: 10,
      speed: {
        points: [
          { time: 0, speed: 1.0 },
          { time: 10, speed: 2.0 },
        ],
      },
    } as Clip;

    // ds = 2 - 1 = 1, dt = 10 - 0 = 10, k = 0.1
    // timeline duration = (10 / 1) * ln(2 / 1) = 10 * 0.693147 = 6.93147 seconds
    const duration = speedAdjustedClipDuration(clip);
    expect(duration).toBeCloseTo(6.93147, 5);

    // timeline offset x = 3 seconds
    // t = 0 + (1 / 0.1) * (exp(3 * 0.1) - 1) = 10 * (exp(0.3) - 1) = 10 * (1.3498588 - 1) = 3.498588 seconds
    const sourceTime = sourceTimeForTimelineTime(clip, 3.0);
    expect(sourceTime).toBeCloseTo(3.498588, 5);
  });
});
