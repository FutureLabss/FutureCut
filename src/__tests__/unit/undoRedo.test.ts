// ============================================================
// FutureCut — Undo/Redo Unit Tests (Enhanced)
// ============================================================
// Tests 20+ sequential mutations through the Zustand store
// with Zundo undo/redo, verifying state integrity at every step.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/lib/store/editorStore";
import { clipDuration } from "@/lib/model/types";

describe("Undo/Redo integration", () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.temporal.getState().clear();
  });

  it("should track timeline mutations and support undo/redo", () => {
    const temporal = useEditorStore.temporal.getState();

    expect(useEditorStore.getState().project.tracks[0].clips).toHaveLength(0);
    expect(temporal.pastStates).toHaveLength(0);

    const assetId = useEditorStore.getState().addAsset({
      fileName: "test.mp4",
      duration: 10,
      width: 1920,
      height: 1080,
      objectUrl: "blob:test",
      file: new File([], "test.mp4"),
      codec: "avc1",
    });

    const stateAfterAdd = useEditorStore.getState();
    expect(stateAfterAdd.project.tracks[0].clips).toHaveLength(1);
    const originalClipId = stateAfterAdd.project.tracks[0].clips[0].id;

    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(1);

    useEditorStore.getState().trimClipEnd(originalClipId, 8);

    let updatedState = useEditorStore.getState();
    expect(clipDuration(updatedState.project.tracks[0].clips[0])).toBe(8);
    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(2);

    useEditorStore.temporal.getState().undo();

    let stateAfterUndo = useEditorStore.getState();
    expect(clipDuration(stateAfterUndo.project.tracks[0].clips[0])).toBe(10);
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(1);

    useEditorStore.temporal.getState().redo();

    let stateAfterRedo = useEditorStore.getState();
    expect(clipDuration(stateAfterRedo.project.tracks[0].clips[0])).toBe(8);
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(0);
  });

  it("should handle undo/redo for splitting a clip", () => {
    useEditorStore.getState().addAsset({
      fileName: "test.mp4",
      duration: 10,
      width: 1920,
      height: 1080,
      objectUrl: "blob:test",
      file: new File([], "test.mp4"),
      codec: "avc1",
    });

    const stateAfterAdd = useEditorStore.getState();
    const originalClipId = stateAfterAdd.project.tracks[0].clips[0].id;

    useEditorStore.getState().splitAtPlayhead(originalClipId, 4);

    let stateAfterSplit = useEditorStore.getState();
    expect(stateAfterSplit.project.tracks[0].clips).toHaveLength(2);

    useEditorStore.temporal.getState().undo();
    let stateAfterUndo = useEditorStore.getState();
    expect(stateAfterUndo.project.tracks[0].clips).toHaveLength(1);

    useEditorStore.temporal.getState().redo();
    let stateAfterRedo = useEditorStore.getState();
    expect(stateAfterRedo.project.tracks[0].clips).toHaveLength(2);
  });

  it("should handle undo/redo for deleting a clip", () => {
    useEditorStore.getState().addAsset({
      fileName: "test.mp4",
      duration: 10,
      width: 1920,
      height: 1080,
      objectUrl: "blob:test",
      file: new File([], "test.mp4"),
      codec: "avc1",
    });

    const stateAfterAdd = useEditorStore.getState();
    const originalClipId = stateAfterAdd.project.tracks[0].clips[0].id;

    useEditorStore.getState().deleteClip(originalClipId);

    let stateAfterDelete = useEditorStore.getState();
    expect(stateAfterDelete.project.tracks[0].clips).toHaveLength(0);

    useEditorStore.temporal.getState().undo();
    let stateAfterUndo = useEditorStore.getState();
    expect(stateAfterUndo.project.tracks[0].clips).toHaveLength(1);
    expect(stateAfterUndo.project.tracks[0].clips[0].id).toBe(originalClipId);

    useEditorStore.temporal.getState().redo();
    let stateAfterRedo = useEditorStore.getState();
    expect(stateAfterRedo.project.tracks[0].clips).toHaveLength(0);
  });

  it("should round-trip 20 sequential mutations without state corruption", () => {
    // Mutation 1: Add first asset (creates clips)
    const asset1Id = useEditorStore.getState().addAsset({
      fileName: "clip1.mp4",
      duration: 20,
      width: 1920,
      height: 1080,
      objectUrl: "blob:clip1",
      file: new File([], "clip1.mp4"),
      codec: "avc1",
    });

    let state = useEditorStore.getState();
    const clip1Id = state.project.tracks[0].clips[0].id;
    expect(state.project.tracks[0].clips).toHaveLength(1);

    // Mutation 2: Trim end to 15s
    useEditorStore.getState().trimClipEnd(clip1Id, 15);
    state = useEditorStore.getState();
    expect(clipDuration(state.project.tracks[0].clips[0])).toBe(15);

    // Mutation 3: Trim start to 2s
    useEditorStore.getState().trimClipStart(clip1Id, 2);
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips[0].sourceInPoint).toBe(2);

    // Mutation 4: Split at 8s (timeline position)
    useEditorStore.getState().splitAtPlayhead(clip1Id, 8);
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips).toHaveLength(2);
    const clip1SecondHalfId = state.project.tracks[0].clips[1].id;

    // Mutation 5: Add a second asset
    const asset2Id = useEditorStore.getState().addAsset({
      fileName: "clip2.mp4",
      duration: 10,
      width: 1920,
      height: 1080,
      objectUrl: "blob:clip2",
      file: new File([], "clip2.mp4"),
      codec: "avc1",
    });
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.length).toBeGreaterThanOrEqual(3);

    // Mutation 6: Delete the second half of split clip
    useEditorStore.getState().deleteClip(clip1SecondHalfId);
    state = useEditorStore.getState();
    const clipsAfterDelete = state.project.tracks[0].clips;
    expect(clipsAfterDelete.find((c) => c.id === clip1SecondHalfId)).toBeUndefined();

    // Mutation 7: Add a new video track
    useEditorStore.getState().addTrack("video");
    state = useEditorStore.getState();
    const videoTracks = state.project.tracks.filter((t) => t.type === "video");
    expect(videoTracks.length).toBe(2);

    // Mutation 8: Add a text track
    useEditorStore.getState().addTrack("text");
    state = useEditorStore.getState();
    const textTracks = state.project.tracks.filter((t) => t.type === "text");
    expect(textTracks.length).toBe(1);
    const textTrackId = textTracks[0].id;

    // Mutation 9: Add a text clip
    useEditorStore.getState().addClipToTrack(textTrackId, "text", 0, 5, 0, {
      text: "Title Card",
      fontSize: 48,
      color: "#ffffff",
    });
    state = useEditorStore.getState();
    const textTrack = state.project.tracks.find((t) => t.id === textTrackId)!;
    expect(textTrack.clips).toHaveLength(1);
    const textClipId = textTrack.clips[0].id;

    // Mutation 10: Set transition on clip1
    useEditorStore.getState().setClipTransition(clip1Id, { type: "crossfade", duration: 0.5 }, "out");
    state = useEditorStore.getState();
    const updatedClip1 = state.project.tracks[0].clips.find((c) => c.id === clip1Id);
    expect(updatedClip1?.transitionOut?.type).toBe("crossfade");

    // Mutation 11: Add brightness filter to clip1
    useEditorStore.getState().addFilterToClip(clip1Id, { type: "brightness", value: 0.2 });
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.filters).toHaveLength(1);

    // Mutation 12: Add contrast filter to clip1
    useEditorStore.getState().addFilterToClip(clip1Id, { type: "contrast", value: -0.1 });
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.filters).toHaveLength(2);

    // Mutation 13: Update text properties
    useEditorStore.getState().updateTextProperties(textClipId, {
      text: "Updated Title",
      animation: "fadeIn",
    });
    state = useEditorStore.getState();
    const updatedText = state.project.tracks.find((t) => t.id === textTrackId)?.clips.find((c) => c.id === textClipId);
    expect(updatedText?.text).toBe("Updated Title");

    // Mutation 14: Set speed on clip1
    useEditorStore.getState().setClipSpeed(clip1Id, [{ time: 0, speed: 1.5 }]);
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.speed?.points[0].speed).toBe(1.5);

    // Mutation 15: Add opacity keyframe at t=0
    useEditorStore.getState().setClipKeyframe(clip1Id, "opacity", { time: 0, value: 0, easing: "linear" });
    state = useEditorStore.getState();
    const kfProps = state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.keyframedProps;
    expect(kfProps?.find((t) => t.property === "opacity")?.keyframes).toHaveLength(1);

    // Mutation 16: Add opacity keyframe at t=1
    useEditorStore.getState().setClipKeyframe(clip1Id, "opacity", { time: 1, value: 1, easing: "easeIn" });
    state = useEditorStore.getState();
    expect(
      state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.keyframedProps?.find((t) => t.property === "opacity")?.keyframes
    ).toHaveLength(2);

    // Mutation 17: Remove filter from clip1
    useEditorStore.getState().removeFilterFromClip(clip1Id, 0);
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.filters).toHaveLength(1);

    // Mutation 18: Update remaining filter value
    useEditorStore.getState().updateClipFilter(clip1Id, 0, 0.3);
    state = useEditorStore.getState();
    expect(state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.filters![0].value).toBe(0.3);

    // Mutation 19: Remove keyframe at t=0
    useEditorStore.getState().removeClipKeyframe(clip1Id, "opacity", 0);
    state = useEditorStore.getState();
    expect(
      state.project.tracks[0].clips.find((c) => c.id === clip1Id)?.keyframedProps?.find((t) => t.property === "opacity")?.keyframes
    ).toHaveLength(1);

    // Mutation 20: Remove text track
    useEditorStore.getState().removeTrack(textTrackId);
    state = useEditorStore.getState();
    expect(state.project.tracks.find((t) => t.id === textTrackId)).toBeUndefined();

    // ============================================================
    // Verify we have 20 past states
    // ============================================================
    const pastCount = useEditorStore.temporal.getState().pastStates.length;
    expect(pastCount).toBe(20);

    // ============================================================
    // Undo all 20 steps — verify state at each step
    // ============================================================
    const snapshotsBeforeUndo: string[] = [];
    for (let i = 0; i < 20; i++) {
      snapshotsBeforeUndo.push(JSON.stringify(useEditorStore.getState().project));
      useEditorStore.temporal.getState().undo();
    }

    // After undoing all 20, we should be back to the initial state
    const restoredInitial = useEditorStore.getState();
    expect(restoredInitial.project.tracks[0].clips).toHaveLength(0);
    expect(restoredInitial.project.tracks[1].clips).toHaveLength(0);

    // ============================================================
    // Redo all 20 steps — verify snapshots match
    // ============================================================
    for (let i = 19; i >= 0; i--) {
      useEditorStore.temporal.getState().redo();
      const currentSnapshot = JSON.stringify(useEditorStore.getState().project);
      expect(currentSnapshot).toBe(snapshotsBeforeUndo[i]);
    }

    // Final state should match state after mutation 20
    const finalState = useEditorStore.getState();
    expect(finalState.project.tracks.find((t) => t.id === textTrackId)).toBeUndefined();
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(0);
    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(20);
  });
});
