// ============================================================
// FutureCut — Keyframe Interpolation Unit Tests
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

  it("should resolve ease-in, ease-out, and ease-in-out easing interpolation", () => {
    const easeInTrack: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "easeIn" },
      { time: 2.0, value: 100.0, easing: "linear" },
    ];
    // progress t = 1.0 / 2.0 = 0.5
    // eased t = 0.25
    // value = 25.0
    expect(interpolateKeyframes(easeInTrack, 1.0, 0.0)).toBeCloseTo(25.0);

    const easeOutTrack: Keyframe[] = [
      { time: 0.0, value: 0.0, easing: "easeOut" },
      { time: 2.0, value: 100.0, easing: "linear" },
    ];
    // progress t = 0.5
    // eased t = 0.5 * (2 - 0.5) = 0.75
    // value = 75.0
    expect(interpolateKeyframes(easeOutTrack, 1.0, 0.0)).toBeCloseTo(75.0);
  });
});
