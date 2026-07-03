// ============================================================
// FutureCut — Editor Store (Zustand + zundo undo/redo)
// ============================================================
// This is the core state store for the editor. It holds the
// project state (tracks, clips) and asset registry. All timeline
// mutations go through actions here, which are automatically
// captured by zundo for undo/redo.
//
// Transient UI state (playhead, selection, zoom) lives in
// uiStore.ts to keep it out of undo history.
// ============================================================

import { create } from "zustand";
import { temporal } from "zundo";
import type {
  Asset,
  Clip,
  Project,
  Track,
  TrackType,
  Transition,
  Filter,
  Keyframe,
} from "../model/types";
import { deriveProjectDuration } from "../model/types";
import {
  addClipToTrack,
  addClipToTracks,
  trimClipStart,
  trimClipEnd,
  splitClip,
  deleteClip,
  addTrack,
  removeTrack,
  reorderTrack,
  setTrackVolume,
  setTrackMuted,
  moveClip,
  setClipTransition,
  updateTextProperties,
  addFilterToClip,
  removeFilterFromClip,
  updateClipFilter,
  reorderClipFilters,
  setClipSpeed,
  setClipKeyframe,
  removeClipKeyframe,
} from "../model/operations";
import { generateId } from "../utils/id";
import { speedAdjustedClipDuration } from "../utils/speed";

// ============================================================
// State shape
// ============================================================

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "offline";

export interface EditorState {
  project: Project;
  assets: Record<string, Asset>;
  /** Server-side project ID for persistence */
  serverProjectId: string | null;
  /** Current autosave status */
  saveStatus: SaveStatus;
}

export interface EditorActions {
  /** Register a new asset and add initial clips to both tracks */
  addAsset: (asset: Omit<Asset, "id">) => string;

  /** Trim the start of a clip (adjust sourceInPoint) */
  trimClipStart: (clipId: string, newInPoint: number) => void;

  /** Trim the end of a clip (adjust sourceOutPoint) */
  trimClipEnd: (clipId: string, newOutPoint: number) => void;

  /** Split a clip at the given timeline time */
  splitAtPlayhead: (clipId: string, playheadTime: number) => void;

  /** Delete a clip */
  deleteClip: (clipId: string) => void;

  /** Move a clip to a new start time, optionally changing tracks */
  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;

  // Track actions (Phase 2)
  addTrack: (type: TrackType) => void;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;

  // Clip Specific addition actions (Phase 2)
  addClipToTrack: (
    trackId: string,
    sourceId: string,
    sourceInPoint: number,
    sourceOutPoint: number,
    startTime?: number,
    textProperties?: Partial<Clip>
  ) => void;

  // Transition actions (Phase 2)
  setClipTransition: (
    clipId: string,
    transition: Transition | undefined,
    direction: "in" | "out"
  ) => void;

  // Text overlay actions (Phase 2)
  updateTextProperties: (clipId: string, properties: Partial<Clip>) => void;

  // Phase 3 Creative Tools actions
  addFilterToClip: (clipId: string, filter: Filter) => void;
  removeFilterFromClip: (clipId: string, filterIndex: number) => void;
  updateClipFilter: (clipId: string, filterIndex: number, value: number) => void;
  reorderClipFilters: (clipId: string, sourceIndex: number, targetIndex: number) => void;
  setClipSpeed: (clipId: string, points: { time: number; speed: number }[]) => void;
  setClipKeyframe: (
    clipId: string,
    property: "position.x" | "position.y" | "scale" | "rotation" | "opacity",
    keyframe: Keyframe
  ) => void;
  removeClipKeyframe: (
    clipId: string,
    property: "position.x" | "position.y" | "scale" | "rotation" | "opacity",
    time: number
  ) => void;

  /** Reset the project to initial state */
  resetProject: () => void;

  /** Load project from server */
  loadProject: (project: Project, assets: Record<string, Asset>, serverProjectId: string) => void;

  /** Set the server project ID */
  setServerProjectId: (id: string) => void;

  /** Set the save status */
  setSaveStatus: (status: SaveStatus) => void;
}

// ============================================================
// Initial state
// ============================================================

function createInitialProject(): Project {
  const videoTrackId = generateId();
  const audioTrackId = generateId();

  return {
    id: generateId(),
    name: "Untitled Project",
    fps: 30,
    duration: 0,
    tracks: [
      { id: videoTrackId, type: "video", order: 0, clips: [] },
      {
        id: audioTrackId,
        type: "audio",
        order: 1,
        clips: [],
        muted: false,
        volume: 1.0,
      },
    ],
  };
}

function createInitialState(): EditorState {
  return {
    project: createInitialProject(),
    assets: {},
    serverProjectId: null,
    saveStatus: "saved",
  };
}

// ============================================================
// Store
// ============================================================

export const useEditorStore = create<EditorState & EditorActions>()(
  temporal(
    (set, get) => ({
      ...createInitialState(),

      addAsset: (assetData) => {
        const id = generateId();
        const asset: Asset = { ...assetData, id };

        set((state) => {
          const newTracks = addClipToTracks(
            state.project.tracks,
            id,
            0,
            asset.duration
          );

          return {
            assets: { ...state.assets, [id]: asset },
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });

        return id;
      },

      trimClipStart: (clipId, newInPoint) => {
        set((state) => {
          const newTracks = trimClipStart(
            state.project.tracks,
            clipId,
            newInPoint,
            false
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      trimClipEnd: (clipId, newOutPoint) => {
        set((state) => {
          const clip = state.project.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.id === clipId);
          const sourceDuration = clip
            ? state.assets[clip.sourceId]?.duration ?? Infinity
            : Infinity;

          const newTracks = trimClipEnd(
            state.project.tracks,
            clipId,
            newOutPoint,
            sourceDuration,
            false
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      splitAtPlayhead: (clipId, playheadTime) => {
        set((state) => {
          const newTracks = splitClip(
            state.project.tracks,
            clipId,
            playheadTime
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      deleteClip: (clipId) => {
        set((state) => {
          const newTracks = deleteClip(
            state.project.tracks,
            clipId,
            false
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      moveClip: (clipId, newStartTime, newTrackId) => {
        set((state) => {
          const newTracks = moveClip(
            state.project.tracks,
            clipId,
            newStartTime,
            newTrackId
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      addTrack: (type) => {
        set((state) => {
          const newTracks = addTrack(state.project.tracks, type);
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      removeTrack: (trackId) => {
        set((state) => {
          const newTracks = removeTrack(state.project.tracks, trackId);
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      reorderTrack: (trackId, newOrder) => {
        set((state) => {
          const newTracks = reorderTrack(state.project.tracks, trackId, newOrder);
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      setTrackVolume: (trackId, volume) => {
        set((state) => {
          const newTracks = setTrackVolume(
            state.project.tracks,
            trackId,
            volume
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      setTrackMuted: (trackId, muted) => {
        set((state) => {
          const newTracks = setTrackMuted(
            state.project.tracks,
            trackId,
            muted
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      addClipToTrack: (
        trackId,
        sourceId,
        sourceInPoint,
        sourceOutPoint,
        startTime,
        textProperties
      ) => {
        set((state) => {
          const newTracks = addClipToTrack(
            state.project.tracks,
            trackId,
            sourceId,
            sourceInPoint,
            sourceOutPoint,
            startTime,
            textProperties
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      setClipTransition: (clipId, transition, direction) => {
        set((state) => {
          const newTracks = setClipTransition(
            state.project.tracks,
            clipId,
            transition,
            direction
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      updateTextProperties: (clipId, properties) => {
        set((state) => {
          const newTracks = updateTextProperties(
            state.project.tracks,
            clipId,
            properties
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      // Phase 3 Actions
      addFilterToClip: (clipId, filter) => {
        set((state) => {
          const newTracks = addFilterToClip(
            state.project.tracks,
            clipId,
            filter
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      removeFilterFromClip: (clipId, filterIndex) => {
        set((state) => {
          const newTracks = removeFilterFromClip(
            state.project.tracks,
            clipId,
            filterIndex
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      updateClipFilter: (clipId, filterIndex, value) => {
        set((state) => {
          const newTracks = updateClipFilter(
            state.project.tracks,
            clipId,
            filterIndex,
            value
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      reorderClipFilters: (clipId, sourceIndex, targetIndex) => {
        set((state) => {
          const newTracks = reorderClipFilters(
            state.project.tracks,
            clipId,
            sourceIndex,
            targetIndex
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      setClipSpeed: (clipId, points) => {
        set((state) => {
          const newTracks = setClipSpeed(
            state.project.tracks,
            clipId,
            points
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
              duration: deriveProjectDuration(newTracks),
            },
          };
        });
      },

      setClipKeyframe: (clipId, property, keyframe) => {
        set((state) => {
          const newTracks = setClipKeyframe(
            state.project.tracks,
            clipId,
            property,
            keyframe
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      removeClipKeyframe: (clipId, property, time) => {
        set((state) => {
          const newTracks = removeClipKeyframe(
            state.project.tracks,
            clipId,
            property,
            time
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      resetProject: () => {
        set(createInitialState());
      },

      loadProject: (project, assets, serverProjectId) => {
        set({
          project,
          assets,
          serverProjectId,
          saveStatus: "saved",
        });
      },

      setServerProjectId: (id) => {
        set({ serverProjectId: id });
      },

      setSaveStatus: (status) => {
        set({ saveStatus: status });
      },
    }),
    {
      // zundo configuration
      limit: 50,
      equality: (pastState, currentState) =>
        JSON.stringify(pastState.project) ===
        JSON.stringify(currentState.project),
    }
  )
);

export const useTemporalStore = () =>
  useEditorStore.temporal.getState();
