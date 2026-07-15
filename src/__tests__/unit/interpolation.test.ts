// ============================================================
// FutureCut — Keyframe Interpolation Unit Tests (Enhanced)
// ============================================================
// Tests all 4 easing types, multi-segment keyframe chains,
// exact-on-keyframe boundaries, and edge cases.
// ============================================================

import { describe, it, expect } from "vitest";
import { interpolateKeyframes } from "@/lib/utils/interpolation";
import type { Keyframe } from "@/lib/model/types";

describe("Keyframe Interpolation Resolver", () => {
  it("should return default value if track contains no keyframes", () => {
    expect(interpolateKeyframes(undefined, 2.0, 50.0)).toBe(50.0);
    expect(interpolateKeyframes([], 2.0, 50.0)).toBe(50.0);
  });

  it("should clamp values at boundaries before first or after last keyframe", () => {
    const track: Keyframe[] = [
      { time: 1.0, value: 10.0, easing: "linear" },
      { time: 5.0, value: 50.0, easing: "linear" },
    ];

    expect(interpolateKeyframes(track, 0.5, 0.0)).toBe(10.0);
    expect(interpolateKeyframes(track, 6.0, 0.0)).toBe(50.0);
  });

  it("should calculate correct linear interpolation at intermediate points", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "linear" },
      { time: 10.0, value: 100.0, easing: "linear" },
    ];

    expect(interpolateKeyframes(track, 5.0, 0.0)).toBe(50.0);
    expect(interpolateKeyframes(track, 2.5, 0.0)).toBe(25.0);
  });

  it("should resolve ease-in easing (quadratic acceleration)", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "easeIn" },
      { time: 2.0, value: 100.0, easing: "linear" },
    ];
    // progress t = 1.0 / 2.0 = 0.5
    // eased t = 0.5^2 = 0.25
    // value = 0 + 0.25 * 100 = 25.0
    expect(interpolateKeyframes(track, 1.0, 0.0)).toBeCloseTo(25.0);
  });

  it("should resolve ease-out easing (quadratic deceleration)", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "easeOut" },
      { time: 2.0, value: 100.0, easing: "linear" },
    ];
    // progress t = 0.5
    // eased t = 0.5 * (2 - 0.5) = 0.75
    // value = 75.0
    expect(interpolateKeyframes(track, 1.0, 0.0)).toBeCloseTo(75.0);
  });

  it("should resolve ease-in-out easing (quadratic ease both ends)", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "easeInOut" },
      { time: 4.0, value: 100.0, easing: "linear" },
    ];

    // At t=1.0: progress = 0.25, first half: 2 * 0.25^2 = 0.125
    // value = 0.125 * 100 = 12.5
    expect(interpolateKeyframes(track, 1.0, 0.0)).toBeCloseTo(12.5);

    // At t=2.0: progress = 0.5 (midpoint), eased = 2 * 0.25 = 0.5
    // value = 50.0
    expect(interpolateKeyframes(track, 2.0, 0.0)).toBeCloseTo(50.0);

    // At t=3.0: progress = 0.75, second half: -1 + (4 - 1.5) * 0.75 = -1 + 1.875 = 0.875
    // value = 87.5
    expect(interpolateKeyframes(track, 3.0, 0.0)).toBeCloseTo(87.5);
  });

  it("should return exact keyframe value when time is exactly on a keyframe", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 10.0, easing: "easeIn" },
      { time: 2.0, value: 50.0, easing: "easeOut" },
      { time: 4.0, value: 90.0, easing: "linear" },
    ];

    // At exactly t=0: first keyframe value
    expect(interpolateKeyframes(track, 0.0, 0.0)).toBe(10.0);
    // At exactly t=2: boundary — progress is 1.0 in first segment, so value = k2.value
    // Actually, at t=2.0: in [0, 2] segment, progress = 1.0, eased(1.0) = 1.0 for any easing
    // value = 10 + 1.0 * (50 - 10) = 50.0
    expect(interpolateKeyframes(track, 2.0, 0.0)).toBeCloseTo(50.0);
    // At exactly t=4: last keyframe value
    expect(interpolateKeyframes(track, 4.0, 0.0)).toBe(90.0);
  });

  it("should handle multi-segment keyframe chain correctly", () => {
    const track: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "linear" },
      { time: 2.0, value: 100.0, easing: "linear" },
      { time: 4.0, value: 50.0, easing: "linear" },
      { time: 6.0, value: 200.0, easing: "linear" },
    ];

    // Segment 1 [0, 2]: linear 0→100
    expect(interpolateKeyframes(track, 1.0, 0.0)).toBeCloseTo(50.0);

    // Segment 2 [2, 4]: linear 100→50
    expect(interpolateKeyframes(track, 3.0, 0.0)).toBeCloseTo(75.0);

    // Segment 3 [4, 6]: linear 50→200
    expect(interpolateKeyframes(track, 5.0, 0.0)).toBeCloseTo(125.0);
  });

  it("should handle a single keyframe (constant value)", () => {
    const track: Keyframe[] = [
      { time: 3.0, value: 42.0, easing: "linear" },
    ];

    // Before the keyframe
    expect(interpolateKeyframes(track, 0.0, 0.0)).toBe(42.0);
    // At the keyframe
    expect(interpolateKeyframes(track, 3.0, 0.0)).toBe(42.0);
    // After the keyframe
    expect(interpolateKeyframes(track, 10.0, 0.0)).toBe(42.0);
  });

  it("should handle unsorted keyframes by sorting internally", () => {
    const track: Keyframe[] = [
      { time: 4.0, value: 80.0, easing: "linear" },
      { time: 0.0, value: 0.0, easing: "linear" },
      { time: 2.0, value: 40.0, easing: "linear" },
    ];

    // After sorting: [0→0, 2→40, 4→80], linear
    expect(interpolateKeyframes(track, 1.0, 0.0)).toBeCloseTo(20.0);
    expect(interpolateKeyframes(track, 3.0, 0.0)).toBeCloseTo(60.0);
  });
});
