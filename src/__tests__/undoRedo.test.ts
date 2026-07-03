// ============================================================
// FutureCut — Undo/Redo Unit Tests
// ============================================================
// Tests the correctness of the Zustand store and Zundo
// undo/redo integration for timeline mutations.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/lib/store/editorStore";
import { clipDuration } from "@/lib/model/types";

describe("Undo/Redo integration", () => {
  beforeEach(() => {
    // Reset the store before each test
    useEditorStore.getState().resetProject();
    useEditorStore.temporal.getState().clear();
  });

  it("should track timeline mutations and support undo/redo", () => {
    const store = useEditorStore.getState();
    const temporal = useEditorStore.temporal.getState();

    // 1. Initial state has empty tracks
    expect(store.project.tracks[0].clips).toHaveLength(0);
    expect(temporal.pastStates).toHaveLength(0);

    // 2. Add an asset (creates clips on both tracks)
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

    // Note: zundo equality checks might prevent asset registration if project matches,
    // but here the project track clips changed, so it should record a history state.
    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(1);

    // 3. Perform a mutation (e.g., trim end of the clip to 8 seconds)
    useEditorStore.getState().trimClipEnd(originalClipId, 8);
    
    let updatedState = useEditorStore.getState();
    expect(clipDuration(updatedState.project.tracks[0].clips[0])).toBe(8);
    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(2);

    // 4. Undo the trim mutation
    useEditorStore.temporal.getState().undo();
    
    let stateAfterUndo = useEditorStore.getState();
    expect(clipDuration(stateAfterUndo.project.tracks[0].clips[0])).toBe(10);
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(1);

    // 5. Redo the trim mutation
    useEditorStore.temporal.getState().redo();
    
    let stateAfterRedo = useEditorStore.getState();
    expect(clipDuration(stateAfterRedo.project.tracks[0].clips[0])).toBe(8);
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(0);
  });

  it("should handle undo/redo for splitting a clip", () => {
    const store = useEditorStore.getState();
    const temporal = useEditorStore.temporal.getState();

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
    const originalClipId = stateAfterAdd.project.tracks[0].clips[0].id;

    // Split clip at 4s mark
    useEditorStore.getState().splitAtPlayhead(originalClipId, 4);

    let stateAfterSplit = useEditorStore.getState();
    expect(stateAfterSplit.project.tracks[0].clips).toHaveLength(2);

    // Undo the split
    useEditorStore.temporal.getState().undo();
    let stateAfterUndo = useEditorStore.getState();
    expect(stateAfterUndo.project.tracks[0].clips).toHaveLength(1);

    // Redo the split
    useEditorStore.temporal.getState().redo();
    let stateAfterRedo = useEditorStore.getState();
    expect(stateAfterRedo.project.tracks[0].clips).toHaveLength(2);
  });

  it("should handle undo/redo for deleting a clip", () => {
    const store = useEditorStore.getState();
    const temporal = useEditorStore.temporal.getState();

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
    const originalClipId = stateAfterAdd.project.tracks[0].clips[0].id;

    // Delete the clip
    useEditorStore.getState().deleteClip(originalClipId);

    let stateAfterDelete = useEditorStore.getState();
    expect(stateAfterDelete.project.tracks[0].clips).toHaveLength(0);

    // Undo delete
    useEditorStore.temporal.getState().undo();
    let stateAfterUndo = useEditorStore.getState();
    expect(stateAfterUndo.project.tracks[0].clips).toHaveLength(1);
    expect(stateAfterUndo.project.tracks[0].clips[0].id).toBe(originalClipId);

    // Redo delete
    useEditorStore.temporal.getState().redo();
    let stateAfterRedo = useEditorStore.getState();
    expect(stateAfterRedo.project.tracks[0].clips).toHaveLength(0);
  });
});
