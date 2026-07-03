"use client";

// ============================================================
// FutureCut — Clip Properties Panel (Phase 3 Creative Tools)
// ============================================================
// Sidebar showing detailed configuration settings for the
// currently selected video or text clip:
// - Timeline Info
// - Filters stack (add/remove filters: brightness, contrast, saturation, LUTs)
// - Speed curves (constant speed multiplier, simple ramps editor)
// - Keyframe Animation Tracks (position X/Y, scale, rotation, opacity)
// ============================================================

import { useState } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { clipDuration } from "@/lib/model/types";
import type { Filter, Keyframe } from "@/lib/model/types";

export function ClipPropertiesPanel() {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const selectClip = useUIStore((s) => s.selectClip);
  const playheadTime = useUIStore((s) => s.playheadTime);
  
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const setClipTransition = useEditorStore((s) => s.setClipTransition);
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties);
  const deleteClipAction = useEditorStore((s) => s.deleteClip);

  // Phase 3 Actions
  const addFilter = useEditorStore((s) => s.addFilterToClip);
  const removeFilter = useEditorStore((s) => s.removeFilterFromClip);
  const updateFilter = useEditorStore((s) => s.updateClipFilter);
  const reorderFilters = useEditorStore((s) => s.reorderClipFilters);
  const setSpeed = useEditorStore((s) => s.setClipSpeed);
  const setKeyframe = useEditorStore((s) => s.setClipKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeClipKeyframe);

  // UI state for selecting property to keyframe
  const [selectedProperty, setSelectedProperty] = useState<
    "position.x" | "position.y" | "scale" | "rotation" | "opacity"
  >("position.x");
  const [kfValue, setKfValue] = useState<number>(0.0);
  const [kfEasing, setKfEasing] = useState<"linear" | "easeIn" | "easeOut" | "easeInOut">("linear");

  // Find the selected clip and its parent track
  let selectedClip = null;
  let parentTrack = null;

  for (const track of project.tracks) {
    const found = track.clips.find((c) => c.id === selectedClipId);
    if (found) {
      selectedClip = found;
      parentTrack = track;
      break;
    }
  }

  if (!selectedClip || !parentTrack) {
    return (
      <div className="w-[300px] bg-[var(--bg-panel)] border-l border-[var(--border)] p-4 flex flex-col justify-center items-center text-center">
        <span className="text-2xl mb-2">👈</span>
        <p className="text-xs text-[var(--text-secondary)]">
          Select a clip on the timeline to edit properties
        </p>
      </div>
    );
  }

  const isVideo = parentTrack.type === "video";
  const isAudio = parentTrack.type === "audio";
  const isText = parentTrack.type === "text";

  const duration = clipDuration(selectedClip);
  const clipRelativePlayhead = Math.max(0, playheadTime - selectedClip.startTime);

  // Delete clip helper
  const handleDelete = () => {
    deleteClipAction(selectedClip!.id);
    selectClip(null);
  };

  // ============================================================
  // Filter stack helpers
  // ============================================================
  const handleAddFilter = (type: "brightness" | "contrast" | "saturation" | "lut") => {
    if (type === "lut") {
      // Check if LUT already active
      const hasLut = selectedClip!.filters?.some((f) => f.type === "lut");
      if (hasLut) return;
      addFilter(selectedClip!.id, { type: "lut", value: 0.0, lutId: "warm" });
    } else {
      addFilter(selectedClip!.id, { type, value: 0.0 });
    }
  };

  // ============================================================
  // Speed curve helpers
  // ============================================================
  const handleSetConstantSpeed = (multiplier: number) => {
    setSpeed(selectedClip!.id, [{ time: 0, speed: multiplier }]);
  };

  const handleAddSpeedRamp = () => {
    // Adds a 3-point speed ramp: normal start -> fast middle -> normal end
    const srcDuration = selectedClip!.sourceOutPoint - selectedClip!.sourceInPoint;
    const ramp = [
      { time: selectedClip!.sourceInPoint, speed: 1.0 },
      { time: selectedClip!.sourceInPoint + srcDuration * 0.5, speed: 2.0 },
      { time: selectedClip!.sourceOutPoint, speed: 1.0 },
    ];
    setSpeed(selectedClip!.id, ramp);
  };

  const handleClearSpeedRamp = () => {
    setSpeed(selectedClip!.id, []);
  };

  // ============================================================
  // Keyframe helpers
  // ============================================================
  const handleAddKeyframe = () => {
    const kf: Keyframe = {
      time: clipRelativePlayhead,
      value: kfValue,
      easing: kfEasing,
    };
    setKeyframe(selectedClip!.id, selectedProperty, kf);
  };

  const currentTrackKeyframes =
    selectedClip.keyframedProps?.find((t) => t.property === selectedProperty)
      ?.keyframes ?? [];

  return (
    <div className="w-[300px] bg-[var(--bg-panel)] border-l border-[var(--border)] flex flex-col shrink-0 overflow-y-auto">
      {/* Title */}
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-surface)]/20">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          Creative Tools
        </span>
        <button
          onClick={handleDelete}
          className="text-xs text-[var(--danger)] hover:text-red-400 font-medium transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* ============================================================
            Section 1: Timeline Info
            ============================================================ */}
        <div className="space-y-1">
          <label className="text-[10px] text-[var(--text-secondary)] uppercase">
            Timeline Info
          </label>
          <div className="text-xs space-y-1 font-mono text-[var(--text-primary)] bg-[var(--bg-surface)] p-2 rounded border border-[var(--border)]">
            <div>Start: {selectedClip.startTime.toFixed(2)}s</div>
            <div>Duration: {duration.toFixed(2)}s</div>
            <div>Playhead Offset: {clipRelativePlayhead.toFixed(2)}s</div>
          </div>
        </div>

        {/* ============================================================
            Section 2: Speed Ramping
            ============================================================ */}
        {(isVideo || isAudio) && (
          <div className="space-y-2">
            <h3 className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
              Clip Speed
            </h3>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-3">
              <div className="flex gap-1.5 justify-between">
                <button
                  onClick={() => handleSetConstantSpeed(0.5)}
                  className="flex-1 py-1 text-[10px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  0.5x Slow
                </button>
                <button
                  onClick={() => handleSetConstantSpeed(1.0)}
                  className="flex-1 py-1 text-[10px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  1.0x Normal
                </button>
                <button
                  onClick={() => handleSetConstantSpeed(2.0)}
                  className="flex-1 py-1 text-[10px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  2.0x Fast
                </button>
              </div>

              <div className="flex justify-between gap-2">
                <button
                  onClick={handleAddSpeedRamp}
                  className="flex-1 py-1 text-[10px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded text-white"
                >
                  Set Speed Ramp
                </button>
                <button
                  onClick={handleClearSpeedRamp}
                  className="px-2 py-1 text-[10px] bg-[var(--bg-panel)] border border-[var(--border)] rounded text-[var(--text-secondary)]"
                >
                  Reset
                </button>
              </div>

              {selectedClip.speed?.points && selectedClip.speed.points.length > 0 && (
                <div className="text-[10px] font-mono text-[var(--text-secondary)] space-y-0.5 pt-1">
                  <div className="font-bold">Speed points:</div>
                  {selectedClip.speed.points.map((p, idx) => (
                    <div key={idx}>
                      · Src Time: {p.time.toFixed(1)}s → Speed: {p.speed}x
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            Section 3: Composable Filters & LUT Presets
            ============================================================ */}
        {(isVideo || isText) && (
          <div className="space-y-2">
            <h3 className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
              Visual Filters & LUTs
            </h3>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-3">
              {/* Add filter bar */}
              <div className="flex justify-between gap-1">
                <button
                  onClick={() => handleAddFilter("brightness")}
                  className="flex-1 py-1 text-[9px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  + Brightness
                </button>
                <button
                  onClick={() => handleAddFilter("contrast")}
                  className="flex-1 py-1 text-[9px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  + Contrast
                </button>
                <button
                  onClick={() => handleAddFilter("saturation")}
                  className="flex-1 py-1 text-[9px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  + Saturation
                </button>
                <button
                  onClick={() => handleAddFilter("lut")}
                  className="flex-1 py-1 text-[9px] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white"
                >
                  + LUT
                </button>
              </div>

              {/* Active filters list */}
              <div className="space-y-3 pt-1">
                {selectedClip.filters?.map((filter, index) => (
                  <div
                    key={index}
                    className="p-2 bg-[var(--bg-panel)] rounded border border-[var(--border)] text-xs space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[10px] uppercase text-[var(--text-primary)]">
                        {filter.type}
                      </span>
                      <button
                        onClick={() => removeFilter(selectedClip!.id, index)}
                        className="text-[9px] text-[var(--danger)] hover:text-red-400 font-bold"
                      >
                        REMOVE
                      </button>
                    </div>

                    {filter.type === "lut" ? (
                      <select
                        value={filter.lutId ?? "warm"}
                        onChange={(e) => {
                          // Mutate filter using helper by modifying properties
                          updateTextProperties(selectedClip!.id, {
                            filters: selectedClip!.filters?.map((f, i) =>
                              i === index ? { ...f, lutId: e.target.value } : f
                            ),
                          });
                        }}
                        className="w-full text-[10px] bg-[var(--bg-surface)] border border-[var(--border)] p-1 rounded text-white focus:outline-none"
                      >
                        <option value="warm">Warm Multiplier</option>
                        <option value="cool">Cool Blue Tint</option>
                        <option value="vintage">Vintage Sepia</option>
                        <option value="bw">High Contrast B&W</option>
                      </select>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[10px] font-mono text-[var(--text-secondary)]">
                          <span>Adjust</span>
                          <span>{(filter.value * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.05"
                          value={filter.value}
                          onChange={(e) =>
                            updateFilter(selectedClip!.id, index, Number(e.target.value))
                          }
                          className="w-full h-1 accent-[var(--accent)]"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {(!selectedClip.filters || selectedClip.filters.length === 0) && (
                  <div className="text-center text-[10px] text-[var(--text-muted)] py-2">
                    No active filters or LUTs
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            Section 4: Keyframe Animation Tracks
            ============================================================ */}
        {(isVideo || isText) && (
          <div className="space-y-2">
            <h3 className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
              Keyframe Animations
            </h3>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-3">
              {/* Select track property */}
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-secondary)]">Target Property</label>
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value as any)}
                  className="w-full text-xs bg-[var(--bg-panel)] border border-[var(--border)] p-1 rounded text-white"
                >
                  <option value="position.x">Position X</option>
                  <option value="position.y">Position Y</option>
                  <option value="scale">Scale Multiplier</option>
                  <option value="rotation">Rotation Angle</option>
                  <option value="opacity">Opacity Layer</option>
                </select>
              </div>

              {/* Slider for value */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[var(--text-secondary)]">Value</span>
                  <span>{kfValue.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={
                    selectedProperty === "rotation"
                      ? -180
                      : selectedProperty === "scale"
                        ? 0.1
                        : 0.0
                  }
                  max={selectedProperty === "rotation" ? 180 : selectedProperty === "scale" ? 3.0 : 1.0}
                  step="0.01"
                  value={kfValue}
                  onChange={(e) => setKfValue(Number(e.target.value))}
                  className="w-full h-1 accent-[var(--accent)]"
                />
              </div>

              {/* Select Easing */}
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-secondary)]">Easing Transition</label>
                <select
                  value={kfEasing}
                  onChange={(e) => setKfEasing(e.target.value as any)}
                  className="w-full text-xs bg-[var(--bg-panel)] border border-[var(--border)] p-1 rounded text-white"
                >
                  <option value="linear">Linear</option>
                  <option value="easeIn">Ease In</option>
                  <option value="easeOut">Ease Out</option>
                  <option value="easeInOut">Ease In/Out</option>
                </select>
              </div>

              {/* Add Keyframe trigger */}
              <button
                onClick={handleAddKeyframe}
                className="w-full py-1.5 text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded text-white"
              >
                Add Keyframe at playhead
              </button>

              {/* List keyframes on active track */}
              <div className="space-y-1 pt-1 border-t border-[var(--border)]">
                <div className="text-[10px] text-[var(--text-secondary)] font-bold mb-1">
                  Active keyframes:
                </div>
                {currentTrackKeyframes.map((kf, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center text-[10px] font-mono p-1 bg-[var(--bg-panel)] rounded border border-[var(--border)]"
                  >
                    <span>
                      Time: {kf.time.toFixed(2)}s → Value: {kf.value.toFixed(2)} ({kf.easing})
                    </span>
                    <button
                      onClick={() => removeKeyframe(selectedClip!.id, selectedProperty, kf.time)}
                      className="text-[9px] text-[var(--danger)] hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {currentTrackKeyframes.length === 0 && (
                  <div className="text-center text-[10px] text-[var(--text-muted)] py-1">
                    No keyframes set
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
