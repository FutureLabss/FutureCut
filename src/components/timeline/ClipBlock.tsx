"use client";

// ============================================================
// FutureCut — Clip Block
// ============================================================
// Visual representation of a clip on the timeline.
// Supports:
// - Selection (click)
// - Trim handles (drag left/right edges)
// - Drag-and-drop to move clip between tracks
// - Distinct colors & details for video, audio, and text clips
// ============================================================

import { useRef, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { clipDuration } from "@/lib/model/types";
import type { Clip, TrackType } from "@/lib/model/types";

interface ClipBlockProps {
  clip: Clip;
  zoom: number;
  trackType: TrackType;
}

type DragMode = "trim-start" | "trim-end" | null;

export function ClipBlock({ clip, zoom, trackType }: ClipBlockProps) {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const selectClip = useUIStore((s) => s.selectClip);
  const assets = useEditorStore((s) => s.assets);
  const trimStart = useEditorStore((s) => s.trimClipStart);
  const trimEnd = useEditorStore((s) => s.trimClipEnd);

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{ x: number; originalValue: number }>({
    x: 0,
    originalValue: 0,
  });

  const isSelected = selectedClipId === clip.id;
  const duration = clipDuration(clip);
  const width = duration * zoom;
  const left = clip.startTime * zoom;

  // Resolve display name
  let clipName = "Clip";
  if (trackType === "text") {
    clipName = clip.text ? `"${clip.text}"` : "Text Overlay";
  } else {
    const asset = assets[clip.sourceId];
    clipName = asset?.fileName ?? "Media Clip";
  }

  // ============================================================
  // Trim drag handlers
  // ============================================================
  const handleTrimMouseDown = useCallback(
    (e: React.MouseEvent, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();

      setDragMode(mode);
      dragStartRef.current = {
        x: e.clientX,
        originalValue:
          mode === "trim-start" ? clip.sourceInPoint : clip.sourceOutPoint,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - dragStartRef.current.x;
        const deltaTime = deltaX / zoom;

        if (mode === "trim-start") {
          const newInPoint = dragStartRef.current.originalValue + deltaTime;
          trimStart(clip.id, newInPoint);
        } else if (mode === "trim-end") {
          const newOutPoint = dragStartRef.current.originalValue + deltaTime;
          trimEnd(clip.id, newOutPoint);
        }
      };

      const handleMouseUp = () => {
        setDragMode(null);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [clip, zoom, trimStart, trimEnd]
  );

  const handleTrimTouchStart = useCallback(
    (e: React.TouchEvent, mode: DragMode) => {
      e.stopPropagation();

      setDragMode(mode);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        originalValue:
          mode === "trim-start" ? clip.sourceInPoint : clip.sourceOutPoint,
      };

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const deltaX = moveEvent.touches[0].clientX - dragStartRef.current.x;
        const deltaTime = deltaX / zoom;

        if (mode === "trim-start") {
          const newInPoint = dragStartRef.current.originalValue + deltaTime;
          trimStart(clip.id, newInPoint);
        } else if (mode === "trim-end") {
          const newOutPoint = dragStartRef.current.originalValue + deltaTime;
          trimEnd(clip.id, newOutPoint);
        }
      };

      const handleTouchEnd = () => {
        setDragMode(null);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };

      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    },
    [clip, zoom, trimStart, trimEnd]
  );

  // ============================================================
  // Selection
  // ============================================================
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id);
    },
    [clip.id, selectClip]
  );

  // ============================================================
  // HTML5 Drag and Drop for moving clip
  // ============================================================
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Set values to read back during onDrop in TrackLane
      e.dataTransfer.setData("text/plain", clip.id);
      
      // Store cursor offset within the clip to drop it accurately
      const rect = e.currentTarget.getBoundingClientRect();
      const grabOffset = e.clientX - rect.left;
      e.dataTransfer.setData("application/grab-offset", String(grabOffset));
      
      e.dataTransfer.effectAllowed = "move";
    },
    [clip.id]
  );

  // ============================================================
  // Colors (distinct visual identity per type)
  // ============================================================
  let bgColor = "var(--clip-bg)"; // Blue for video
  let bgHoverColor = "var(--clip-bg-hover)";

  if (trackType === "audio") {
    bgColor = "#16a34a"; // Green
    bgHoverColor = "#22c55e";
  } else if (trackType === "text") {
    bgColor = "#ea580c"; // Orange
    bgHoverColor = "#f97316";
  }

  if (isSelected) {
    bgColor = "var(--clip-selected)"; // Indigo
    bgHoverColor = "var(--accent-hover)";
  }

  return (
    <div
      data-clip
      draggable={!dragMode}
      onDragStart={handleDragStart}
      className="absolute top-1.5 bottom-1.5 rounded-2xl cursor-grab active:cursor-grabbing group transition-all duration-100 flex items-center justify-between border border-white/20 shadow-lg"
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 10)}px`,
        backgroundColor: bgColor,
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!dragMode) {
          e.currentTarget.style.backgroundColor = bgHoverColor;
        }
      }}
      onMouseLeave={(e) => {
        if (!dragMode) {
          e.currentTarget.style.backgroundColor = bgColor;
        }
      }}
    >
      {/* Selection border highlight */}
      {isSelected && (
        <div className="absolute inset-0 rounded-2xl ring-2 ring-purple-400 pointer-events-none" />
      )}

      {/* Clip Icon Badge & Details matching stitch/mainScreen.png */}
      <div className="absolute inset-0 flex items-center gap-2 px-3 overflow-hidden pointer-events-none select-none">
        {/* Track Icon Badge */}
        <div className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center shrink-0 text-white">
          {trackType === "video" && (
            <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {trackType === "audio" && (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
            </svg>
          )}
          {trackType === "text" && (
            <span className="text-xs font-bold font-outfit">T</span>
          )}
        </div>

        <span className="text-xs font-semibold text-white truncate">
          {clipName}
        </span>
      </div>

      {/* Left trim handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-white/20 rounded-l-md transition-colors z-10 flex items-center justify-center pointer-events-auto"
        onMouseDown={(e) => handleTrimMouseDown(e, "trim-start")}
        onTouchStart={(e) => handleTrimTouchStart(e, "trim-start")}
      >
        <div className="w-0.5 h-4 bg-white/40 rounded-full group-hover:bg-white/60" />
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-white/20 rounded-r-md transition-colors z-10 flex items-center justify-center pointer-events-auto"
        onMouseDown={(e) => handleTrimMouseDown(e, "trim-end")}
        onTouchStart={(e) => handleTrimTouchStart(e, "trim-end")}
      >
        <div className="w-0.5 h-4 bg-white/40 rounded-full group-hover:bg-white/60" />
      </div>

      {/* Keyframe Diamond Indicators (Phase 3) */}
      {clip.keyframedProps && clip.keyframedProps.length > 0 && (
        <div className="absolute left-0 right-0 bottom-1 h-2 pointer-events-none flex items-center">
          {Array.from(
            new Set(
              clip.keyframedProps.flatMap((track) => track.keyframes.map((k) => k.time))
            )
          ).map((time, idx) => {
            const pct = (time / duration) * 100;
            return (
              <div
                key={idx}
                className="absolute w-1.5 h-1.5 bg-yellow-400 rotate-45 border border-amber-600 shadow-sm"
                style={{ left: `calc(${pct}% - 3px)` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
