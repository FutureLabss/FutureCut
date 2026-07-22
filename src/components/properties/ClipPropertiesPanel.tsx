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

import { useState, useEffect } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { clipDuration } from "@/lib/model/types";
import type { Keyframe } from "@/lib/model/types";

export function ClipPropertiesPanel() {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const selectClip = useUIStore((s) => s.selectClip);
  const playheadTime = useUIStore((s) => s.playheadTime);
  
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const serverProjectId = useEditorStore((s) => s.serverProjectId);
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties);
  const deleteClipAction = useEditorStore((s) => s.deleteClip);

  // Phase 3 Actions
  const addFilter = useEditorStore((s) => s.addFilterToClip);
  const removeFilter = useEditorStore((s) => s.removeFilterFromClip);
  const updateFilter = useEditorStore((s) => s.updateClipFilter);
  const setSpeed = useEditorStore((s) => s.setClipSpeed);
  const setKeyframe = useEditorStore((s) => s.setClipKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeClipKeyframe);

  // UI state for selecting property to keyframe
  const [selectedProperty, setSelectedProperty] = useState<
    "position.x" | "position.y" | "scale" | "rotation" | "opacity"
  >("position.x");
  const [kfValue, setKfValue] = useState<number>(0.0);
  const [kfEasing, setKfEasing] = useState<"linear" | "easeIn" | "easeOut" | "easeInOut">("linear");

  // AI job states for polling
  const [sceneJobId, setSceneJobId] = useState<string | null>(null);
  const [sceneProgress, setSceneProgress] = useState<number>(0);
  const [sceneStatus, setSceneStatus] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const [targetRatio, setTargetRatio] = useState<"9:16" | "1:1" | "4:5" | "16:9">("9:16");
  const [reframeJobId, setReframeJobId] = useState<string | null>(null);
  const [reframeProgress, setReframeProgress] = useState<number>(0);
  const [reframeStatus, setReframeStatus] = useState<string | null>(null);
  const [reframeError, setReframeError] = useState<string | null>(null);

  const [denoiseJobId, setDenoiseJobId] = useState<string | null>(null);
  const [denoiseProgress, setDenoiseProgress] = useState<number>(0);
  const [denoiseStatus, setDenoiseStatus] = useState<string | null>(null);
  const [denoiseError, setDenoiseError] = useState<string | null>(null);

  // Store actions
  const splitClipAtTimes = useEditorStore((s) => s.splitClipAtTimes);
  const applyAutoReframe = useEditorStore((s) => s.applyAutoReframe);
  const applyDenoisedAudio = useEditorStore((s) => s.applyDenoisedAudio);
  const setClipDenoised = useEditorStore((s) => s.setClipDenoised);

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

  const isVideo = parentTrack ? parentTrack.type === "video" : false;
  const isAudio = parentTrack ? parentTrack.type === "audio" : false;
  const isText = parentTrack ? parentTrack.type === "text" : false;

  // Poll Scene Detection Job
  useEffect(() => {
    if (!sceneJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${sceneJobId}`);
        if (!res.ok) throw new Error("Failed to get scene job status");
        const job = await res.json();
        setSceneStatus(job.status);
        setSceneProgress(job.progress);

        if (job.status === "completed") {
          clearInterval(interval);
          setSceneJobId(null);
          setSceneStatus(null);
          if (job.output_data?.boundaries && selectedClip) {
            const absoluteTimes = job.output_data.boundaries.map(
              (t: number) => selectedClip.startTime + t
            );
            splitClipAtTimes(selectedClip.id, absoluteTimes);
          }
        } else if (job.status === "failed") {
          clearInterval(interval);
          setSceneJobId(null);
          setSceneStatus(null);
          setSceneError(job.error_message || "Scene detection failed");
        }
      } catch (err: unknown) {
        clearInterval(interval);
        setSceneJobId(null);
        setSceneStatus(null);
        setSceneError(err instanceof Error ? err.message : "Scene tracking error");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sceneJobId, selectedClip, splitClipAtTimes]);

  // Poll Auto Reframe Job
  useEffect(() => {
    if (!reframeJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${reframeJobId}`);
        if (!res.ok) throw new Error("Failed to get reframe job status");
        const job = await res.json();
        setReframeStatus(job.status);
        setReframeProgress(job.progress);

        if (job.status === "completed") {
          clearInterval(interval);
          setReframeJobId(null);
          setReframeStatus(null);
          if (job.output_data?.cropKeyframes && selectedClip) {
            applyAutoReframe(
              selectedClip.id,
              job.output_data.targetAspectRatio,
              job.output_data.cropKeyframes
            );
          }
        } else if (job.status === "failed") {
          clearInterval(interval);
          setReframeJobId(null);
          setReframeStatus(null);
          setReframeError(job.error_message || "Reframe failed");
        }
      } catch (err: unknown) {
        clearInterval(interval);
        setReframeJobId(null);
        setReframeStatus(null);
        setReframeError(err instanceof Error ? err.message : "Reframe tracking error");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reframeJobId, selectedClip, applyAutoReframe]);

  // Poll Noise Reduction Job
  useEffect(() => {
    if (!denoiseJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${denoiseJobId}`);
        if (!res.ok) throw new Error("Failed to get denoise job status");
        const job = await res.json();
        setDenoiseStatus(job.status);
        setDenoiseProgress(job.progress);

        if (job.status === "completed") {
          clearInterval(interval);
          setDenoiseJobId(null);
          setDenoiseStatus(null);
          if (job.output_data?.processedAudioAssetId && selectedClip) {
            applyDenoisedAudio(
              selectedClip.id,
              job.output_data.processedAudioAssetId,
              job.output_data.fileName
            );
          }
        } else if (job.status === "failed") {
          clearInterval(interval);
          setDenoiseJobId(null);
          setDenoiseStatus(null);
          setDenoiseError(job.error_message || "AI Denoise failed");
        }
      } catch (err: unknown) {
        clearInterval(interval);
        setDenoiseJobId(null);
        setDenoiseStatus(null);
        setDenoiseError(err instanceof Error ? err.message : "Denoise tracking error");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [denoiseJobId, selectedClip, applyDenoisedAudio]);

  const handleRunSceneDetection = async () => {
    if (!selectedClip) return;
    if (!serverProjectId) {
      setSceneError("Project must be saved before running AI jobs.");
      return;
    }
    const asset = assets[selectedClip.sourceId];
    const { file: _file, objectUrl: _objectUrl, ...serializableAsset } = asset;
    setSceneError(null);
    setSceneStatus("queued");

    try {
      const res = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: serverProjectId,
          clipId: selectedClip.id,
          jobType: "detect_scenes",
          inputData: { asset: serializableAsset },
        }),
      });

      if (!res.ok) throw new Error("Failed to start scene detection");
      const data = await res.json();
      setSceneJobId(data.id);
    } catch (err: unknown) {
      setSceneError(err instanceof Error ? err.message : "Failed to start job");
      setSceneStatus(null);
    }
  };

  const handleRunAutoReframe = async () => {
    if (!selectedClip) return;
    if (!serverProjectId) {
      setReframeError("Project must be saved before running AI jobs.");
      return;
    }
    const asset = assets[selectedClip.sourceId];
    const { file: _file, objectUrl: _objectUrl, ...serializableAsset } = asset;
    setReframeError(null);
    setReframeStatus("queued");

    try {
      const res = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: serverProjectId,
          clipId: selectedClip.id,
          jobType: "reframe",
          inputData: { targetAspectRatio: targetRatio, asset: serializableAsset },
        }),
      });

      if (!res.ok) throw new Error("Failed to start auto-reframe");
      const data = await res.json();
      setReframeJobId(data.id);
    } catch (err: unknown) {
      setReframeError(err instanceof Error ? err.message : "Failed to start job");
      setReframeStatus(null);
    }
  };

  const handleRunNoiseReduction = async () => {
    if (!selectedClip) return;
    if (!serverProjectId) {
      setDenoiseError("Project must be saved before running AI jobs.");
      return;
    }
    const asset = assets[selectedClip.sourceId];
    const { file: _file, objectUrl: _objectUrl, ...serializableAsset } = asset;
    setDenoiseError(null);
    setDenoiseStatus("queued");

    try {
      const res = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: serverProjectId,
          clipId: selectedClip.id,
          jobType: "denoise",
          inputData: { asset: serializableAsset },
        }),
      });

      if (!res.ok) throw new Error("Failed to start noise reduction");
      const data = await res.json();
      setDenoiseJobId(data.id);
    } catch (err: unknown) {
      setDenoiseError(err instanceof Error ? err.message : "Failed to start job");
      setDenoiseStatus(null);
    }
  };

  const duration = selectedClip ? clipDuration(selectedClip) : 0;
  const clipRelativePlayhead = selectedClip ? Math.max(0, playheadTime - selectedClip.startTime) : 0;

  // Delete clip helper
  const handleDelete = () => {
    if (!selectedClip) return;
    deleteClipAction(selectedClip.id);
    selectClip(null);
  };

  // ============================================================
  // Filter stack helpers
  // ============================================================
  const handleAddFilter = (type: "brightness" | "contrast" | "saturation" | "lut") => {
    if (!selectedClip) return;
    if (type === "lut") {
      // Check if LUT already active
      const hasLut = selectedClip.filters?.some((f) => f.type === "lut");
      if (hasLut) return;
      addFilter(selectedClip.id, { type: "lut", value: 0.0, lutId: "warm" });
    } else {
      addFilter(selectedClip.id, { type, value: 0.0 });
    }
  };

  // ============================================================
  // Speed curve helpers
  // ============================================================
  const handleSetConstantSpeed = (multiplier: number) => {
    if (!selectedClip) return;
    setSpeed(selectedClip.id, [{ time: 0, speed: multiplier }]);
  };

  const handleAddSpeedRamp = () => {
    if (!selectedClip) return;
    // Adds a 3-point speed ramp: normal start -> fast middle -> normal end
    const srcDuration = selectedClip.sourceOutPoint - selectedClip.sourceInPoint;
    const ramp = [
      { time: selectedClip.sourceInPoint, speed: 1.0 },
      { time: selectedClip.sourceInPoint + srcDuration * 0.5, speed: 2.0 },
      { time: selectedClip.sourceOutPoint, speed: 1.0 },
    ];
    setSpeed(selectedClip.id, ramp);
  };

  const handleClearSpeedRamp = () => {
    if (!selectedClip) return;
    setSpeed(selectedClip.id, []);
  };

  // ============================================================
  // Keyframe helpers
  // ============================================================
  const handleAddKeyframe = () => {
    if (!selectedClip) return;
    const kf: Keyframe = {
      time: clipRelativePlayhead,
      value: kfValue,
      easing: kfEasing,
    };
    setKeyframe(selectedClip.id, selectedProperty, kf);
  };

  const currentTrackKeyframes = selectedClip
    ? selectedClip.keyframedProps?.find((t) => t.property === selectedProperty)?.keyframes ?? []
    : [];

  if (!selectedClip || !parentTrack) {
    return (
      <div className="w-full lg:w-[300px] bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border)] p-4 flex flex-col justify-center items-center text-center">
        <span className="text-2xl mb-2">👈</span>
        <p className="text-xs text-[var(--text-secondary)]">
          Select a clip on the timeline to edit properties
        </p>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-[300px] bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col shrink-0 overflow-y-auto">
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
            Section 1: Timeline Info & Position Inputs
            ============================================================ */}
        <div className="space-y-2">
          <label className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
            Timeline Info & Position
          </label>
          <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-3">
            <div className="text-xs space-y-1.5 font-mono text-[var(--text-primary)] bg-[var(--bg-panel)] p-2 rounded border border-[var(--border)]">
              <div>Duration: {duration.toFixed(2)}s</div>
              <div>Playhead Offset: {clipRelativePlayhead.toFixed(2)}s</div>
            </div>

            {/* Editable start time */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--text-secondary)]">Start Time:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={Number(selectedClip.startTime.toFixed(2))}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      useEditorStore.getState().moveClip(selectedClip!.id, val, parentTrack!.id);
                    }
                  }}
                  className="w-20 px-1.5 py-0.5 rounded bg-[var(--bg-panel)] border border-[var(--border)] font-mono text-right text-white focus:outline-none focus:border-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)]">s</span>
              </div>
            </div>

            {/* Editable Track (Move Clip) */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--text-secondary)]">Move to Track:</span>
              <select
                value={parentTrack!.id}
                onChange={(e) => {
                  useEditorStore.getState().moveClip(selectedClip!.id, selectedClip!.startTime, e.target.value);
                }}
                className="px-1.5 py-0.5 rounded bg-[var(--bg-panel)] border border-[var(--border)] text-white focus:outline-none text-[10px] max-w-[120px] truncate"
              >
                {project.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.type.toUpperCase()} ({t.id})
                  </option>
                ))}
              </select>
            </div>
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
                  onChange={(e) => setSelectedProperty(e.target.value as "position.x" | "position.y" | "scale" | "rotation" | "opacity")}
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
                  onChange={(e) => setKfEasing(e.target.value as Keyframe["easing"])}
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
        {/* ============================================================
            Section 5: AI-Assisted Editing Tools
            ============================================================ */}
        {(isVideo || isAudio) && (
          <div className="space-y-2">
            <h3 className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
              AI-Assisted Editing
            </h3>
            <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-4">
              
              {/* Scene Detection / Auto-Split */}
              {isVideo && (
                <div className="space-y-1.5 pb-3 border-b border-[var(--border)]/60">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">Scene Cut Detection</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">CPU-only</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                    Auto-split clip into separate segments at editing cut boundaries.
                  </p>
                  
                  {sceneStatus === "processing" || sceneStatus === "queued" ? (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--accent)]">
                      <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                      <span>Processing cuts... {sceneProgress}%</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleRunSceneDetection}
                      className="w-full py-1 text-[10px] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white transition-colors"
                    >
                      Split Clip by Scenes
                    </button>
                  )}
                  {sceneError && (
                    <div className="text-[9px] text-[var(--danger)]">⚠️ {sceneError}</div>
                  )}
                </div>
              )}

              {/* Auto Reframe */}
              {isVideo && (
                <div className="space-y-1.5 pb-3 border-b border-[var(--border)]/60">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">Auto Reframe</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">Keyframed Pan</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                    Crop and pan clip dynamically to fit portrait or square ratios.
                  </p>
                  
                  <div className="flex gap-2 items-center">
                    <select
                      value={targetRatio}
                      onChange={(e) => setTargetRatio(e.target.value as "9:16" | "1:1" | "4:5" | "16:9")}
                      disabled={reframeStatus === "processing" || reframeStatus === "queued"}
                      className="text-[10px] bg-[var(--bg-panel)] border border-[var(--border)] p-1 rounded text-white focus:outline-none flex-1"
                    >
                      <option value="9:16">Portrait 9:16</option>
                      <option value="1:1">Square 1:1</option>
                      <option value="4:5">Portrait 4:5</option>
                      <option value="16:9">Landscape 16:9</option>
                    </select>

                    {reframeStatus === "processing" || reframeStatus === "queued" ? (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--accent)] min-w-[100px]">
                        <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        <span>Reframing... {reframeProgress}%</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleRunAutoReframe}
                        className="py-1 px-3 text-[10px] font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded text-white transition-colors"
                      >
                        Reframe
                      </button>
                    )}
                  </div>
                  {reframeError && (
                    <div className="text-[9px] text-[var(--danger)]">⚠️ {reframeError}</div>
                  )}
                </div>
              )}

              {/* Speech Enhancement / Denoising */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">AI Speech Enhancer</span>
                  <span className="text-[9px] text-[var(--text-secondary)]">DeepFilterNet3</span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                  Suppress background noise and isolate spoken voices non-destructively.
                </p>

                {selectedClip.denoisedSourceId ? (
                  <div className="space-y-2 bg-[var(--bg-panel)] p-2 rounded border border-[var(--border)] text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Noise Reduction:</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedClip.isDenoised || false}
                          onChange={(e) => setClipDenoised(selectedClip!.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent)]"></div>
                      </label>
                    </div>

                    <div className="text-[9px] text-[var(--text-muted)] bg-[var(--bg-surface)] p-1 rounded font-mono truncate">
                      File: {assets[selectedClip.sourceId]?.fileName || "AI Enhanced Audio"}
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]/40 text-[9px] text-[var(--text-muted)]">
                      <span>Before / After Switcher:</span>
                      <span className="font-semibold text-white uppercase font-mono">
                        {selectedClip.isDenoised ? "Enhanced" : "Original"}
                      </span>
                    </div>
                  </div>
                ) : denoiseStatus === "processing" || denoiseStatus === "queued" ? (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--accent)]">
                    <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span>Denoising... {denoiseProgress}%</span>
                  </div>
                ) : (
                  <button
                    onClick={handleRunNoiseReduction}
                    className="w-full py-1 text-[10px] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded text-white transition-colors"
                  >
                    Enhance Speech
                  </button>
                )}
                {denoiseError && (
                  <div className="text-[9px] text-[var(--danger)]">⚠️ {denoiseError}</div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
