// ============================================================
// FutureCut — Operations Unit Tests
// ============================================================
// Tests for the pure timeline operation functions.
// These are the highest-risk functions for subtle bugs.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  addClipToTracks,
  trimClipStart,
  trimClipEnd,
  splitClip,
  deleteClip,
} from "@/lib/model/operations";
import type { Track, Clip } from "@/lib/model/types";
import { clipDuration, clipEndTime, deriveProjectDuration } from "@/lib/model/types";

// ============================================================
// Test helpers
// ============================================================

function makeTrack(clips: Clip[] = [], type: "video" | "audio" = "video", order = 0): Track {
  return { id: `track-${type}`, type, clips, order };
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

    // Trim clip1 start to 3 → clip1 becomes 7s long → clip2 slides
    const result = trimClipStart(tracks, "c1", 3);
    const newClip1Duration = clipDuration(result[0].clips[0]);
    const newClip2Start = result[0].clips[1].startTime;

    // Clip1 went from 10s to 7s duration, so clip2 should shift by -3
    expect(newClip1Duration).toBe(7);
    expect(newClip2Start).toBe(7);
  });

  it("should not affect clips on tracks without the target clip", () => {
    const clip = makeClip({ id: "c1", trackId: "track-video" });
    const tracks = makeTracks([clip]);
    const result = trimClipStart(tracks, "nonexistent", 5);

    expect(result[0].clips[0].sourceInPoint).toBe(0); // Unchanged
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

    // Trim clip1 end to 6 → clip2 should slide left by 4
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

    // First half: 0 → 4
    expect(first.id).toBe("c1"); // Keeps original ID
    expect(first.sourceInPoint).toBe(0);
    expect(first.sourceOutPoint).toBe(4);
    expect(first.startTime).toBe(0);

    // Second half: 4 → 10
    expect(second.id).not.toBe("c1"); // New ID
    expect(second.sourceInPoint).toBe(4);
    expect(second.sourceOutPoint).toBe(10);
    expect(second.startTime).toBe(4);
  });

  it("should not split at the very edge of a clip", () => {
    const clip = makeClip({ id: "c1", sourceInPoint: 0, sourceOutPoint: 10 });
    const tracks = makeTracks([clip]);

    // Split at the start edge
    const result1 = splitClip(tracks, "c1", 0);
    expect(result1[0].clips).toHaveLength(1);

    // Split at the end edge
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
    const result = splitClip(tracks, "c1", 8); // 3 seconds into the clip

    const first = result[0].clips[0];
    const second = result[0].clips[1];

    expect(first.sourceInPoint).toBe(2);
    expect(first.sourceOutPoint).toBe(5); // sourceInPoint + (8 - 5) = 5
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

    // End of first should equal start of second
    expect(clipEndTime(first)).toBe(second.startTime);

    // Total duration should be preserved
    const totalDuration = clipDuration(first) + clipDuration(second);
    expect(totalDuration).toBe(10);
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

    // Delete the middle clip (5s long → wait, duration is outPoint - inPoint)
    // clip2 duration = 3 - 0 = 3
    const result = deleteClip(tracks, "c2");

    expect(result[0].clips).toHaveLength(2);
    expect(result[0].clips[0].id).toBe("c1");
    expect(result[0].clips[1].id).toBe("c3");
    // clip3 should slide left by clip2's duration (3s)
    expect(result[0].clips[1].startTime).toBe(5); // Was 8, minus 3
  });

  it("should handle deleting the first clip", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);

    const result = deleteClip(tracks, "c1");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c2");
    expect(result[0].clips[0].startTime).toBe(0); // Rippled to start
  });

  it("should handle deleting the last clip", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);

    const result = deleteClip(tracks, "c2");

    expect(result[0].clips).toHaveLength(1);
    expect(result[0].clips[0].id).toBe("c1");
    expect(result[0].clips[0].startTime).toBe(0); // Unchanged
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
    expect(deriveProjectDuration(tracks)).toBe(15); // 5 + 10
  });

  it("should handle multiple clips", () => {
    const clip1 = makeClip({ id: "c1", startTime: 0, sourceOutPoint: 5 });
    const clip2 = makeClip({ id: "c2", startTime: 5, sourceOutPoint: 8 });
    const tracks = makeTracks([clip1, clip2]);
    expect(deriveProjectDuration(tracks)).toBe(13); // 5 + 8
  });
});
