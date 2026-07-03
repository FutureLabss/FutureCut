"use client";

// ============================================================
// FutureCut — Track Lane
// ============================================================
// A single track row containing clip blocks.
// Supports drag-over and drop to move clips between tracks and
// snap them to the drop location.
// ============================================================

import { useCallback } from "react";
import type { Track } from "@/lib/model/types";
import { ClipBlock } from "./ClipBlock";
import { useEditorStore } from "@/lib/store/editorStore";

interface TrackLaneProps {
  track: Track;
  zoom: number;
}

export function TrackLane({ track, zoom }: TrackLaneProps) {
  const moveClipAction = useEditorStore((s) => s.moveClip);

  // ============================================================
  // Drag and Drop support
  // ============================================================
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const clipId = e.dataTransfer.getData("text/plain");
      const grabOffsetStr = e.dataTransfer.getData("application/grab-offset");
      const grabOffset = grabOffsetStr ? Number(grabOffsetStr) : 0;

      if (!clipId) return;

      // Calculate track-relative X coordinates
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left - grabOffset;
      const newStartTime = Math.max(0, dropX / zoom);

      // Trigger store move action (can transition tracks)
      moveClipAction(clipId, newStartTime, track.id);
    },
    [track.id, zoom, moveClipAction]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative border-b border-[var(--border)] hover:bg-white/[0.02] transition-colors"
      style={{ height: "var(--track-height)" }}
    >
      {/* Clips */}
      {track.clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          zoom={zoom}
          trackType={track.type}
        />
      ))}
    </div>
  );
}
