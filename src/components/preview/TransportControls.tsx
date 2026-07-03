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

  return (
    <div className="flex items-center gap-4 mt-3 px-4 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border)]">
      {/* Timecode */}
      <div className="font-mono text-sm text-[var(--text-secondary)] min-w-[90px]">
        {formatTimecode(playheadTime, project.fps)}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-1">
        {/* Skip to start */}
        <button
          onClick={() => setPlayhead(0)}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Go to start"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Step back one frame */}
        <button
          onClick={handleStepBack}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Step back one frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm12 12l-8.5-6L18 6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors"
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Step forward one frame */}
        <button
          onClick={handleStepForward}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Step forward one frame"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>

        {/* Skip to end */}
        <button
          onClick={() => setPlayhead(project.duration)}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Go to end"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Duration */}
      <div className="font-mono text-sm text-[var(--text-muted)] min-w-[90px] text-right">
        {formatTimecode(project.duration, project.fps)}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--border)] mx-1" />

      {/* Edit controls */}
      <div className="flex items-center gap-1">
        {/* Split */}
        <button
          onClick={handleSplit}
          disabled={!selectedClipId}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Split at playhead (S)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M5 12h14" strokeLinecap="round" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={!selectedClipId}
          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--danger)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Delete clip (Delete)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
