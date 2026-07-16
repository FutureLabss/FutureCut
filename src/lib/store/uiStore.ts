// ============================================================
// FutureCut — UI Store (Transient State)
// ============================================================
// Holds ephemeral UI state that should NOT be part of undo/redo:
// playhead position, play state, selection, zoom level, etc.
// ============================================================

import { create } from "zustand";

export interface UIState {
  /** Current playhead time in seconds */
  playheadTime: number;
  /** Whether the preview is actively playing */
  isPlaying: boolean;
  /** Currently selected clip ID, or null */
  selectedClipId: string | null;
  /** Timeline zoom level: pixels per second */
  timelineZoom: number;
  /** Timeline horizontal scroll offset in pixels */
  timelineScrollX: number;
  /** Whether the export dialog is open */
  isExporting: boolean;
  /** Export progress 0-100, null if not exporting */
  exportProgress: number | null;
  /** Whether the preview engine is buffering (decoder behind playhead) */
  isBuffering: boolean;
  /** Whether the preview engine is still decoding the initial video */
  isDecoding: boolean;
  /** Decode progress 0–100 (null when not decoding) */
  decodeProgress: number | null;
}

export interface UIActions {
  setPlayhead: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  selectClip: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setScrollX: (x: number) => void;
  setExporting: (exporting: boolean) => void;
  setExportProgress: (progress: number | null) => void;
  setBuffering: (buffering: boolean) => void;
  setDecoding: (decoding: boolean) => void;
  setDecodeProgress: (progress: number | null) => void;
}

const MIN_ZOOM = 10; // 10px per second (zoomed out)
const MAX_ZOOM = 500; // 500px per second (zoomed in)

export const useUIStore = create<UIState & UIActions>()((set) => ({
  // Initial state
  playheadTime: 0,
  isPlaying: false,
  selectedClipId: null,
  timelineZoom: 100, // 100px per second is a good default
  timelineScrollX: 0,
  isExporting: false,
  exportProgress: null,
  isBuffering: false,
  isDecoding: false,
  decodeProgress: null,

  // Actions
  setPlayhead: (time) => set({ playheadTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  selectClip: (id) => set({ selectedClipId: id }),
  setZoom: (zoom) =>
    set({ timelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setScrollX: (x) => set({ timelineScrollX: Math.max(0, x) }),
  setExporting: (exporting) =>
    set({ isExporting: exporting, exportProgress: exporting ? 0 : null }),
  setExportProgress: (progress) => set({ exportProgress: progress }),
  setBuffering: (buffering) => set({ isBuffering: buffering }),
  setDecoding: (decoding) => set({ isDecoding: decoding }),
  setDecodeProgress: (progress) => set({ decodeProgress: progress }),
}));
