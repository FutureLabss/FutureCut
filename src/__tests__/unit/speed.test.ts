// ============================================================
// FutureCut — Speed Ramp Mapping Unit Tests (Enhanced)
// ============================================================
// Tests constant speeds, 2-point ramps, 3-point ramps,
// boundary conditions, getSpeedAtTime, and consistency
// between sourceTimeForTimelineTime and speedAdjustedClipDuration.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  sourceTimeForTimelineTime,
  speedAdjustedClipDuration,
  getSpeedAtTime,
} from "@/lib/utils/speed";
import type { Clip } from "@/lib/model/types";

function makeSpeedClip(
  inPoint: number,
  outPoint: number,
  points: { time: number; speed: number }[]
): Clip {
  return {
    id: "c1",
    sourceId: "asset-1",
    trackId: "track-1",
    startTime: 0,
    sourceInPoint: inPoint,
    sourceOutPoint: outPoint,
    speed: { points },
  } as Clip;
}

describe("Speed Mapping Calculator", () => {
  // ============================================================
  // Constant speed tests
  // ============================================================

  it("should map time linearly with no speed points (1x default)", () => {
    const clip: Clip = {
      id: "c1",
      sourceId: "asset-1",
      trackId: "track-1",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
    };

    expect(sourceTimeForTimelineTime(clip, 4.0)).toBe(4.0);
    expect(speedAdjustedClipDuration(clip)).toBe(10.0);
  });

  it("should calculate constant 2x speed (half duration)", () => {
    const clip = makeSpeedClip(0, 10, [{ time: 0, speed: 2.0 }]);

    expect(sourceTimeForTimelineTime(clip, 3.0)).toBe(6.0);
    expect(speedAdjustedClipDuration(clip)).toBe(5.0);
  });

  it("should calculate constant 0.5x speed (double duration)", () => {
    const clip = makeSpeedClip(0, 10, [{ time: 0, speed: 0.5 }]);

    expect(sourceTimeForTimelineTime(clip, 3.0)).toBe(1.5);
    expect(speedAdjustedClipDuration(clip)).toBe(20.0);
  });

  // ============================================================
  // 2-point ramp tests
  // ============================================================

  it("should compute 2-point linear speed ramp (1x → 2x)", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 1.0 },
      { time: 10, speed: 2.0 },
    ]);

    // ds = 1, dt = 10, k = 0.1
    // timeline duration = (10 / 1) * ln(2/1) = 10 * ln(2) ≈ 6.93147
    const duration = speedAdjustedClipDuration(clip);
    expect(duration).toBeCloseTo(6.93147, 4);

    // At timeline offset 3: t = 0 + (1/0.1) * (exp(3*0.1) - 1) = 10 * (e^0.3 - 1) ≈ 3.4986
    const sourceTime = sourceTimeForTimelineTime(clip, 3.0);
    expect(sourceTime).toBeCloseTo(3.4986, 3);
  });

  it("should compute 2-point linear speed ramp (2x → 1x, deceleration)", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 2.0 },
      { time: 10, speed: 1.0 },
    ]);

    // ds = -1, dt = 10, k = -0.1
    // timeline duration = (10 / -1) * ln(1/2) = -10 * (-0.693147) = 6.93147
    const duration = speedAdjustedClipDuration(clip);
    expect(duration).toBeCloseTo(6.93147, 4);
  });

  // ============================================================
  // 3-point ramp tests
  // ============================================================

  it("should compute 3-point speed ramp (1x → 2x → 0.5x)", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 1.0 },
      { time: 5, speed: 2.0 },
      { time: 10, speed: 0.5 },
    ]);

    // Segment 1 [0,5]: ds=1, dt=5, k=0.2
    //   duration = (5/1) * ln(2/1) = 5 * ln(2) ≈ 3.46574
    // Segment 2 [5,10]: ds=-1.5, dt=5, k=-0.3
    //   duration = (5/-1.5) * ln(0.5/2) = (-10/3) * ln(0.25) = (-10/3) * (-1.38629) ≈ 4.62098
    // Total ≈ 8.08672
    const duration = speedAdjustedClipDuration(clip);
    expect(duration).toBeCloseTo(3.46574 + 4.62098, 3);
  });

  // ============================================================
  // Boundary conditions
  // ============================================================

  it("should return sourceInPoint at timelineRelativeTime = 0", () => {
    const clip = makeSpeedClip(3, 13, [
      { time: 3, speed: 1.0 },
      { time: 13, speed: 2.0 },
    ]);

    expect(sourceTimeForTimelineTime(clip, 0)).toBe(3);
  });

  it("should extrapolate beyond the last ramp point", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 1.0 },
      { time: 5, speed: 2.0 },
    ]);

    // Segment [0,5]: ds=1, dt=5, k=0.2
    // duration = (5/1) * ln(2/1) ≈ 3.46574
    // Beyond that, extrapolate at speed 2.0
    // At timeline 5.0 (1.53426 beyond segment 1):
    // source = 5 + 1.53426 * 2.0 = 8.06852
    const sourceTime = sourceTimeForTimelineTime(clip, 5.0);
    expect(sourceTime).toBeCloseTo(8.069, 2);
  });

  // ============================================================
  // getSpeedAtTime tests
  // ============================================================

  it("should return 1.0 when no speed points exist", () => {
    const clip: Clip = {
      id: "c1",
      sourceId: "a",
      trackId: "t",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
    };
    expect(getSpeedAtTime(clip, 5)).toBe(1.0);
  });

  it("should return constant speed for single point", () => {
    const clip = makeSpeedClip(0, 10, [{ time: 0, speed: 3.0 }]);
    expect(getSpeedAtTime(clip, 5)).toBe(3.0);
  });

  it("should interpolate speed between two points", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 1.0 },
      { time: 10, speed: 2.0 },
    ]);

    // At source time 5: progress = 0.5, speed = 1.0 + 0.5 * 1.0 = 1.5
    expect(getSpeedAtTime(clip, 5)).toBeCloseTo(1.5);
  });

  it("should clamp to first/last point speed outside range", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 2, speed: 1.0 },
      { time: 8, speed: 2.0 },
    ]);

    expect(getSpeedAtTime(clip, 0)).toBe(1.0); // Before first point
    expect(getSpeedAtTime(clip, 10)).toBe(2.0); // After last point
  });

  // ============================================================
  // Consistency: sourceTimeForTimelineTime ↔ speedAdjustedClipDuration
  // ============================================================

  it("should be consistent: sourceTime at full duration equals sourceOutPoint", () => {
    const clip = makeSpeedClip(0, 10, [
      { time: 0, speed: 1.0 },
      { time: 10, speed: 2.0 },
    ]);

    const duration = speedAdjustedClipDuration(clip);
    const sourceAtEnd = sourceTimeForTimelineTime(clip, duration);

    // At the full timeline duration, source time should reach sourceOutPoint
    expect(sourceAtEnd).toBeCloseTo(10.0, 2);
  });

  it("should be consistent for constant speed", () => {
    const clip = makeSpeedClip(0, 8, [{ time: 0, speed: 2.0 }]);

    const duration = speedAdjustedClipDuration(clip); // 4.0
    const sourceAtEnd = sourceTimeForTimelineTime(clip, duration);

    expect(duration).toBe(4.0);
    expect(sourceAtEnd).toBe(8.0);
  });
});
