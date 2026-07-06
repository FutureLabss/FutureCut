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
      {/* Playhead handle (draggable) */}
      <div
        className="pointer-events-auto cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Triangle marker */}
        <div
          className="relative -ml-[5px]"
          style={{ width: "11px" }}
        >
          <svg width="11" height="8" viewBox="0 0 11 8">
            <polygon
              points="0,0 11,0 5.5,8"
              fill="var(--playhead)"
            />
          </svg>
        </div>
      </div>

      {/* Vertical line */}
      <div
        className="w-px mx-auto"
        style={{
          height: `${timelineHeight - 8}px`,
          backgroundColor: "var(--playhead)",
        }}
      />
    </div>
  );
}
