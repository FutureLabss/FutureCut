"use client";

// ============================================================
// FutureCut — Playhead
// ============================================================
// Vertical line indicator showing the current playback position.
// Draggable for scrubbing.
// ============================================================

import { useRef, useCallback } from "react";
import { useUIStore } from "@/lib/store/uiStore";

interface PlayheadProps {
  zoom: number;
  timelineHeight: number;
}

export function Playhead({ zoom, timelineHeight }: PlayheadProps) {
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setPlayhead = useUIStore((s) => s.setPlayhead);
  const setIsPlaying = useUIStore((s) => s.setIsPlaying);
  const isDragging = useRef(false);

  const x = playheadTime * zoom;

  // ============================================================
  // Drag to scrub
  // ============================================================
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      setIsPlaying(false);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;

        // Find the timeline container to calculate position
        const container = (e.target as HTMLElement).closest(
          "[data-timeline-scroll]"
        ) as HTMLElement | null;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const mouseX = moveEvent.clientX - rect.left + scrollLeft;
        const time = Math.max(0, mouseX / zoom);
        setPlayhead(time);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [zoom, setPlayhead, setIsPlaying]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      isDragging.current = true;
      setIsPlaying(false);

      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (!isDragging.current) return;

        // Find the timeline container to calculate position
        const container = (e.target as HTMLElement).closest(
          "[data-timeline-scroll]"
        ) as HTMLElement | null;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const mouseX = moveEvent.touches[0].clientX - rect.left + scrollLeft;
        const time = Math.max(0, mouseX / zoom);
        setPlayhead(time);
      };

      const handleTouchEnd = () => {
        isDragging.current = false;
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };

      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    },
    [zoom, setPlayhead, setIsPlaying]
  );

  return (
    <div
      className="absolute top-0 z-30 pointer-events-none"
      style={{
        left: `${x}px`,
        height: `${timelineHeight}px`,
      }}
    >
      {/* Playhead handle (draggable purple diamond cap) */}
      <div
        className="pointer-events-auto cursor-grab active:cursor-grabbing relative -ml-[7px] flex flex-col items-center group"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Diamond cap matching stitch/mainScreen.png */}
        <div className="w-3.5 h-3.5 bg-purple-500 border border-purple-300 rounded-sm rotate-45 shadow-[0_0_12px_rgba(168,85,247,0.8)] group-hover:scale-110 transition-transform" />
      </div>

      {/* Vertical line matching stitch/mainScreen.png */}
      <div
        className="w-[2px] -ml-[1px] bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
        style={{
          height: `${timelineHeight - 12}px`,
        }}
      />
    </div>
  );
}
