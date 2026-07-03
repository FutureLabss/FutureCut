"use client";

// ============================================================
// FutureCut — Time Ruler
// ============================================================
// Horizontal ruler showing time markings above the tracks.
// Adapts tick density based on zoom level.
// ============================================================

import { useMemo } from "react";
import { formatTimeShort } from "@/lib/utils/time";

interface TimeRulerProps {
  duration: number;
  zoom: number;
  width: number;
}

export function TimeRuler({ duration, zoom, width }: TimeRulerProps) {
  // Calculate tick interval based on zoom level
  const tickInterval = useMemo(() => {
    const pixelsPerTick = 80; // Target spacing between labels
    const secondsPerTick = pixelsPerTick / zoom;

    // Snap to nice intervals: 0.5, 1, 2, 5, 10, 15, 30, 60
    const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    return (
      niceIntervals.find((i) => i >= secondsPerTick) ??
      niceIntervals[niceIntervals.length - 1]
    );
  }, [zoom]);

  // Generate tick marks
  const ticks = useMemo(() => {
    const result: { time: number; x: number; isLabel: boolean }[] = [];
    const maxTime = duration + 5; // Extra space past the end

    for (let time = 0; time <= maxTime; time += tickInterval) {
      result.push({
        time,
        x: time * zoom,
        isLabel: true,
      });

      // Add sub-ticks (smaller divisions between labels)
      if (tickInterval >= 2) {
        const subInterval = tickInterval / 4;
        for (let sub = subInterval; sub < tickInterval; sub += subInterval) {
          const subTime = time + sub;
          if (subTime <= maxTime) {
            result.push({
              time: subTime,
              x: subTime * zoom,
              isLabel: false,
            });
          }
        }
      }
    }

    return result;
  }, [duration, zoom, tickInterval]);

  return (
    <div
      className="relative h-6 border-b border-[var(--border)] bg-[var(--bg-surface)]"
      style={{ width: `${width}px` }}
    >
      {ticks.map((tick, i) => (
        <div
          key={i}
          className="absolute top-0"
          style={{ left: `${tick.x}px` }}
        >
          {/* Tick line */}
          <div
            className="bg-[var(--ruler-mark)]"
            style={{
              width: "1px",
              height: tick.isLabel ? "10px" : "5px",
              marginTop: tick.isLabel ? "0" : "5px",
            }}
          />

          {/* Label */}
          {tick.isLabel && (
            <span
              className="absolute top-2.5 text-[10px] text-[var(--ruler-text)] whitespace-nowrap font-mono"
              style={{ left: "3px" }}
            >
              {formatTimeShort(tick.time)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
