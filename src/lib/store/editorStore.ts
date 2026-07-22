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
  TrackType,
  Transition,
  Filter,
  Keyframe,
} from "../model/types";
import { deriveProjectDuration, clipEndTime } from "../model/types";
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
  applyAutoReframe,
  setClipDenoised,
} from "../model/operations";
import { generateId } from "../utils/id";

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

  // Phase 5 AI Actions
  applyCaptions: (words: { text: string; startTime: number; endTime: number; speakerId?: string }[]) => void;
  applyAutoReframe: (
    clipId: string,
    targetAspectRatio: "9:16" | "1:1" | "4:5" | "16:9",
    cropKeyframes: { time: number; x: number; y: number; scale: number }[]
  ) => void;
  splitClipAtTimes: (clipId: string, times: number[]) => void;
  applyDenoisedAudio: (clipId: string, processedAudioAssetId: string, fileName: string) => void;
  setClipDenoised: (clipId: string, isDenoised: boolean) => void;

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

      // Phase 5 AI Actions
      applyCaptions: (words) => {
        set((state) => {
          let currentTracks = [...state.project.tracks];
          let textTrack = currentTracks.find((t) => t.type === "text");
          if (!textTrack) {
            currentTracks = addTrack(currentTracks, "text");
            textTrack = currentTracks[currentTracks.length - 1];
          }

          const textTrackId = textTrack.id;
          currentTracks = currentTracks.map((t) => {
            if (t.id === textTrackId) {
              return { ...t, clips: [] };
            }
            return t;
          });

          const segments: { text: string; startTime: number; endTime: number }[] = [];
          let currentSegment: { text: string[]; startTime: number; endTime: number } | null = null;

          for (const w of words) {
            if (!currentSegment) {
              currentSegment = {
                text: [w.text],
                startTime: w.startTime,
                endTime: w.endTime,
              };
            } else {
              const gap = w.startTime - currentSegment.endTime;
              if (
                currentSegment.text.length >= 5 ||
                gap > 1.5 ||
                (w.endTime - currentSegment.startTime) > 3.0
              ) {
                segments.push({
                  text: currentSegment.text.join(" "),
                  startTime: currentSegment.startTime,
                  endTime: currentSegment.endTime,
                });
                currentSegment = {
                  text: [w.text],
                  startTime: w.startTime,
                  endTime: w.endTime,
                };
              } else {
                currentSegment.text.push(w.text);
                currentSegment.endTime = w.endTime;
              }
            }
          }
          if (currentSegment) {
            segments.push({
              text: currentSegment.text.join(" "),
              startTime: currentSegment.startTime,
              endTime: currentSegment.endTime,
            });
          }

          for (const seg of segments) {
            currentTracks = addClipToTrack(
              currentTracks,
              textTrackId,
              "text",
              0,
              seg.endTime - seg.startTime,
              seg.startTime,
              {
                text: seg.text,
                fontFamily: "Outfit",
                fontSize: 24,
                color: "#FFFFFF",
                position: { x: 0.5, y: 0.8 },
                animation: "none",
              }
            );
          }

          return {
            project: {
              ...state.project,
              tracks: currentTracks,
              duration: deriveProjectDuration(currentTracks),
            },
          };
        });
      },

      applyAutoReframe: (clipId, targetAspectRatio, cropKeyframes) => {
        set((state) => {
          const newTracks = applyAutoReframe(
            state.project.tracks,
            clipId,
            targetAspectRatio,
            cropKeyframes
          );
          return {
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      splitClipAtTimes: (clipId, times) => {
        set((state) => {
          let currentTracks = state.project.tracks;
          const sortedTimes = [...times].sort((a, b) => a - b);
          
          const track = currentTracks.find(t => t.clips.some(c => c.id === clipId));
          if (!track) return state;
          const trackId = track.id;

          for (const splitTime of sortedTimes) {
            const activeClip = currentTracks
              .find(t => t.id === trackId)
              ?.clips.find(c => splitTime > c.startTime && splitTime < clipEndTime(c));
            
            if (activeClip) {
              currentTracks = splitClip(currentTracks, activeClip.id, splitTime);
            }
          }

          const newDuration = deriveProjectDuration(currentTracks);
          return {
            project: {
              ...state.project,
              tracks: currentTracks,
              duration: newDuration,
            }
          };
        });
      },

      applyDenoisedAudio: (clipId, processedAudioAssetId, fileName) => {
        set((state) => {
          const clip = state.project.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.id === clipId);
          if (!clip) return state;

          const originalAsset = state.assets[clip.sourceId];
          if (!originalAsset) return state;

          const denoisedAsset: Asset = {
            ...originalAsset,
            id: processedAudioAssetId,
            fileName,
          };

          const newTracks = setClipDenoised(
            state.project.tracks,
            clipId,
            true,
            processedAudioAssetId
          );

          return {
            assets: { ...state.assets, [processedAudioAssetId]: denoisedAsset },
            project: {
              ...state.project,
              tracks: newTracks,
            },
          };
        });
      },

      setClipDenoised: (clipId, isDenoised) => {
        set((state) => {
          const newTracks = setClipDenoised(
            state.project.tracks,
            clipId,
            isDenoised
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
