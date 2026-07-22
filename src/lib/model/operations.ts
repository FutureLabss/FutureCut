// ============================================================
// FutureCut — Timeline Operations (Pure Functions)
// ============================================================
// Every timeline mutation goes through these functions.
// They are pure: given input state, they return new state.
// No side effects, no store access — easy to test.
// ============================================================

import { nanoid } from "nanoid";
import {
  type Track,
  type Clip,
  type TrackType,
  type Transition,
  type Filter,
  type Keyframe,
  clipDuration,
  clipEndTime,
} from "./types";

// ============================================================
// Track Management
// ============================================================

/** Create and add a new track */
export function addTrack(
  tracks: Track[],
  type: TrackType,
  _name?: string
): Track[] {
  const newOrder =
    tracks.length > 0 ? Math.max(...tracks.map((t) => t.order)) + 1 : 0;

  const newTrack: Track = {
    id: nanoid(),
    type,
    order: newOrder,
    clips: [],
    muted: type === "audio" ? false : undefined,
    volume: type === "audio" ? 1.0 : undefined,
  };

  return [...tracks, newTrack];
}

/** Remove a track */
export function removeTrack(tracks: Track[], trackId: string): Track[] {
  return tracks.filter((t) => t.id !== trackId);
}

/** Reorder track positions */
export function reorderTrack(
  tracks: Track[],
  trackId: string,
  newOrder: number
): Track[] {
  return tracks.map((track) => {
    if (track.id === trackId) {
      return { ...track, order: newOrder };
    }
    return track;
  });
}

/** Adjust track volume */
export function setTrackVolume(
  tracks: Track[],
  trackId: string,
  volume: number
): Track[] {
  return tracks.map((track) => {
    if (track.id === trackId && track.type === "audio") {
      return { ...track, volume: Math.max(0, Math.min(1, volume)) };
    }
    return track;
  });
}

/** Mute/unmute track */
export function setTrackMuted(
  tracks: Track[],
  trackId: string,
  muted: boolean
): Track[] {
  return tracks.map((track) => {
    if (track.id === trackId && track.type === "audio") {
      return { ...track, muted };
    }
    return track;
  });
}

// ============================================================
// Clip Management
// ============================================================

/**
 * Add a clip to the specified track, positioned at the end of existing clips,
 * or at a specific startTime if provided.
 */
export function addClipToTrack(
  tracks: Track[],
  trackId: string,
  sourceId: string,
  sourceInPoint: number,
  sourceOutPoint: number,
  startTime?: number,
  textProperties?: Partial<Clip> // for text clips
): Track[] {
  return tracks.map((track) => {
    if (track.id !== trackId) return track;

    // Calculate start time: end of last clip, or 0 if empty
    const resolvedStartTime =
      startTime !== undefined
        ? startTime
        : track.clips.length > 0
          ? clipEndTime(track.clips[track.clips.length - 1])
          : 0;

    const newClip: Clip = {
      id: nanoid(),
      sourceId,
      trackId: track.id,
      startTime: resolvedStartTime,
      sourceInPoint,
      sourceOutPoint,
      ...textProperties,
    };

    const newClips = [...track.clips, newClip];
    newClips.sort((a, b) => a.startTime - b.startTime);

    return {
      ...track,
      clips: newClips,
    };
  });
}

/**
 * Add a clip to the default tracks (Phase 1 legacy/fallback).
 * Both first video and audio tracks get a clip simultaneously.
 */
export function addClipToTracks(
  tracks: Track[],
  sourceId: string,
  sourceInPoint: number,
  sourceOutPoint: number
): Track[] {
  const firstVideo = tracks.find((t) => t.type === "video");
  const firstAudio = tracks.find((t) => t.type === "audio");

  return tracks.map((track) => {
    if (track.id !== firstVideo?.id && track.id !== firstAudio?.id) {
      return track;
    }

    const lastClip = track.clips[track.clips.length - 1];
    const startTime = lastClip ? clipEndTime(lastClip) : 0;

    const newClip: Clip = {
      id: nanoid(),
      sourceId,
      trackId: track.id,
      startTime,
      sourceInPoint,
      sourceOutPoint,
    };

    return {
      ...track,
      clips: [...track.clips, newClip],
    };
  });
}

/**
 * Trim the start of a clip by adjusting its sourceInPoint.
 * Supports overlapping for transitions by letting durationDelta change freely.
 */
export function trimClipStart(
  tracks: Track[],
  clipId: string,
  newInPoint: number,
  ripple: boolean = true
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const clip = track.clips[idx];
    const clamped = Math.max(0, Math.min(newInPoint, clip.sourceOutPoint - 0.01));
    const oldDuration = clipDuration(clip);
    const newDuration = clip.sourceOutPoint - clamped;
    const durationDelta = newDuration - oldDuration;

    const newClips = track.clips.map((c, i) => {
      if (i === idx) {
        return { ...c, sourceInPoint: clamped };
      }
      if (ripple && i > idx) {
        return { ...c, startTime: c.startTime + durationDelta };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Trim the end of a clip by adjusting its sourceOutPoint. */
export function trimClipEnd(
  tracks: Track[],
  clipId: string,
  newOutPoint: number,
  sourceDuration: number,
  ripple: boolean = true
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const clip = track.clips[idx];
    const clamped = Math.max(
      clip.sourceInPoint + 0.01,
      Math.min(newOutPoint, sourceDuration)
    );
    const oldDuration = clipDuration(clip);
    const newDuration = clamped - clip.sourceInPoint;
    const durationDelta = newDuration - oldDuration;

    const newClips = track.clips.map((c, i) => {
      if (i === idx) {
        return { ...c, sourceOutPoint: clamped };
      }
      if (ripple && i > idx) {
        return { ...c, startTime: c.startTime + durationDelta };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Split a clip into two at the given timeline time */
export function splitClip(
  tracks: Track[],
  clipId: string,
  splitTimeOnTimeline: number
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const clip = track.clips[idx];
    const sourceTime =
      clip.sourceInPoint + (splitTimeOnTimeline - clip.startTime);

    if (
      sourceTime <= clip.sourceInPoint + 0.01 ||
      sourceTime >= clip.sourceOutPoint - 0.01
    ) {
      return track;
    }

    const firstHalf: Clip = {
      ...clip,
      sourceOutPoint: sourceTime,
    };

    const secondHalf: Clip = {
      ...clip, // Copies text properties or custom settings if any
      id: nanoid(),
      startTime: splitTimeOnTimeline,
      sourceInPoint: sourceTime,
      sourceOutPoint: clip.sourceOutPoint,
      transitionIn: undefined, // Reset transition on split edges
      transitionOut: undefined,
    };

    const newClips = [...track.clips];
    newClips.splice(idx, 1, firstHalf, secondHalf);

    return { ...track, clips: newClips };
  });
}

/** Remove a clip and optional ripple-close */
export function deleteClip(
  tracks: Track[],
  clipId: string,
  ripple: boolean = true
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const clip = track.clips[idx];
    const duration = clipDuration(clip);

    const newClips = track.clips
      .filter((c) => c.id !== clipId)
      .map((c, i) => {
        if (ripple && i >= idx) {
          return { ...c, startTime: c.startTime - duration };
        }
        return c;
      });

    return { ...track, clips: newClips };
  });
}

/** Move a clip on the timeline, potentially reassigning its track */
export function moveClip(
  tracks: Track[],
  clipId: string,
  newStartTime: number,
  newTrackId?: string
): Track[] {
  // Find current track and clip
  let targetClip: Clip | null = null;
  for (const track of tracks) {
    const found = track.clips.find((c) => c.id === clipId);
    if (found) {
      targetClip = { ...found, startTime: Math.max(0, newStartTime) };
      break;
    }
  }

  if (!targetClip) return tracks;

  const activeTrackId = newTrackId ?? targetClip.trackId;
  targetClip.trackId = activeTrackId;

  return tracks.map((track) => {
    // If the clip is moving to this track
    if (track.id === activeTrackId) {
      const filtered = track.clips.filter((c) => c.id !== clipId);
      const newClips = [...filtered, targetClip!];
      newClips.sort((a, b) => a.startTime - b.startTime);
      return { ...track, clips: newClips };
    }

    // If the clip is leaving this track
    if (track.clips.some((c) => c.id === clipId)) {
      return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
    }

    return track;
  });
}

// ============================================================
// Transition Operations
// ============================================================

/** Set transitions on a clip */
export function setClipTransition(
  tracks: Track[],
  clipId: string,
  transition: Transition | undefined,
  direction: "in" | "out"
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        return {
          ...c,
          transitionIn: direction === "in" ? transition : c.transitionIn,
          transitionOut: direction === "out" ? transition : c.transitionOut,
        };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

// ============================================================
// Text Overlay Operations
// ============================================================

/** Update text overlay properties */
export function updateTextProperties(
  tracks: Track[],
  clipId: string,
  properties: Partial<Clip>
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        return { ...c, ...properties };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

// ============================================================
// Phase 3 Creative Tools Operations
// ============================================================

/** Add a filter to a clip's filter stack */
export function addFilterToClip(
  tracks: Track[],
  clipId: string,
  filter: Filter
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        const filters = c.filters ? [...c.filters, filter] : [filter];
        return { ...c, filters };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Remove a filter from a clip's filter stack */
export function removeFilterFromClip(
  tracks: Track[],
  clipId: string,
  filterIndex: number
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId && c.filters) {
        const filters = c.filters.filter((_, idx) => idx !== filterIndex);
        return { ...c, filters };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Update the value of a specific filter in a clip's stack */
export function updateClipFilter(
  tracks: Track[],
  clipId: string,
  filterIndex: number,
  value: number
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId && c.filters) {
        const filters = c.filters.map((f, i) =>
          i === filterIndex ? { ...f, value } : f
        );
        return { ...c, filters };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Reorder filters in the stack */
export function reorderClipFilters(
  tracks: Track[],
  clipId: string,
  sourceIndex: number,
  targetIndex: number
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId && c.filters) {
        const filters = [...c.filters];
        const [moved] = filters.splice(sourceIndex, 1);
        filters.splice(targetIndex, 0, moved);
        return { ...c, filters };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Set speed points for ramping or constant multiplier */
export function setClipSpeed(
  tracks: Track[],
  clipId: string,
  points: { time: number; speed: number }[]
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        return { ...c, speed: { points } };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Add or update a keyframe for a specific property on a clip */
export function setClipKeyframe(
  tracks: Track[],
  clipId: string,
  property: "position.x" | "position.y" | "scale" | "rotation" | "opacity",
  keyframe: Keyframe
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        const keyframedProps = c.keyframedProps ? [...c.keyframedProps] : [];
        const trackIndex = keyframedProps.findIndex((t) => t.property === property);

        if (trackIndex === -1) {
          keyframedProps.push({ property, keyframes: [keyframe] });
        } else {
          const keyframes = [...keyframedProps[trackIndex].keyframes];
          const kfIndex = keyframes.findIndex((k) => k.time === keyframe.time);

          if (kfIndex === -1) {
            keyframes.push(keyframe);
          } else {
            keyframes[kfIndex] = keyframe;
          }

          keyframes.sort((a, b) => a.time - b.time);
          keyframedProps[trackIndex] = { property, keyframes };
        }

        return { ...c, keyframedProps };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Remove a keyframe by index/time */
export function removeClipKeyframe(
  tracks: Track[],
  clipId: string,
  property: "position.x" | "position.y" | "scale" | "rotation" | "opacity",
  time: number
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId && c.keyframedProps) {
        const keyframedProps = c.keyframedProps.map((t) => {
          if (t.property === property) {
            return {
              ...t,
              keyframes: t.keyframes.filter((k) => k.time !== time),
            };
          }
          return t;
        });
        return { ...c, keyframedProps };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Apply auto-reframe crop keyframes to clip */
export function applyAutoReframe(
  tracks: Track[],
  clipId: string,
  targetAspectRatio: "9:16" | "1:1" | "4:5" | "16:9",
  cropKeyframes: { time: number; x: number; y: number; scale: number }[]
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        const xKeyframes = cropKeyframes.map((k) => ({
          time: k.time,
          value: k.x,
          easing: "linear" as const,
        }));
        const yKeyframes = cropKeyframes.map((k) => ({
          time: k.time,
          value: k.y,
          easing: "linear" as const,
        }));
        const scaleKeyframes = cropKeyframes.map((k) => ({
          time: k.time,
          value: k.scale,
          easing: "linear" as const,
        }));

        let keyframedProps = c.keyframedProps ? [...c.keyframedProps] : [];
        
        keyframedProps = keyframedProps.filter(
          (t) => t.property !== "position.x" && t.property !== "position.y" && t.property !== "scale"
        );

        keyframedProps.push({ property: "position.x", keyframes: xKeyframes });
        keyframedProps.push({ property: "position.y", keyframes: yKeyframes });
        keyframedProps.push({ property: "scale", keyframes: scaleKeyframes });

        return {
          ...c,
          keyframedProps,
        };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

/** Toggle noise reduction status on a clip */
export function setClipDenoised(
  tracks: Track[],
  clipId: string,
  isDenoised: boolean,
  denoisedSourceId?: string
): Track[] {
  return tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;

    const newClips = track.clips.map((c) => {
      if (c.id === clipId) {
        const originalSourceId = c.originalSourceId ?? c.sourceId;
        const resolvedDenoisedId = denoisedSourceId ?? c.denoisedSourceId;
        
        return {
          ...c,
          originalSourceId,
          denoisedSourceId: resolvedDenoisedId,
          isDenoised,
          sourceId: isDenoised && resolvedDenoisedId ? resolvedDenoisedId : originalSourceId,
        };
      }
      return c;
    });

    return { ...track, clips: newClips };
  });
}

