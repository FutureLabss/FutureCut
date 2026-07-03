// ============================================================
// FutureCut — Keyframe Interpolation Resolver
// ============================================================
// Pure utility for interpolating property values between
// timeline keyframes, supporting linear and ease-in/out curves.
// ============================================================

import type { Keyframe } from "../model/types";

/**
 * Interpolates the value of a keyframe track at a given clip-relative time.
 */
export function interpolateKeyframes(
  keyframes: Keyframe[] | undefined,
  timeSeconds: number,
  defaultValue: number
): number {
  if (!keyframes || keyframes.length === 0) {
    return defaultValue;
  }

  // Ensure keyframes are sorted by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Time is before the first keyframe
  if (timeSeconds <= sorted[0].time) {
    return sorted[0].value;
  }

  // Time is after the last keyframe
  if (timeSeconds >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Find enclosing keyframe interval
  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];

    if (timeSeconds >= k1.time && timeSeconds <= k2.time) {
      const progress = (timeSeconds - k1.time) / (k2.time - k1.time);
      const easedProgress = applyEasing(progress, k1.easing);

      return k1.value + easedProgress * (k2.value - k1.value);
    }
  }

  return defaultValue;
}

/**
 * Core easing mapping functions.
 */
function applyEasing(
  t: number,
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut"
): number {
  switch (easing) {
    case "easeIn":
      return t * t; // Quad ease-in
    case "easeOut":
      return t * (2 - t); // Quad ease-out
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // Quad ease-in-out
    case "linear":
    default:
      return t;
  }
}
