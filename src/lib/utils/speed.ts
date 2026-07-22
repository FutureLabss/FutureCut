// ============================================================
// FutureCut — Speed Ramp Mapping Calculator
// ============================================================
// Calculates the mapping from timeline relative time to
// source clip playback time, supporting constant speeds
// and multi-point linear speed ramps.
// ============================================================

import type { Clip } from "../model/types";

/**
 * Calculates the source time (in seconds, relative to source asset start)
 * for a given timeline-relative elapsed time (in seconds, relative to clip start).
 */
export function sourceTimeForTimelineTime(
  clip: Clip,
  timelineRelativeTime: number
): number {
  const points = clip.speed?.points;

  // 1. Default constant speed 1.0x if no curve points exist
  if (!points || points.length === 0) {
    return clip.sourceInPoint + timelineRelativeTime;
  }

  // Sort speed ramp points by source time
  const sorted = [...points].sort((a, b) => a.time - b.time);

  // 2. Simple constant speed if only 1 point is defined
  if (sorted.length === 1) {
    return clip.sourceInPoint + timelineRelativeTime * sorted[0].speed;
  }

  // 3. Multi-point speed ramping interpolation
  let currentTimelineTime = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const pt1 = sorted[i];
    const pt2 = sorted[i + 1];

    const t1 = pt1.time;
    const t2 = pt2.time;
    const s1 = pt1.speed;
    const s2 = pt2.speed;

    const dt = t2 - t1;
    const ds = s2 - s1;

    // Calculate the timeline duration for this speed interval
    let intervalTimelineDuration = 0;
    if (Math.abs(ds) < 0.001) {
      intervalTimelineDuration = dt / s1;
    } else {
      intervalTimelineDuration = (dt / ds) * Math.log(s2 / s1);
    }

    // Check if the requested timeline time falls within this interval
    if (timelineRelativeTime <= currentTimelineTime + intervalTimelineDuration) {
      const xRem = timelineRelativeTime - currentTimelineTime;
      if (Math.abs(ds) < 0.001) {
        return t1 + xRem * s1;
      } else {
        const k = ds / dt;
        return t1 + (s1 / k) * (Math.exp(xRem * k) - 1);
      }
    }

    currentTimelineTime += intervalTimelineDuration;
  }

  // 4. Extrapolate beyond the last ramp point using the last speed
  const lastPoint = sorted[sorted.length - 1];
  const excessTimelineTime = timelineRelativeTime - currentTimelineTime;
  return lastPoint.time + excessTimelineTime * lastPoint.speed;
}

/**
 * Calculates the total visual timeline duration for a clip,
 * integrating the speed curve from sourceInPoint to sourceOutPoint.
 */
export function speedAdjustedClipDuration(clip: Clip): number {
  const points = clip.speed?.points;

  if (!points || points.length === 0) {
    return clip.sourceOutPoint - clip.sourceInPoint;
  }

  const sorted = [...points].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) {
    return (clip.sourceOutPoint - clip.sourceInPoint) / sorted[0].speed;
  }

  // Integrate segments within the clip's in/out range
  const inPoint = clip.sourceInPoint;
  const outPoint = clip.sourceOutPoint;

  let totalTimelineDuration = 0;

  // Gather boundary edges
  const segmentEdges = [inPoint, outPoint];
  for (const pt of sorted) {
    if (pt.time > inPoint && pt.time < outPoint) {
      segmentEdges.push(pt.time);
    }
  }
  segmentEdges.sort((a, b) => a - b);

  // Helper to interpolate speed at any source time
  const getSpeedAt = (t: number): number => {
    if (t <= sorted[0].time) return sorted[0].speed;
    if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].speed;

    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].time && t <= sorted[i + 1].time) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const progress = (t - p1.time) / (p2.time - p1.time);
        return p1.speed + progress * (p2.speed - p1.speed);
      }
    }
    return 1.0;
  };

  for (let i = 0; i < segmentEdges.length - 1; i++) {
    const t1 = segmentEdges[i];
    const t2 = segmentEdges[i + 1];
    const s1 = getSpeedAt(t1);
    const s2 = getSpeedAt(t2);

    const dt = t2 - t1;
    const ds = s2 - s1;

    if (Math.abs(ds) < 0.001) {
      totalTimelineDuration += dt / s1;
    } else {
      totalTimelineDuration += (dt / ds) * Math.log(s2 / s1);
    }
  }

  return totalTimelineDuration;
}

/**
 * Helper to interpolate speed multiplier at any clip source time.
 */
export function getSpeedAtTime(clip: Clip, sourceTime: number): number {
  const points = clip.speed?.points;
  if (!points || points.length === 0) return 1.0;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) return sorted[0].speed;
  if (sourceTime <= sorted[0].time) return sorted[0].speed;
  if (sourceTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].speed;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sourceTime >= sorted[i].time && sourceTime <= sorted[i + 1].time) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      const progress = (sourceTime - p1.time) / (p2.time - p1.time);
      return p1.speed + progress * (p2.speed - p1.speed);
    }
  }
  return 1.0;
}
