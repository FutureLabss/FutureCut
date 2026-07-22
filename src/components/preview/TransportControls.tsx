"use client";

// ============================================================
// FutureCut — Transport Controls
// ============================================================
// Play/Pause, timecode display, and playback controls.
// Positioned below the preview canvas.
// ============================================================

import { useUIStore } from "@/lib/store/uiStore";
import { useEditorStore } from "@/lib/store/editorStore";
import { formatTimecode } from "@/lib/utils/time";

export function TransportControls() {
  const playheadTime = useUIStore((s) => s.playheadTime);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const isDecoding = useUIStore((s) => s.isDecoding);
  const togglePlay = useUIStore((s) => s.togglePlay);
  const setPlayhead = useUIStore((s) => s.setPlayhead);
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useUIStore((s) => s.selectedClipId);

  const handleSplit = () => {
    if (selectedClipId) {
      useEditorStore.getState().splitAtPlayhead(selectedClipId, playheadTime);
    }
  };

  const handleDelete = () => {
    if (selectedClipId) {
      useEditorStore.getState().deleteClip(selectedClipId);
      useUIStore.getState().selectClip(null);
    }
  };

  const handleStepBack = () => {
    const frameDuration = 1 / project.fps;
    setPlayhead(Math.max(0, playheadTime - frameDuration));
  };

  const handleStepForward = () => {
    const frameDuration = 1 / project.fps;
    setPlayhead(playheadTime + frameDuration);
  };

  const timelineZoom = useUIStore((s) => s.timelineZoom);
  const setZoom = useUIStore((s) => s.setZoom);

  return (
    <div className="flex items-center justify-between gap-5 mt-4 px-5 py-2.5 rounded-2xl bg-[#121422]/90 backdrop-blur-xl border border-white/10 shadow-2xl z-10 max-w-2xl w-full">
      {/* Playback Controls matching stitch/mainScreen.png */}
      <div className="flex items-center gap-1">
        {/* Play/Pause square button */}
        <button
          onClick={togglePlay}
          disabled={isDecoding}
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-30"
          title={isDecoding ? "Preparing video…" : isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Pause */}
        <button
          onClick={togglePlay}
          disabled={isDecoding}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
          title="Pause"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>

        {/* Step back */}
        <button
          onClick={handleStepBack}
          disabled={isDecoding}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
          title="Step back one frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm12 12l-8.5-6L18 6z" />
          </svg>
        </button>

        {/* Loop / Reset */}
        <button
          onClick={() => setPlayhead(0)}
          disabled={isDecoding}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
          title="Restart from beginning"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Step forward */}
        <button
          onClick={handleStepForward}
          disabled={isDecoding}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
          title="Step forward one frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Timecode display */}
      <div className="font-mono text-base font-bold text-white tracking-wider">
        {formatTimecode(playheadTime, project.fps)}
      </div>

      {/* Preview Zoom Controls */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="font-medium">Zoom</span>
        <button
          onClick={() => setZoom(Math.max(10, timelineZoom - 20))}
          className="hover:text-white transition-colors"
          title="Zoom out"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </button>
        <input
          type="range"
          min="10"
          max="500"
          value={timelineZoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-20 h-1 accent-purple-500 cursor-pointer"
        />
        <button
          onClick={() => setZoom(Math.min(500, timelineZoom + 20))}
          className="hover:text-white transition-colors"
          title="Zoom in"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
