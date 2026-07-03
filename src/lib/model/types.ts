// ============================================================
// FutureCut — Core Data Model Types
// ============================================================
// These types are the single source of truth for the editor.
// The timeline data model, preview renderer, and export pipeline
// all communicate exclusively through these types.
// ============================================================

/**
 * A media file that has been imported into the project.
 * Assets are immutable once created — they represent the source material.
 */
export interface Asset {
  id: string;
  fileName: string;
  /** Total duration of the source file in seconds */
  duration: number;
  /** Native width in pixels */
  width: number;
  /** Native height in pixels */
  height: number;
  /** Browser object URL for playback / preview */
  objectUrl: string;
  /** Original File reference — retained for export pipeline */
  file: File;
  /** Codec string extracted during demux (e.g. 'avc1.42E01E') */
  codec?: string;
  /** Server-side storage URL */
  serverUrl?: string;
}

export type TrackType = "video" | "audio" | "text";

export interface Transition {
  type: "crossfade" | "fadeToBlack" | "wipe";
  duration: number; // in seconds
}

export interface Filter {
  type: "brightness" | "contrast" | "saturation" | "lut";
  value: number; // For adjustments: e.g. -1 to 1 or multiplier range
  lutId?: string; // Preset LUT identifier (e.g. "warm", "cool", etc.)
}

export interface SpeedPoint {
  time: number;  // source time offset within clip (seconds)
  speed: number; // multiplier (0.25x - 4x)
}

export interface SpeedCurve {
  points: SpeedPoint[];
}

export interface Keyframe {
  time: number; // clip-relative time offset (seconds)
  value: number;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface KeyframeTrack {
  property: "position.x" | "position.y" | "scale" | "rotation" | "opacity";
  keyframes: Keyframe[];
}

/**
 * A segment of a source asset placed on the timeline.
 * Multiple clips can reference the same asset (e.g. after a split).
 */
export interface Clip {
  id: string;
  /** References Asset.id. For text clips, this is empty or a dummy "text" value. */
  sourceId: string;
  /** References Track.id */
  trackId: string;
  /** Position on the timeline in seconds */
  startTime: number;
  /** Trim in-point within the source file in seconds */
  sourceInPoint: number;
  /** Trim out-point within the source file in seconds */
  sourceOutPoint: number;

  // Transition properties (Phase 2)
  transitionIn?: Transition;
  transitionOut?: Transition;

  // Text clip properties (Phase 2)
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  position?: { x: number; y: number }; // normalized 0-1 relative to frame
  animation?: "fadeIn" | "slideIn" | "none";

  // Phase 3 Creative Tools Extensions
  filters?: Filter[];
  speed?: SpeedCurve;
  keyframedProps?: KeyframeTrack[];
}

/**
 * A single track on the timeline.
 * Phase 2: stacked horizontal tracks (video, audio, text).
 */
export interface Track {
  id: string;
  type: TrackType;
  /** Vertical stacking order: higher order = rendered on top for video/text */
  order: number;
  /** Clips ordered by startTime. Maintained sorted by operations. */
  clips: Clip[];
  /** Audio mute status */
  muted?: boolean;
  /** Audio track volume 0-1 */
  volume?: number;
}

/**
 * The root data structure for the entire editor session.
 */
export interface Project {
  id: string;
  name: string;
  /** Frames per second — detected from the first imported asset */
  fps: number;
  /** Total duration in seconds — derived from tracks, not set directly */
  duration: number;
  tracks: Track[];
}

// ============================================================
// Helper functions
// ============================================================

/** Calculate the visible duration of a clip on the timeline */
export function clipDuration(clip: Clip): number {
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

/** Get the end time of a clip on the timeline */
export function clipEndTime(clip: Clip): number {
  return clip.startTime + clipDuration(clip);
}

/** Find a clip by ID across all tracks */
export function findClip(
  tracks: Track[],
  clipId: string
): { clip: Clip; track: Track; index: number } | null {
  for (const track of tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index !== -1) {
      return { clip: track.clips[index], track, index };
    }
  }
  return null;
}

/** Derive total project duration from all tracks */
export function deriveProjectDuration(tracks: Track[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clipEndTime(clip);
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}
