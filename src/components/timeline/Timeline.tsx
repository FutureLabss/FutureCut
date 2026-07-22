"use client";

// ============================================================
// FutureCut — Timeline UI (Phase 2 Multi-Track)
// ============================================================
// Layout containing:
// - Left column: Track headers (track type labels, volume/mute sliders, layer reordering buttons, track deletion)
// - Right column: Scrollable time ruler, track lanes (clips mapping), playhead indicators
// - Top toolbar: Track additions (+Video, +Audio, +Text) and clip additions (+Text Overlay)
// ============================================================

import { useRef, useCallback } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { TimeRuler } from "./TimeRuler";
import { TrackLane } from "./TrackLane";
import { Playhead } from "./Playhead";
import type { Track } from "@/lib/model/types";

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const project = useEditorStore((s) => s.project);
  const addTrack = useEditorStore((s) => s.addTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const reorderTrack = useEditorStore((s) => s.reorderTrack);
  const setTrackVolume = useEditorStore((s) => s.setTrackVolume);
  const setTrackMuted = useEditorStore((s) => s.setTrackMuted);
  const addClipToTrack = useEditorStore((s) => s.addClipToTrack);

  const timelineZoom = useUIStore((s) => s.timelineZoom);
  const setZoom = useUIStore((s) => s.setZoom);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setPlayhead = useUIStore((s) => s.setPlayhead);
  const setIsPlaying = useUIStore((s) => s.setIsPlaying);

  // Stacking order: sort tracks by order ascending (draw bottom-to-top, but UI displays top-down)
  // Let's sort them so video/text tracks are on top of audio tracks visually
  const sortedTracks = [...project.tracks].sort((a, b) => {
    // Sort type first: text/video tracks on top, audio tracks below
    const typeWeights = { text: 0, video: 1, audio: 2 };
    if (typeWeights[a.type] !== typeWeights[b.type]) {
      return typeWeights[a.type] - typeWeights[b.type];
    }
    // If same type, sort by custom order (descending for video, so higher order is on top)
    return b.order - a.order;
  });

  const timelineWidth = Math.max(project.duration * timelineZoom + 200, 800);

  // ============================================================
  // Reordering helpers
  // ============================================================
  const moveTrackUp = (track: Track) => {
    // Up in stacking order (higher order index)
    reorderTrack(track.id, track.order + 1);
  };

  const moveTrackDown = (track: Track) => {
    // Down in stacking order
    reorderTrack(track.id, Math.max(0, track.order - 1));
  };

  // ============================================================
  // Add Text Clip helper
  // ============================================================
  const handleAddText = (trackId: string) => {
    addClipToTrack(
      trackId,
      "text", // dummy asset ID
      0,
      4.0, // default 4 seconds duration
      playheadTime, // place at playhead
      {
        text: "New Text Overlay",
        fontSize: 48,
        fontFamily: "Inter, sans-serif",
        color: "#ffffff",
        position: { x: 0.5, y: 0.5 },
        animation: "fadeIn",
      }
    );
  };

  // ============================================================
  // Zoom & Scrubbing Click
  // ============================================================
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(timelineZoom + delta);
      }
    },
    [timelineZoom, setZoom]
  );

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if ((e.target as HTMLElement).closest("[data-clip]")) return;

      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const time = Math.max(0, x / timelineZoom);

      setPlayhead(time);
      setIsPlaying(false);
    },
    [timelineZoom, setPlayhead, setIsPlaying]
  );

  return (
    <div className="bg-[var(--bg-panel)] flex flex-col min-h-[var(--timeline-height)] select-none">
      {/* 1. Timeline Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex gap-2">
          <button
            onClick={() => addTrack("video")}
            className="px-2 py-1 text-[10px] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-[var(--text-primary)] transition-colors"
          >
            + Video Track
          </button>
          <button
            onClick={() => addTrack("audio")}
            className="px-2 py-1 text-[10px] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-[var(--text-primary)] transition-colors"
          >
            + Audio Track
          </button>
          <button
            onClick={() => addTrack("text")}
            className="px-2 py-1 text-[10px] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-[var(--text-primary)] transition-colors"
          >
            + Text Track
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Zoom</span>
          <input
            type="range"
            min="10"
            max="500"
            value={timelineZoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 h-1 accent-[var(--accent)] cursor-pointer"
          />
        </div>
      </div>

      {/* 2. Left headers + Right tracks main content split */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Column: Track Headers */}
        <div className="w-[60px] sm:w-[200px] border-r border-[var(--border)] bg-[var(--bg-panel)] shrink-0 flex flex-col select-none">
          {/* Alignment placeholder matching TimeRuler height */}
          <div className="h-6 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0" />

          {sortedTracks.map((track) => (
            <div
              key={track.id}
              className="h-[var(--track-height)] border-b border-[var(--border)] flex flex-col justify-between p-1.5 shrink-0 bg-[var(--bg-surface)]/20"
            >
              {/* Type, name, delete */}
              <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start h-full sm:h-auto gap-0.5 sm:gap-0">
                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      track.type === "video"
                        ? "bg-[var(--accent)]"
                        : track.type === "audio"
                          ? "bg-green-500"
                          : "bg-orange-500"
                    }`}
                  />
                  <span className="text-[10px] font-bold text-[var(--text-primary)] truncate uppercase hidden sm:block">
                    {track.type} (Lvl {track.order})
                  </span>
                  <span className="text-[9px] font-bold text-[var(--text-primary)] uppercase sm:hidden leading-none">
                    {track.type[0].toUpperCase()}{track.type !== "audio" ? track.order : ""}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1">
                  {/* Stacking Order buttons */}
                  {track.type !== "audio" && (
                    <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 leading-none">
                      <button
                        onClick={() => moveTrackUp(track)}
                        className="text-[9px] hover:text-[var(--text-primary)] text-[var(--text-muted)] p-0.5 sm:p-0"
                        title="Bring Layer Forward"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveTrackDown(track)}
                        className="text-[9px] hover:text-[var(--text-primary)] text-[var(--text-muted)] p-0.5 sm:p-0"
                        title="Send Layer Backward"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  {/* Add Text overlay helper */}
                  {track.type === "text" && (
                    <button
                      onClick={() => handleAddText(track.id)}
                      className="text-[9px] text-[var(--accent)] hover:text-white font-bold px-1"
                      title="Add Text Clip at Playhead"
                    >
                      +T
                    </button>
                  )}
                  {/* Delete track */}
                  <button
                    onClick={() => removeTrack(track.id)}
                    className="text-[9px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                    title="Delete Track"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Audio Controls */}
              {track.type === "audio" && (
                <div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1 w-full justify-center sm:justify-start">
                  {/* Mute toggle button */}
                  <button
                    onClick={() => setTrackMuted(track.id, !track.muted)}
                    className={`text-[8px] sm:text-[9px] px-1 py-0.5 rounded transition-colors ${
                      track.muted
                        ? "bg-[var(--danger)] text-white"
                        : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white"
                    }`}
                  >
                    {track.muted ? "MUTED" : "MUTE"}
                  </button>

                  {/* Volume Slider */}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={track.volume ?? 1.0}
                    onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
                    className="flex-1 h-1 accent-green-500 cursor-pointer hidden sm:block"
                    title="Volume"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right Column: Scrollable Tracks Lanes */}
        <div
          ref={containerRef}
          data-timeline-scroll
          className="flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={handleWheel}
          onClick={handleTimelineClick}
        >
          <div
            className="relative select-none"
            style={{ width: `${timelineWidth}px`, minHeight: "100%" }}
          >
            {/* Time ruler */}
            <TimeRuler
              duration={project.duration}
              zoom={timelineZoom}
              width={timelineWidth}
            />

            {/* Render tracks in matching layout order */}
            {sortedTracks.map((track) => (
              <TrackLane key={track.id} track={track} zoom={timelineZoom} />
            ))}

            {/* Playhead */}
            <Playhead zoom={timelineZoom} timelineHeight={300} />
          </div>
        </div>
      </div>

      {/* Bottom-right timeline zoom control matching stitch/mainScreen.png */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-white/10 bg-[#0d0e17] shrink-0 text-xs text-gray-400">
        <span className="font-medium">Zoom</span>
        <button
          onClick={() => setZoom(Math.max(10, timelineZoom - 20))}
          className="hover:text-white transition-colors"
          title="Zoom Out"
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
          className="w-24 h-1 accent-purple-500 cursor-pointer"
        />
        <button
          onClick={() => setZoom(Math.min(500, timelineZoom + 20))}
          className="hover:text-white transition-colors"
          title="Zoom In"
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
