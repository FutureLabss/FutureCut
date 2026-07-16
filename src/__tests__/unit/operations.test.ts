// ============================================================
// FutureCut — Operations Unit Tests (Enhanced)
// ============================================================
// Tests for ALL pure timeline operation functions across
// Phases 1–3: track management, clip CRUD, transitions,
// text overlays, filters, speed, and keyframes.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  addClipToTracks,
  addClipToTrack,
  trimClipStart,
  trimClipEnd,
  splitClip,
  deleteClip,
  addTrack,
  removeTrack,
  reorderTrack,
  moveClip,
  setTrackVolume,
  setTrackMuted,
  setClipTransition,
  updateTextProperties,
  addFilterToClip,
  removeFilterFromClip,
  updateClipFilter,
  reorderClipFilters,
  setClipSpeed,
  setClipKeyframe,
  removeClipKeyframe,
  applyAutoReframe,
  setClipDenoised,
} from "@/lib/model/operations";
import type { Track, Clip, Filter, Keyframe } from "@/lib/model/types";
import { clipDuration, clipEndTime, deriveProjectDuration } from "@/lib/model/types";

// ============================================================
// Test helpers
// ============================================================

function makeTrack(clips: Clip[] = [], type: "video" | "audio" | "text" = "video", order = 0, id?: string): Track {
  return { id: id ?? `track-${type}`, type, clips, order };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "clip-1",
    sourceId: "asset-1",
    trackId: "track-video",
    startTime: 0,
    sourceInPoint: 0,
    sourceOutPoint: 10,
    ...overrides,
  };
}

function makeTracks(videoClips: Clip[] = [], audioClips: Clip[] = []): Track[] {
  return [
    makeTrack(videoClips, "video", 0),
    makeTrack(audioClips, "audio", 1),
  ];
}

// ============================================================
// Tests: addClipToTracks
// ============================================================

describe("addClipToTracks", () => {
  it("should add a clip to an empty track", () => {
    const tracks = makeTracks();
    const result = addClipToTracks(tracks, "asset-1", 0, 10);

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].sourceId).toBe("asset-1");
    expect(result[0].clips[0].startTime).toBe(0);
    expect(result[0].clips[0].sourceInPoint).toBe(0);
    expect(result[0].clips[0].sourceOutPoint).toBe(10);
  });

  it("should add clip after existing clips", () => {
    const existingClip = makeClip({ startTime: 0, sourceOutPoint: 5 });
    const tracks = makeTracks([existingClip]);
    const result = addClipToTracks(tracks, "asset-2", 0, 8);

    expect(result[0].clips).toHaveLength(2);
    expect(result[0].clips[1].startTime).toBe(5); // After first clip ends
    expect(result[0].clips[1].sourceOutPoint).toBe(8);
  });

  it("should add clips to both video and audio tracks", () => {
    const tracks = makeTracks();
    const result = addClipToTracks(tracks, "asset-1", 0, 10);

    expect(result[0].clips).toHaveLength(1); // video
    expect(result[1].clips).toHaveLength(1); // audio
  });
});

// ============================================================
// Tests: addClipToTrack (Phase 2 — targeted insertion)
// ============================================================

describe("addClipToTrack", () => {
  it("should add a clip to a specific track only", () => {
    const tracks = makeTracks();
    const result = addClipToTrack(tracks, "track-video", "asset-1", 0, 10);

    expect(result[0].clips).toHaveLength(1);
    expect(result[1].clips).toHaveLength(0); // audio track untouched
  });

  it("should place clip at the specified start time", () => {
    const tracks = makeTracks();
    const result = addClipToTrack(tracks, "track-video", "asset-1", 0, 10, 5.0);

    expect(result[0].clips[0].startTime).toBe(5.0);
  });

  it("should append after existing clips when no startTime given", () => {
    const existing = makeClip({ startTime: 0, sourceOutPoint: 4 });
    const tracks = makeTracks([existing]);
    const result = addClipToTrack(tracks, "track-video", "asset-2", 0, 6);

    expect(result[0].clips).toHaveLength(2);
    expect(result[0].clips[1].startTime).toBe(4);
  });

  it("should support text clip properties", () => {
    const textTrack = makeTrack([], "text", 2, "track-text");
    const tracks = [makeTrack([], "video", 0), textTrack];
    const result = addClipToTrack(tracks, "track-text", "text", 0, 5, 0, {
      text: "Hello",
      fontSize: 32,
      color: "#ff0000",
    });

    const clip = result[1].clips[0];
    expect(clip.text).toBe("Hello");
    expect(clip.fontSize).toBe(32);
    expect(clip.color).toBe("#ff0000");
  });
});

// ============================================================
// Tests: trimClipStart
// ============================================================

describe("trimClipStart", () => {
  it("should adjust sourceInPoint", () => {
    const clip = makeClip({ id: "c1", startTime: 0, sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    const result = trimClipStart(tracks, "c1", 3);

    expect(result[0].clips[0].sourceInPoint).toBe(3);
  });

  it("should clamp sourceInPoint to 0", () => {
    const clip = makeClip({ id: "c1", sourceInPoint: 2 });
    const tracks = makeTracks([clip]);
    const result = trimClipStart(tracks, "c1", -5);

    expect(result[0].clips[0].sourceInPoint).toBe(0);
  });

  it("should clamp sourceInPoint before sourceOutPoint", () => {
    const clip = makeClip({ id: "c1", sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    const result = trimClipStart(tracks, "c1", 15);

    expect(result[0].clips[0].sourceInPoint).toBeLessThan(10);
  });

  it("should ripple subsequent clips", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceInPoint: 0, sourceOutPoint: 10 });
    const clip2 = makeClip({ id: "c2", startTime: 10, sourceInPoint: 0, sourceOutPoint: 5 });
    const tracks = makeTracks([clip1, clip2]);

    const result = trimClipStart(tracks, "c1", 3);
    const newClip1Duration = clipDuration(result[0].clips[0]);
    const newClip2Start = result[0].clips[1].startTime;

    expect(newClip1Duration).toBe(7);
    expect(newClip2Start).toBe(7);
  });

  it("should not affect clips on tracks without the target clip", () => {
    const clip = makeClip({ id: "c1", trackId: "track-video" });
    const tracks = makeTracks([clip]);
    const result = trimClipStart(tracks, "nonexistent", 5);

    expect(result[0].clips[0].sourceInPoint).toBe(0);
  });
});

// ============================================================
// Tests: trimClipEnd
// ============================================================

describe("trimClipEnd", () => {
  it("should adjust sourceOutPoint", () => {
    const clip = makeClip({ id: "c1", sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    const result = trimClipEnd(tracks, "c1", 7, 15);

    expect(result[0].clips[0].sourceOutPoint).toBe(7);
  });

  it("should clamp to source duration", () => {
    const clip = makeClip({ id: "c1", sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    const result = trimClipEnd(tracks, "c1", 20, 12);

    expect(result[0].clips[0].sourceOutPoint).toBe(12);
  });

  it("should ripple subsequent clips", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceInPoint: 0, sourceOutPoint: 10 });
    const clip2 = makeClip({ id: "c2", startTime: 10, sourceInPoint: 0, sourceOutPoint: 5 });
    const tracks = makeTracks([clip1, clip2]);

    const result = trimClipEnd(tracks, "c1", 6, 15);

    expect(result[0].clips[0].sourceOutPoint).toBe(6);
    expect(result[0].clips[1].startTime).toBe(6);
  });
});

// ============================================================
// Tests: splitClip
// ============================================================

describe("splitClip", () => {
  it("should split a clip into two at the given time", () => {
    const clip = makeClip({
      id: "c1",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
    });
    const tracks = makeTracks([clip]);
    const result = splitClip(tracks, "c1", 4);

    expect(result[0].clips).toHaveLength(2);

    const first = result[0].clips[0];
    const second = result[0].clips[1];

    expect(first.id).toBe("c1");
    expect(first.sourceInPoint).toBe(0);
    expect(first.sourceOutPoint).toBe(4);
    expect(first.startTime).toBe(0);

    expect(second.id).not.toBe("c1");
    expect(second.sourceInPoint).toBe(4);
    expect(second.sourceOutPoint).toBe(10);
    expect(second.startTime).toBe(4);
  });

  it("should not split at the very edge of a clip", () => {
    const clip = makeClip({ id: "c1", sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);

    const result1 = splitClip(tracks, "c1", 0);
    expect(result1[0].clips).toHaveLength(1);

    const result2 = splitClip(tracks, "c1", 10);
    expect(result2[0].clips).toHaveLength(1);
  });

  it("should handle split with offset startTime", () => {
    const clip = makeClip({
      id: "c1",
      startTime: 5,
      sourceInPoint: 2,
      sourceOutPoint: 12,
    });
    const tracks = makeTracks([clip]);
    const result = splitClip(tracks, "c1", 8);

    const first = result[0].clips[0];
    const second = result[0].clips[1];

    expect(first.sourceInPoint).toBe(2);
    expect(first.sourceOutPoint).toBe(5);
    expect(second.sourceInPoint).toBe(5);
    expect(second.sourceOutPoint).toBe(12);
    expect(second.startTime).toBe(8);
  });

  it("should preserve contiguity after split", () => {
    const clip = makeClip({
      id: "c1",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
    });
    const tracks = makeTracks([clip]);
    const result = splitClip(tracks, "c1", 4);

    const first = result[0].clips[0];
    const second = result[0].clips[1];

    expect(clipEndTime(first)).toBe(second.startTime);

    const totalDuration = clipDuration(first) + clipDuration(second);
    expect(totalDuration).toBe(10);
  });

  it("should clear transitions on the split edges", () => {
    const clip = makeClip({
      id: "c1",
      startTime: 0,
      sourceOutPoint: 10,
      transitionIn: { type: "crossfade", duration: 0.5 },
      transitionOut: { type: "fadeToBlack", duration: 0.5 },
    });
    const tracks = makeTracks([clip]);
    const result = splitClip(tracks, "c1", 5);

    const second = result[0].clips[1];
    expect(second.transitionIn).toBeUndefined();
    expect(second.transitionOut).toBeUndefined();
  });
});

// ============================================================
// Tests: deleteClip
// ============================================================

describe("deleteClip", () => {
  it("should remove a clip", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = deleteClip(tracks, "c1");

    expect(result[0].clips).toHaveLength(0);
  });

  it("should ripple-close the gap", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 3 });
    const clip3 = makeClip({ id: "c3", startTime: 8, sourceOutPoint: 4 });
    const tracks = makeTracks([clip1, clip2, clip3]);

    const result = deleteClip(tracks, "c2");

    expect(result[0].clips).toHaveLength(2);
    expect(result[0].clips[0].id).toBe("c1");
    expect(result[0].clips[1].id).toBe("c3");
    expect(result[0].clips[1].startTime).toBe(5);
  });

  it("should handle deleting the first clip", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);

    const result = deleteClip(tracks, "c1");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c2");
    expect(result[0].clips[0].startTime).toBe(0);
  });

  it("should handle deleting the last clip", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);

    const result = deleteClip(tracks, "c2");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c1");
    expect(result[0].clips[0].startTime).toBe(0);
  });

  it("should handle deleting a nonexistent clip gracefully", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = deleteClip(tracks, "nonexistent");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c1");
  });
});

// ============================================================
// Tests: Track Management (Phase 2)
// ============================================================

describe("addTrack", () => {
  it("should add a new track with correct type", () => {
    const tracks = makeTracks();
    const result = addTrack(tracks, "video");

    expect(result).toHaveLength(3);
    expect(result[2].type).toBe("video");
    expect(result[2].clips).toHaveLength(0);
  });

  it("should assign order higher than existing tracks", () => {
    const tracks = makeTracks();
    const result = addTrack(tracks, "text");

    expect(result[2].order).toBeGreaterThan(1);
  });

  it("should set muted/volume for audio tracks", () => {
    const tracks = makeTracks();
    const result = addTrack(tracks, "audio");
    const newTrack = result[2];

    expect(newTrack.muted).toBe(false);
    expect(newTrack.volume).toBe(1.0);
  });

  it("should handle adding to empty track list", () => {
    const result = addTrack([], "video");
    expect(result).toHaveLength(1);
    expect(result[0].order).toBe(0);
  });
});

describe("removeTrack", () => {
  it("should remove a track by id", () => {
    const tracks = makeTracks();
    const result = removeTrack(tracks, "track-video");

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("audio");
  });

  it("should not affect other tracks", () => {
    const tracks = makeTracks(
      [makeClip({ id: "c1" })],
      [makeClip({ id: "c2", trackId: "track-audio" })]
    );
    const result = removeTrack(tracks, "track-video");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c2");
  });

  it("should handle removing nonexistent track", () => {
    const tracks = makeTracks();
    const result = removeTrack(tracks, "nonexistent");
    expect(result).toHaveLength(2);
  });
});

describe("reorderTrack", () => {
  it("should update the order of a track", () => {
    const tracks = makeTracks();
    const result = reorderTrack(tracks, "track-video", 5);

    expect(result.find((t) => t.id === "track-video")!.order).toBe(5);
    expect(result.find((t) => t.id === "track-audio")!.order).toBe(1); // unchanged
  });
});

describe("moveClip", () => {
  it("should move a clip to a new start time", () => {
    const clip = makeClip({ id: "c1", startTime: 0 });
    const tracks = makeTracks([clip]);
    const result = moveClip(tracks, "c1", 5);

    expect(result[0].clips[0].startTime).toBe(5);
  });

  it("should clamp start time to 0", () => {
    const clip = makeClip({ id: "c1", startTime: 5 });
    const tracks = makeTracks([clip]);
    const result = moveClip(tracks, "c1", -3);

    expect(result[0].clips[0].startTime).toBe(0);
  });

  it("should move a clip between tracks", () => {
    const clip = makeClip({ id: "c1", trackId: "track-video", startTime: 0 });
    const tracks = makeTracks([clip]);
    const result = moveClip(tracks, "c1", 2, "track-audio");

    expect(result[0].clips).toHaveLength(0); // video track emptied
    expect(result[1].clips).toHaveLength(1); // audio track has the clip
    expect(result[1].clips[0].startTime).toBe(2);
    expect(result[1].clips[0].trackId).toBe("track-audio");
  });

  it("should handle moving a nonexistent clip", () => {
    const tracks = makeTracks();
    const result = moveClip(tracks, "nonexistent", 5);
    expect(result).toEqual(tracks);
  });
});

describe("setTrackVolume", () => {
  it("should set volume on an audio track", () => {
    const tracks = makeTracks();
    const result = setTrackVolume(tracks, "track-audio", 0.5);
    expect(result[1].volume).toBe(0.5);
  });

  it("should clamp volume to [0, 1]", () => {
    const tracks = makeTracks();
    const high = setTrackVolume(tracks, "track-audio", 2.0);
    expect(high[1].volume).toBe(1);

    const low = setTrackVolume(tracks, "track-audio", -0.5);
    expect(low[1].volume).toBe(0);
  });

  it("should not affect non-audio tracks", () => {
    const tracks = makeTracks();
    const result = setTrackVolume(tracks, "track-video", 0.5);
    expect(result[0].volume).toBeUndefined();
  });
});

describe("setTrackMuted", () => {
  it("should mute an audio track", () => {
    const tracks = makeTracks();
    const result = setTrackMuted(tracks, "track-audio", true);
    expect(result[1].muted).toBe(true);
  });

  it("should unmute an audio track", () => {
    const tracks = makeTracks();
    const muted = setTrackMuted(tracks, "track-audio", true);
    const unmuted = setTrackMuted(muted, "track-audio", false);
    expect(unmuted[1].muted).toBe(false);
  });
});

// ============================================================
// Tests: Transitions (Phase 2)
// ============================================================

describe("setClipTransition", () => {
  it("should set transition-in on a clip", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = setClipTransition(tracks, "c1", { type: "crossfade", duration: 0.5 }, "in");

    expect(result[0].clips[0].transitionIn).toEqual({ type: "crossfade", duration: 0.5 });
    expect(result[0].clips[0].transitionOut).toBeUndefined();
  });

  it("should set transition-out on a clip", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = setClipTransition(tracks, "c1", { type: "fadeToBlack", duration: 1.0 }, "out");

    expect(result[0].clips[0].transitionOut).toEqual({ type: "fadeToBlack", duration: 1.0 });
    expect(result[0].clips[0].transitionIn).toBeUndefined();
  });

  it("should clear a transition by passing undefined", () => {
    const clip = makeClip({ id: "c1", transitionIn: { type: "wipe", duration: 0.5 } });
    const tracks = makeTracks([clip]);
    const result = setClipTransition(tracks, "c1", undefined, "in");

    expect(result[0].clips[0].transitionIn).toBeUndefined();
  });
});

// ============================================================
// Tests: Text Overlay (Phase 2)
// ============================================================

describe("updateTextProperties", () => {
  it("should update text content", () => {
    const clip = makeClip({ id: "c1", text: "Hello" });
    const tracks = makeTracks([clip]);
    const result = updateTextProperties(tracks, "c1", { text: "World" });

    expect(result[0].clips[0].text).toBe("World");
  });

  it("should update multiple text properties at once", () => {
    const clip = makeClip({ id: "c1", text: "Hello" });
    const tracks = makeTracks([clip]);
    const result = updateTextProperties(tracks, "c1", {
      text: "Updated",
      fontSize: 64,
      color: "#00ff00",
      animation: "slideIn",
    });

    expect(result[0].clips[0].text).toBe("Updated");
    expect(result[0].clips[0].fontSize).toBe(64);
    expect(result[0].clips[0].color).toBe("#00ff00");
    expect(result[0].clips[0].animation).toBe("slideIn");
  });

  it("should not affect other clips", () => {
    const clip1 = makeClip({ id: "c1", text: "First" });
    const clip2 = makeClip({ id: "c2", text: "Second", startTime: 5 });
    const tracks = makeTracks([clip1, clip2]);
    const result = updateTextProperties(tracks, "c1", { text: "Changed" });

    expect(result[0].clips[0].text).toBe("Changed");
    expect(result[0].clips[1].text).toBe("Second");
  });
});

// ============================================================
// Tests: Filters (Phase 3)
// ============================================================

describe("addFilterToClip", () => {
  it("should add a filter to a clip with no existing filters", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = addFilterToClip(tracks, "c1", { type: "brightness", value: 0.2 });

    expect(result[0].clips[0].filters).toHaveLength(1);
    expect(result[0].clips[0].filters![0].type).toBe("brightness");
    expect(result[0].clips[0].filters![0].value).toBe(0.2);
  });

  it("should append to existing filter stack", () => {
    const clip = makeClip({
      id: "c1",
      filters: [{ type: "brightness", value: 0.1 }],
    });
    const tracks = makeTracks([clip]);
    const result = addFilterToClip(tracks, "c1", { type: "contrast", value: -0.3 });

    expect(result[0].clips[0].filters).toHaveLength(2);
    expect(result[0].clips[0].filters![1].type).toBe("contrast");
  });

  it("should add a LUT filter with lutId", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = addFilterToClip(tracks, "c1", { type: "lut", value: 1, lutId: "warm" });

    expect(result[0].clips[0].filters![0].lutId).toBe("warm");
  });
});

describe("removeFilterFromClip", () => {
  it("should remove a filter by index", () => {
    const clip = makeClip({
      id: "c1",
      filters: [
        { type: "brightness", value: 0.1 },
        { type: "contrast", value: 0.2 },
        { type: "saturation", value: -0.1 },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = removeFilterFromClip(tracks, "c1", 1);

    expect(result[0].clips[0].filters).toHaveLength(2);
    expect(result[0].clips[0].filters![0].type).toBe("brightness");
    expect(result[0].clips[0].filters![1].type).toBe("saturation");
  });
});

describe("updateClipFilter", () => {
  it("should update the value of a specific filter", () => {
    const clip = makeClip({
      id: "c1",
      filters: [
        { type: "brightness", value: 0.1 },
        { type: "contrast", value: 0.2 },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = updateClipFilter(tracks, "c1", 0, 0.5);

    expect(result[0].clips[0].filters![0].value).toBe(0.5);
    expect(result[0].clips[0].filters![1].value).toBe(0.2); // unchanged
  });
});

describe("reorderClipFilters", () => {
  it("should move a filter from one position to another", () => {
    const clip = makeClip({
      id: "c1",
      filters: [
        { type: "brightness", value: 0.1 },
        { type: "contrast", value: 0.2 },
        { type: "saturation", value: 0.3 },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = reorderClipFilters(tracks, "c1", 2, 0);

    expect(result[0].clips[0].filters![0].type).toBe("saturation");
    expect(result[0].clips[0].filters![1].type).toBe("brightness");
    expect(result[0].clips[0].filters![2].type).toBe("contrast");
  });
});

// ============================================================
// Tests: Speed (Phase 3)
// ============================================================

describe("setClipSpeed", () => {
  it("should set constant speed on a clip", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = setClipSpeed(tracks, "c1", [{ time: 0, speed: 2.0 }]);

    expect(result[0].clips[0].speed?.points).toHaveLength(1);
    expect(result[0].clips[0].speed!.points[0].speed).toBe(2.0);
  });

  it("should set multi-point speed ramp", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const result = setClipSpeed(tracks, "c1", [
      { time: 0, speed: 1.0 },
      { time: 5, speed: 2.0 },
      { time: 10, speed: 0.5 },
    ]);

    expect(result[0].clips[0].speed?.points).toHaveLength(3);
  });

  it("should affect clip duration via clipDuration()", () => {
    const clip = makeClip({ id: "c1", sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    const result = setClipSpeed(tracks, "c1", [{ time: 0, speed: 2.0 }]);

    expect(clipDuration(result[0].clips[0])).toBe(5);
  });
});

// ============================================================
// Tests: Keyframes (Phase 3)
// ============================================================

describe("setClipKeyframe", () => {
  it("should add a keyframe to a new property track", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    const kf: Keyframe = { time: 0, value: 0.5, easing: "linear" };
    const result = setClipKeyframe(tracks, "c1", "opacity", kf);

    expect(result[0].clips[0].keyframedProps).toHaveLength(1);
    expect(result[0].clips[0].keyframedProps![0].property).toBe("opacity");
    expect(result[0].clips[0].keyframedProps![0].keyframes).toHaveLength(1);
  });

  it("should add a keyframe to an existing property track", () => {
    const clip = makeClip({
      id: "c1",
      keyframedProps: [
        { property: "opacity", keyframes: [{ time: 0, value: 0, easing: "linear" }] },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = setClipKeyframe(tracks, "c1", "opacity", { time: 2, value: 1, easing: "easeIn" });

    expect(result[0].clips[0].keyframedProps![0].keyframes).toHaveLength(2);
  });

  it("should update an existing keyframe at the same time", () => {
    const clip = makeClip({
      id: "c1",
      keyframedProps: [
        { property: "opacity", keyframes: [{ time: 0, value: 0, easing: "linear" }] },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = setClipKeyframe(tracks, "c1", "opacity", { time: 0, value: 0.5, easing: "easeOut" });

    expect(result[0].clips[0].keyframedProps![0].keyframes).toHaveLength(1);
    expect(result[0].clips[0].keyframedProps![0].keyframes[0].value).toBe(0.5);
    expect(result[0].clips[0].keyframedProps![0].keyframes[0].easing).toBe("easeOut");
  });

  it("should keep keyframes sorted by time", () => {
    const clip = makeClip({ id: "c1" });
    const tracks = makeTracks([clip]);
    let result = setClipKeyframe(tracks, "c1", "position.x", { time: 5, value: 100, easing: "linear" });
    result = setClipKeyframe(result, "c1", "position.x", { time: 1, value: 0, easing: "linear" });
    result = setClipKeyframe(result, "c1", "position.x", { time: 3, value: 50, easing: "easeInOut" });

    const kfs = result[0].clips[0].keyframedProps![0].keyframes;
    expect(kfs[0].time).toBe(1);
    expect(kfs[1].time).toBe(3);
    expect(kfs[2].time).toBe(5);
  });
});

describe("removeClipKeyframe", () => {
  it("should remove a keyframe by time", () => {
    const clip = makeClip({
      id: "c1",
      keyframedProps: [
        {
          property: "opacity",
          keyframes: [
            { time: 0, value: 0, easing: "linear" },
            { time: 2, value: 1, easing: "linear" },
          ],
        },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = removeClipKeyframe(tracks, "c1", "opacity", 0);

    expect(result[0].clips[0].keyframedProps![0].keyframes).toHaveLength(1);
    expect(result[0].clips[0].keyframedProps![0].keyframes[0].time).toBe(2);
  });

  it("should not affect other property tracks", () => {
    const clip = makeClip({
      id: "c1",
      keyframedProps: [
        { property: "opacity", keyframes: [{ time: 0, value: 0, easing: "linear" }] },
        { property: "scale", keyframes: [{ time: 0, value: 1, easing: "linear" }] },
      ],
    });
    const tracks = makeTracks([clip]);
    const result = removeClipKeyframe(tracks, "c1", "opacity", 0);

    expect(result[0].clips[0].keyframedProps![0].keyframes).toHaveLength(0);
    expect(result[0].clips[0].keyframedProps![1].keyframes).toHaveLength(1);
  });
});

// ============================================================
// Tests: deriveProjectDuration
// ============================================================

describe("deriveProjectDuration", () => {
  it("should return 0 for empty tracks", () => {
    const tracks = makeTracks();
    expect(deriveProjectDuration(tracks)).toBe(0);
  });

  it("should return the end time of the last clip", () => {
    const clip = makeClip({ startTime: 5, sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    expect(deriveProjectDuration(tracks)).toBe(15);
  });

  it("should handle multiple clips", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);
    expect(deriveProjectDuration(tracks)).toBe(13);
  });

  it("should account for speed-modified clip durations", () => {
    const clip = makeClip({
      id: "c1",
      startTime: 0,
      sourceInPoint: 0,
      sourceOutPoint: 10,
      speed: { points: [{ time: 0, speed: 2.0 }] },
    });
    const tracks = makeTracks([clip]);
    // At 2x speed, 10s of source plays in 5s of timeline
    expect(deriveProjectDuration(tracks)).toBe(5);
  });
});

// ============================================================
// Tests: AI-Assisted Editing (Phase 5)
// ============================================================

describe("applyAutoReframe", () => {
  it("should apply scale and position keyframe tracks to clip", () => {
    const clip = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);
    
    const cropKeyframes = [
      { time: 0, x: -0.1, y: 0, scale: 1.77 },
      { time: 5, x: 0.1, y: 0, scale: 1.77 },
    ];

    const result = applyAutoReframe(tracks, "c1", "9:16", cropKeyframes);
    const updatedClip = result[0].clips[0];

    expect(updatedClip.keyframedProps).toBeDefined();
    expect(updatedClip.keyframedProps).toHaveLength(3); // position.x, position.y, scale

    const posXTrack = updatedClip.keyframedProps?.find((t) => t.property === "position.x");
    expect(posXTrack).toBeDefined();
    expect(posXTrack!.keyframes).toHaveLength(2);
    expect(posXTrack!.keyframes[0].value).toBe(-0.1);
    expect(posXTrack!.keyframes[1].value).toBe(0.1);

    const scaleTrack = updatedClip.keyframedProps?.find((t) => t.property === "scale");
    expect(scaleTrack).toBeDefined();
    expect(scaleTrack!.keyframes[0].value).toBe(1.77);
  });
});

describe("setClipDenoised", () => {
  it("should set denoising metadata non-destructively", () => {
    const clip = makeClip({ id: "c1", sourceId: "orig_asset" });
    const tracks = makeTracks([clip]);

    // Apply denoising
    const result1 = setClipDenoised(tracks, "c1", true, "denoised_asset");
    const updatedClip1 = result1[0].clips[0];

    expect(updatedClip1.isDenoised).toBe(true);
    expect(updatedClip1.originalSourceId).toBe("orig_asset");
    expect(updatedClip1.denoisedSourceId).toBe("denoised_asset");
    expect(updatedClip1.sourceId).toBe("denoised_asset");

    // Toggle back to original
    const result2 = setClipDenoised(result1, "c1", false);
    const updatedClip2 = result2[0].clips[0];

    expect(updatedClip2.isDenoised).toBe(false);
    expect(updatedClip2.sourceId).toBe("orig_asset");

    // Toggle back to denoised
    const result3 = setClipDenoised(result2, "c1", true);
    const updatedClip3 = result3[0].clips[0];

    expect(updatedClip3.isDenoised).toBe(true);
    expect(updatedClip3.sourceId).toBe("denoised_asset");
  });
});

