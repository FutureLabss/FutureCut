// ============================================================
// FutureCut — Phase 5 AI Operations Unit Tests
// ============================================================
// Tests for all Phase 5 pure operations: applyAutoReframe,
// setClipDenoised, and the store-level AI action integrations:
// applyCaptions, splitClipAtTimes, applyDenoisedAudio.
// Also covers undo/redo for every Phase 5 state change.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  applyAutoReframe,
  setClipDenoised,
} from "@/lib/model/operations";
import type { Track, Clip } from "@/lib/model/types";
import { useEditorStore } from "@/lib/store/editorStore";

// ============================================================
// Test helpers
// ============================================================

function makeTrack(
  clips: Clip[] = [],
  type: "video" | "audio" | "text" = "video",
  order = 0,
  id?: string
): Track {
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

function addTestAsset(): string {
  return useEditorStore.getState().addAsset({
    fileName: "test.mp4",
    duration: 30,
    width: 1920,
    height: 1080,
    objectUrl: "blob:test",
    file: new File([], "test.mp4"),
    codec: "avc1",
  });
}

// ============================================================
// Tests: applyAutoReframe (pure operation)
// ============================================================

describe("applyAutoReframe", () => {
  it("should apply crop keyframes as position.x, position.y, and scale keyframe tracks", () => {
    const clip = makeClip({ id: "clip-1" });
    const tracks = makeTracks([clip]);

    const cropKeyframes = [
      { time: 0, x: -0.1, y: 0, scale: 1.77 },
      { time: 5, x: 0.1, y: 0, scale: 1.77 },
      { time: 10, x: 0, y: 0, scale: 1.77 },
    ];

    const result = applyAutoReframe(tracks, "clip-1", "9:16", cropKeyframes);
    const updatedClip = result[0].clips[0];

    expect(updatedClip.keyframedProps).toBeDefined();
    expect(updatedClip.keyframedProps).toHaveLength(3);

    const xTrack = updatedClip.keyframedProps!.find((t) => t.property === "position.x");
    const yTrack = updatedClip.keyframedProps!.find((t) => t.property === "position.y");
    const scaleTrack = updatedClip.keyframedProps!.find((t) => t.property === "scale");

    expect(xTrack).toBeDefined();
    expect(yTrack).toBeDefined();
    expect(scaleTrack).toBeDefined();

    expect(xTrack!.keyframes).toHaveLength(3);
    expect(xTrack!.keyframes[0].value).toBe(-0.1);
    expect(xTrack!.keyframes[1].value).toBe(0.1);
    expect(xTrack!.keyframes[2].value).toBe(0);

    expect(scaleTrack!.keyframes[0].value).toBe(1.77);
    expect(scaleTrack!.keyframes[0].easing).toBe("linear");
  });

  it("should replace existing position/scale keyframes rather than appending", () => {
    const clip = makeClip({
      id: "clip-1",
      keyframedProps: [
        {
          property: "position.x",
          keyframes: [
            { time: 0, value: 0.5, easing: "easeIn" },
          ],
        },
        {
          property: "opacity",
          keyframes: [
            { time: 0, value: 1, easing: "linear" },
          ],
        },
      ],
    });
    const tracks = makeTracks([clip]);

    const cropKeyframes = [
      { time: 0, x: 0.2, y: 0.1, scale: 1.0 },
    ];

    const result = applyAutoReframe(tracks, "clip-1", "1:1", cropKeyframes);
    const updatedClip = result[0].clips[0];

    // Opacity should be preserved, position.x should be replaced
    const opacityTrack = updatedClip.keyframedProps!.find((t) => t.property === "opacity");
    expect(opacityTrack).toBeDefined();
    expect(opacityTrack!.keyframes[0].value).toBe(1);

    const xTrack = updatedClip.keyframedProps!.find((t) => t.property === "position.x");
    expect(xTrack!.keyframes).toHaveLength(1);
    expect(xTrack!.keyframes[0].value).toBe(0.2);
  });

  it("should not modify clips on other tracks", () => {
    const videoClip = makeClip({ id: "clip-1" });
    const audioClip = makeClip({
      id: "audio-clip-1",
      trackId: "track-audio",
    });
    const tracks = makeTracks([videoClip], [audioClip]);

    const result = applyAutoReframe(tracks, "clip-1", "4:5", [
      { time: 0, x: 0, y: 0, scale: 1.25 },
    ]);

    expect(result[1].clips[0].keyframedProps).toBeUndefined();
  });

  it("should return tracks unchanged if clipId does not exist", () => {
    const tracks = makeTracks([makeClip()]);
    const result = applyAutoReframe(tracks, "nonexistent", "9:16", [
      { time: 0, x: 0, y: 0, scale: 1 },
    ]);

    expect(result[0].clips[0].keyframedProps).toBeUndefined();
  });
});

// ============================================================
// Tests: setClipDenoised (pure operation)
// ============================================================

describe("setClipDenoised", () => {
  it("should set denoise state and swap sourceId when enabling", () => {
    const clip = makeClip({ id: "clip-1", sourceId: "original-asset" });
    const tracks = makeTracks([clip]);

    const result = setClipDenoised(tracks, "clip-1", true, "denoised-asset");
    const updatedClip = result[0].clips[0];

    expect(updatedClip.isDenoised).toBe(true);
    expect(updatedClip.originalSourceId).toBe("original-asset");
    expect(updatedClip.denoisedSourceId).toBe("denoised-asset");
    expect(updatedClip.sourceId).toBe("denoised-asset");
  });

  it("should restore original sourceId when disabling denoise", () => {
    const clip = makeClip({
      id: "clip-1",
      sourceId: "denoised-asset",
      originalSourceId: "original-asset",
      denoisedSourceId: "denoised-asset",
      isDenoised: true,
    });
    const tracks = makeTracks([clip]);

    const result = setClipDenoised(tracks, "clip-1", false);
    const updatedClip = result[0].clips[0];

    expect(updatedClip.isDenoised).toBe(false);
    expect(updatedClip.sourceId).toBe("original-asset");
    expect(updatedClip.originalSourceId).toBe("original-asset");
    expect(updatedClip.denoisedSourceId).toBe("denoised-asset");
  });

  it("should preserve originalSourceId on repeated enable calls", () => {
    const clip = makeClip({
      id: "clip-1",
      sourceId: "original-asset",
      originalSourceId: "original-asset",
      denoisedSourceId: "denoised-v1",
      isDenoised: false,
    });
    const tracks = makeTracks([clip]);

    // Enable with a new denoised asset
    const result = setClipDenoised(tracks, "clip-1", true, "denoised-v2");
    const updatedClip = result[0].clips[0];

    // originalSourceId should still be the original, not the previous denoised
    expect(updatedClip.originalSourceId).toBe("original-asset");
    expect(updatedClip.denoisedSourceId).toBe("denoised-v2");
    expect(updatedClip.sourceId).toBe("denoised-v2");
  });

  it("should not affect other clips", () => {
    const clip1 = makeClip({ id: "clip-1", sourceId: "asset-1" });
    const clip2 = makeClip({ id: "clip-2", sourceId: "asset-2", startTime: 10 });
    const tracks = makeTracks([clip1, clip2]);

    const result = setClipDenoised(tracks, "clip-1", true, "denoised-1");

    expect(result[0].clips[1].sourceId).toBe("asset-2");
    expect(result[0].clips[1].isDenoised).toBeUndefined();
  });
});

// ============================================================
// Tests: Store-level Phase 5 actions
// ============================================================

describe("Phase 5 store actions", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.temporal.getState().clear();
  });

  // ----------------------------------------------------------
  // applyCaptions
  // ----------------------------------------------------------
  describe("applyCaptions", () => {
    it("should create a text track with segmented caption clips", () => {
      addTestAsset();

      const words = [
        { text: "Hello", startTime: 0.5, endTime: 0.8 },
        { text: "world", startTime: 0.9, endTime: 1.2 },
        { text: "this", startTime: 1.3, endTime: 1.5 },
        { text: "is", startTime: 1.6, endTime: 1.7 },
        { text: "a", startTime: 1.8, endTime: 1.9 },
        // Gap + 5 words triggers new segment
        { text: "test", startTime: 4.0, endTime: 4.3 },
      ];

      useEditorStore.getState().applyCaptions(words);

      const state = useEditorStore.getState();
      const textTrack = state.project.tracks.find((t) => t.type === "text");

      expect(textTrack).toBeDefined();
      expect(textTrack!.clips.length).toBeGreaterThanOrEqual(2);

      // First segment should contain the first 5 words
      const firstCaption = textTrack!.clips[0];
      expect(firstCaption.text).toBe("Hello world this is a");
      expect(firstCaption.startTime).toBe(0.5);
      expect(firstCaption.fontFamily).toBe("Outfit");
      expect(firstCaption.fontSize).toBe(24);
      expect(firstCaption.color).toBe("#FFFFFF");
      expect(firstCaption.position).toEqual({ x: 0.5, y: 0.8 });

      // Second segment should be "test"
      const secondCaption = textTrack!.clips[1];
      expect(secondCaption.text).toBe("test");
      expect(secondCaption.startTime).toBe(4.0);
    });

    it("should replace existing captions when re-run", () => {
      addTestAsset();

      const words1 = [
        { text: "First", startTime: 0, endTime: 0.5 },
        { text: "run", startTime: 0.6, endTime: 1.0 },
      ];

      useEditorStore.getState().applyCaptions(words1);

      let textTrack = useEditorStore.getState().project.tracks.find((t) => t.type === "text");
      expect(textTrack!.clips).toHaveLength(1);
      expect(textTrack!.clips[0].text).toBe("First run");

      // Re-run with different words
      const words2 = [
        { text: "Second", startTime: 0, endTime: 0.5 },
        { text: "attempt", startTime: 0.6, endTime: 1.0 },
        { text: "here", startTime: 1.1, endTime: 1.5 },
      ];

      useEditorStore.getState().applyCaptions(words2);

      textTrack = useEditorStore.getState().project.tracks.find((t) => t.type === "text");
      expect(textTrack!.clips).toHaveLength(1);
      expect(textTrack!.clips[0].text).toBe("Second attempt here");
    });

    it("should create a new text track if none exists", () => {
      addTestAsset();

      const state = useEditorStore.getState();
      const initialTextTracks = state.project.tracks.filter((t) => t.type === "text");
      expect(initialTextTracks).toHaveLength(0);

      useEditorStore.getState().applyCaptions([
        { text: "Hey", startTime: 0, endTime: 0.5 },
      ]);

      const updated = useEditorStore.getState();
      const textTracks = updated.project.tracks.filter((t) => t.type === "text");
      expect(textTracks).toHaveLength(1);
    });

    it("should split segments on large time gaps", () => {
      addTestAsset();

      const words = [
        { text: "Part", startTime: 0, endTime: 0.3 },
        { text: "one", startTime: 0.4, endTime: 0.7 },
        // 2-second gap > 1.5s threshold
        { text: "Part", startTime: 2.8, endTime: 3.1 },
        { text: "two", startTime: 3.2, endTime: 3.5 },
      ];

      useEditorStore.getState().applyCaptions(words);

      const textTrack = useEditorStore.getState().project.tracks.find((t) => t.type === "text");
      expect(textTrack!.clips).toHaveLength(2);
      expect(textTrack!.clips[0].text).toBe("Part one");
      expect(textTrack!.clips[1].text).toBe("Part two");
    });
  });

  // ----------------------------------------------------------
  // splitClipAtTimes (scene detection result application)
  // ----------------------------------------------------------
  describe("splitClipAtTimes", () => {
    it("should split a clip at multiple boundary timestamps", () => {
      addTestAsset();

      const state = useEditorStore.getState();
      const clipId = state.project.tracks[0].clips[0].id;

      // Simulate scene boundaries at 5s and 15s in a 30s clip
      useEditorStore.getState().splitClipAtTimes(clipId, [5, 15]);

      const updated = useEditorStore.getState();
      const videoClips = updated.project.tracks[0].clips;

      expect(videoClips).toHaveLength(3);

      // First segment: 0-5s
      expect(videoClips[0].startTime).toBe(0);
      expect(videoClips[0].sourceOutPoint).toBe(5);

      // Second segment: 5-15s
      expect(videoClips[1].startTime).toBe(5);
      expect(videoClips[1].sourceInPoint).toBe(5);
      expect(videoClips[1].sourceOutPoint).toBe(15);

      // Third segment: 15-30s
      expect(videoClips[2].startTime).toBe(15);
      expect(videoClips[2].sourceInPoint).toBe(15);
      expect(videoClips[2].sourceOutPoint).toBe(30);
    });

    it("should handle unsorted boundary times", () => {
      addTestAsset();

      const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

      // Pass times in reverse — the action should sort them
      useEditorStore.getState().splitClipAtTimes(clipId, [20, 10]);

      const videoClips = useEditorStore.getState().project.tracks[0].clips;
      expect(videoClips).toHaveLength(3);

      expect(videoClips[0].sourceOutPoint).toBe(10);
      expect(videoClips[1].sourceInPoint).toBe(10);
      expect(videoClips[1].sourceOutPoint).toBe(20);
      expect(videoClips[2].sourceInPoint).toBe(20);
    });

    it("should handle a single boundary", () => {
      addTestAsset();

      const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

      useEditorStore.getState().splitClipAtTimes(clipId, [12]);

      const videoClips = useEditorStore.getState().project.tracks[0].clips;
      expect(videoClips).toHaveLength(2);
      expect(videoClips[0].sourceOutPoint).toBe(12);
      expect(videoClips[1].sourceInPoint).toBe(12);
    });

    it("should be a no-op for boundaries outside clip range", () => {
      addTestAsset();

      const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

      // These are outside the 0-30s clip range (or too close to edges)
      useEditorStore.getState().splitClipAtTimes(clipId, [0.005, 29.995]);

      const videoClips = useEditorStore.getState().project.tracks[0].clips;
      // splitClip guards against splits within 0.01s of edges
      expect(videoClips).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------
  // applyAutoReframe (store-level)
  // ----------------------------------------------------------
  describe("applyAutoReframe (store)", () => {
    it("should apply reframe keyframes to the specified clip via the store", () => {
      addTestAsset();

      const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

      useEditorStore.getState().applyAutoReframe(
        clipId,
        "9:16",
        [
          { time: 0, x: -0.1, y: 0, scale: 1.77 },
          { time: 10, x: 0.1, y: 0, scale: 1.77 },
        ]
      );

      const clip = useEditorStore.getState().project.tracks[0].clips[0];
      expect(clip.keyframedProps).toHaveLength(3);

      const xTrack = clip.keyframedProps!.find((t) => t.property === "position.x");
      expect(xTrack!.keyframes).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------
  // applyDenoisedAudio + setClipDenoised (store-level)
  // ----------------------------------------------------------
  describe("applyDenoisedAudio & setClipDenoised (store)", () => {
    it("should register a denoised asset and toggle denoise state on a clip", () => {
      const assetId = addTestAsset();

      const state = useEditorStore.getState();
      const clipId = state.project.tracks[0].clips[0].id;

      // Apply denoised audio
      useEditorStore.getState().applyDenoisedAudio(
        clipId,
        "denoised-asset-1",
        "test (AI Enhanced).wav"
      );

      let updated = useEditorStore.getState();
      let clip = updated.project.tracks[0].clips[0];

      // Should have switched to denoised
      expect(clip.isDenoised).toBe(true);
      expect(clip.sourceId).toBe("denoised-asset-1");
      expect(clip.originalSourceId).toBe(assetId);
      expect(clip.denoisedSourceId).toBe("denoised-asset-1");

      // Denoised asset should be registered
      expect(updated.assets["denoised-asset-1"]).toBeDefined();
      expect(updated.assets["denoised-asset-1"].fileName).toBe("test (AI Enhanced).wav");

      // Toggle off
      useEditorStore.getState().setClipDenoised(clipId, false);

      updated = useEditorStore.getState();
      clip = updated.project.tracks[0].clips[0];

      expect(clip.isDenoised).toBe(false);
      expect(clip.sourceId).toBe(assetId);

      // Toggle back on
      useEditorStore.getState().setClipDenoised(clipId, true);

      updated = useEditorStore.getState();
      clip = updated.project.tracks[0].clips[0];

      expect(clip.isDenoised).toBe(true);
      expect(clip.sourceId).toBe("denoised-asset-1");
    });
  });
});

// ============================================================
// Tests: Undo/Redo for Phase 5 operations
// ============================================================

describe("Phase 5 Undo/Redo", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.temporal.getState().clear();
  });

  it("should undo/redo applyCaptions", () => {
    addTestAsset();

    const words = [
      { text: "Undo", startTime: 0, endTime: 0.5 },
      { text: "test", startTime: 0.6, endTime: 1.0 },
    ];

    useEditorStore.getState().applyCaptions(words);

    let textTrack = useEditorStore.getState().project.tracks.find((t) => t.type === "text");
    expect(textTrack).toBeDefined();
    expect(textTrack!.clips).toHaveLength(1);

    // Undo — captions should be gone (and possibly the text track too)
    useEditorStore.temporal.getState().undo();

    const undoneState = useEditorStore.getState();
    const undoneTextTrack = undoneState.project.tracks.find((t) => t.type === "text");
    // Either no text track, or empty clips
    if (undoneTextTrack) {
      expect(undoneTextTrack.clips).toHaveLength(0);
    }

    // Redo — captions should reappear
    useEditorStore.temporal.getState().redo();

    textTrack = useEditorStore.getState().project.tracks.find((t) => t.type === "text");
    expect(textTrack).toBeDefined();
    expect(textTrack!.clips).toHaveLength(1);
    expect(textTrack!.clips[0].text).toBe("Undo test");
  });

  it("should undo/redo splitClipAtTimes (scene detection)", () => {
    addTestAsset();

    const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

    useEditorStore.getState().splitClipAtTimes(clipId, [10, 20]);

    expect(useEditorStore.getState().project.tracks[0].clips).toHaveLength(3);

    useEditorStore.temporal.getState().undo();

    expect(useEditorStore.getState().project.tracks[0].clips).toHaveLength(1);
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceOutPoint).toBe(30);

    useEditorStore.temporal.getState().redo();

    expect(useEditorStore.getState().project.tracks[0].clips).toHaveLength(3);
  });

  it("should undo/redo applyAutoReframe", () => {
    addTestAsset();

    const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

    useEditorStore.getState().applyAutoReframe(
      clipId,
      "1:1",
      [{ time: 0, x: 0, y: 0, scale: 1.0 }]
    );

    expect(useEditorStore.getState().project.tracks[0].clips[0].keyframedProps).toHaveLength(3);

    useEditorStore.temporal.getState().undo();

    expect(useEditorStore.getState().project.tracks[0].clips[0].keyframedProps).toBeUndefined();

    useEditorStore.temporal.getState().redo();

    expect(useEditorStore.getState().project.tracks[0].clips[0].keyframedProps).toHaveLength(3);
  });

  it("should undo/redo applyDenoisedAudio", () => {
    const assetId = addTestAsset();
    const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

    useEditorStore.getState().applyDenoisedAudio(
      clipId,
      "denoised-1",
      "test_enhanced.wav"
    );

    expect(useEditorStore.getState().project.tracks[0].clips[0].isDenoised).toBe(true);
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceId).toBe("denoised-1");

    useEditorStore.temporal.getState().undo();

    expect(useEditorStore.getState().project.tracks[0].clips[0].isDenoised).toBeUndefined();
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceId).toBe(assetId);

    useEditorStore.temporal.getState().redo();

    expect(useEditorStore.getState().project.tracks[0].clips[0].isDenoised).toBe(true);
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceId).toBe("denoised-1");
  });

  it("should undo/redo setClipDenoised toggle", () => {
    const assetId = addTestAsset();
    const clipId = useEditorStore.getState().project.tracks[0].clips[0].id;

    // First apply denoised audio
    useEditorStore.getState().applyDenoisedAudio(
      clipId,
      "denoised-1",
      "enhanced.wav"
    );

    // Toggle off
    useEditorStore.getState().setClipDenoised(clipId, false);

    expect(useEditorStore.getState().project.tracks[0].clips[0].isDenoised).toBe(false);
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceId).toBe(assetId);

    // Undo the toggle-off — should go back to denoised
    useEditorStore.temporal.getState().undo();

    expect(useEditorStore.getState().project.tracks[0].clips[0].isDenoised).toBe(true);
    expect(useEditorStore.getState().project.tracks[0].clips[0].sourceId).toBe("denoised-1");
  });
});
