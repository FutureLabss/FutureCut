"use client";

import { useState, useEffect } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { clipDuration } from "@/lib/model/types";
import type { Keyframe } from "@/lib/model/types";

interface ClipPropertiesPanelProps {
  tab?: "effects" | "audio" | "properties";
}

export function ClipPropertiesPanel({ tab = "effects" }: ClipPropertiesPanelProps) {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const selectClip = useUIStore((s) => s.selectClip);
  const playheadTime = useUIStore((s) => s.playheadTime);
  
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const serverProjectId = useEditorStore((s) => s.serverProjectId);
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties);
  const deleteClipAction = useEditorStore((s) => s.deleteClip);
  const setTrackVolume = useEditorStore((s) => s.setTrackVolume);
  const setTrackMuted = useEditorStore((s) => s.setTrackMuted);

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

  // Filter stack helpers
  const handleAddFilter = (type: "brightness" | "contrast" | "saturation" | "lut") => {
    if (!selectedClip) return;
    if (type === "lut") {
      const hasLut = selectedClip.filters?.some((f) => f.type === "lut");
      if (hasLut) return;
      addFilter(selectedClip.id, { type: "lut", value: 0.0, lutId: "warm" });
    } else {
      addFilter(selectedClip.id, { type, value: 0.0 });
    }
  };

  // Speed curve helpers
  const handleSetConstantSpeed = (multiplier: number) => {
    if (!selectedClip) return;
    setSpeed(selectedClip.id, [{ time: 0, speed: multiplier }]);
  };

  const handleAddSpeedRamp = () => {
    if (!selectedClip) return;
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

  // Keyframe helpers
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
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 glass-card p-6 rounded-2xl">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl">
          {tab === "effects" ? "✨" : tab === "audio" ? "🎵" : "🎛️"}
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-white font-outfit">
            {tab === "effects" ? "Effects Inspector" : tab === "audio" ? "Audio Inspector" : "Clip Properties"}
          </h4>
          <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
            Select a clip on the timeline to configure {tab === "effects" ? "visual effects & keyframes" : tab === "audio" ? "audio levels & speed" : "properties"}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#0d0e17]/80 flex flex-col shrink-0 overflow-y-auto space-y-5 text-xs text-gray-200">
      {/* Title & Delete Header */}
      <div className="p-3.5 glass-card rounded-2xl border border-white/10 flex justify-between items-center">
        <div className="space-y-0.5">
          <span className="text-xs font-bold text-white font-outfit tracking-wide uppercase">
            {tab === "effects" ? "Visual Effects" : tab === "audio" ? "Audio & Speed" : "Clip Properties"}
          </span>
          <p className="text-[10px] text-gray-400 font-mono">
            ID: {selectedClip.id.slice(0, 8)} • {duration.toFixed(1)}s
          </p>
        </div>
        <button
          onClick={handleDelete}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* ============================================================
          TAB MODE: EFFECTS (Visual Filters, Keyframes, AI Video)
          ============================================================ */}
      {tab === "effects" && (
        <>
          {/* Visual Filters & Color Grading */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
              Color Grading & Filters
            </label>

            {/* Filter buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddFilter("brightness")}
                className="py-2 px-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                + Brightness
              </button>
              <button
                onClick={() => handleAddFilter("contrast")}
                className="py-2 px-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                + Contrast
              </button>
              <button
                onClick={() => handleAddFilter("saturation")}
                className="py-2 px-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                + Saturation
              </button>
              <button
                onClick={() => handleAddFilter("lut")}
                className="py-2 px-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                + LUT Preset
              </button>
            </div>

            {/* Active filters list */}
            <div className="space-y-2.5 pt-2">
              {selectedClip.filters?.map((filter, index) => (
                <div
                  key={index}
                  className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs text-white uppercase font-outfit">
                      {filter.type}
                    </span>
                    <button
                      onClick={() => removeFilter(selectedClip!.id, index)}
                      className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                    >
                      Remove
                    </button>
                  </div>

                  {filter.type === "lut" ? (
                    <select
                      value={filter.lutId ?? "warm"}
                      onChange={(e) => {
                        updateTextProperties(selectedClip!.id, {
                          filters: selectedClip!.filters?.map((f, i) =>
                            i === index ? { ...f, lutId: e.target.value } : f
                          ),
                        });
                      }}
                      className="w-full h-8 px-2.5 rounded-lg bg-white/[0.08] border border-white/10 text-xs text-white focus:outline-none"
                    >
                      <option value="warm">Warm Multiplier</option>
                      <option value="cool">Cool Blue Tint</option>
                      <option value="vintage">Vintage Sepia</option>
                      <option value="bw">High Contrast B&W</option>
                    </select>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-gray-300">
                        <span>Intensity</span>
                        <span className="font-mono text-white font-semibold">{(filter.value * 100).toFixed(0)}%</span>
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
                        className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              ))}

              {(!selectedClip.filters || selectedClip.filters.length === 0) && (
                <div className="text-center text-xs text-gray-500 py-2">
                  No active filters or LUTs applied
                </div>
              )}
            </div>
          </div>

          {/* Keyframe Animations */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
              Keyframe Animations
            </label>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-300">Target Property</label>
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value as "position.x" | "position.y" | "scale" | "rotation" | "opacity")}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.08] border border-white/10 text-xs text-white focus:outline-none"
                >
                  <option value="position.x">Position X</option>
                  <option value="position.y">Position Y</option>
                  <option value="scale">Scale Multiplier</option>
                  <option value="rotation">Rotation Angle</option>
                  <option value="opacity">Opacity</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-300">
                  <span>Value</span>
                  <span className="font-mono text-white font-semibold">{kfValue.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={selectedProperty === "rotation" ? -180 : selectedProperty === "scale" ? 0.1 : 0.0}
                  max={selectedProperty === "rotation" ? 180 : selectedProperty === "scale" ? 3.0 : 1.0}
                  step="0.01"
                  value={kfValue}
                  onChange={(e) => setKfValue(Number(e.target.value))}
                  className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-300">Easing Transition</label>
                <select
                  value={kfEasing}
                  onChange={(e) => setKfEasing(e.target.value as Keyframe["easing"])}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.08] border border-white/10 text-xs text-white focus:outline-none"
                >
                  <option value="linear">Linear</option>
                  <option value="easeIn">Ease In</option>
                  <option value="easeOut">Ease Out</option>
                  <option value="easeInOut">Ease In/Out</option>
                </select>
              </div>

              <button
                onClick={handleAddKeyframe}
                className="w-full py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/30 transition-all cursor-pointer"
              >
                + Add Keyframe at Playhead
              </button>

              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Active Keyframes</label>
                {currentTrackKeyframes.map((kf, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center text-xs font-mono p-2 bg-white/[0.04] rounded-xl border border-white/10"
                  >
                    <span>{kf.time.toFixed(2)}s → {kf.value.toFixed(2)} ({kf.easing})</span>
                    <button
                      onClick={() => removeKeyframe(selectedClip!.id, selectedProperty, kf.time)}
                      className="text-red-400 hover:text-red-300 text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {currentTrackKeyframes.length === 0 && (
                  <div className="text-center text-xs text-gray-500 py-1">No keyframes on this property</div>
                )}
              </div>
            </div>
          </div>

          {/* AI Video Tools */}
          {isVideo && (
            <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
              <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
                AI Video Cut & Reframe
              </label>

              {/* Scene Cut Detection */}
              <div className="space-y-2 pb-3 border-b border-white/10">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white font-outfit">Scene Cut Detection</span>
                  <span className="text-[10px] text-gray-400">Auto Split</span>
                </div>
                {sceneStatus === "processing" || sceneStatus === "queued" ? (
                  <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span>Processing cuts... {sceneProgress}%</span>
                  </div>
                ) : (
                  <button
                    onClick={handleRunSceneDetection}
                    className="w-full py-2 text-xs font-semibold bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl text-gray-200 transition-colors"
                  >
                    Auto Split Clip by Scenes
                  </button>
                )}
              </div>

              {/* Auto Reframe */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white font-outfit">Auto Reframe</span>
                  <span className="text-[10px] text-gray-400">Aspect Crop</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={targetRatio}
                    onChange={(e) => setTargetRatio(e.target.value as "9:16" | "1:1" | "4:5" | "16:9")}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/[0.08] border border-white/10 text-xs text-white focus:outline-none"
                  >
                    <option value="9:16">Portrait 9:16</option>
                    <option value="1:1">Square 1:1</option>
                    <option value="4:5">Portrait 4:5</option>
                    <option value="16:9">Landscape 16:9</option>
                  </select>
                  <button
                    onClick={handleRunAutoReframe}
                    className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 rounded-xl text-white transition-colors"
                  >
                    Reframe
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================
          TAB MODE: AUDIO (Volume, Speed Ramping, AI Denoise)
          ============================================================ */}
      {(tab === "audio" || tab === "properties") && (
        <>
          {/* Audio Levels & Track Volume */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
              Audio Volume & Controls
            </label>

            <div className="space-y-2.5">
              <div className="flex justify-between text-xs text-gray-300 font-medium">
                <span>Track Volume</span>
                <span className="font-mono text-white font-semibold">
                  {((parentTrack?.volume ?? 1.0) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={parentTrack?.volume ?? 1.0}
                onChange={(e) => setTrackVolume(parentTrack!.id, Number(e.target.value))}
                className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg cursor-pointer"
              />

              <button
                onClick={() => setTrackMuted(parentTrack!.id, !parentTrack?.muted)}
                className={`w-full py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  parentTrack?.muted
                    ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-gray-200"
                }`}
              >
                {parentTrack?.muted ? "🔇 UNMUTE AUDIO TRACK" : "🔊 MUTE AUDIO TRACK"}
              </button>
            </div>
          </div>

          {/* Clip Speed & Ramping */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
              Playback Speed & Ramping
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleSetConstantSpeed(0.5)}
                className="py-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                0.5x Slow
              </button>
              <button
                onClick={() => handleSetConstantSpeed(1.0)}
                className="py-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                1.0x Normal
              </button>
              <button
                onClick={() => handleSetConstantSpeed(2.0)}
                className="py-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
              >
                2.0x Fast
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddSpeedRamp}
                className="flex-1 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/20 transition-all cursor-pointer"
              >
                Set Speed Ramp
              </button>
              <button
                onClick={handleClearSpeedRamp}
                className="px-4 py-2 text-xs font-semibold bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* AI Speech Enhancer */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit block">
              AI Speech Enhancer
            </label>
            <p className="text-xs text-gray-400 leading-relaxed">
              Isolate vocals and suppress background noise using DeepFilterNet3 AI model.
            </p>

            {selectedClip.denoisedSourceId ? (
              <div className="p-3 bg-white/[0.04] rounded-xl border border-white/10 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">Enhancer Toggle:</span>
                  <input
                    type="checkbox"
                    checked={selectedClip.isDenoised || false}
                    onChange={(e) => setClipDenoised(selectedClip!.id, e.target.checked)}
                    className="w-4 h-4 accent-purple-500 cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-purple-300 font-mono">
                  Active: {selectedClip.isDenoised ? "Enhanced Audio" : "Original Source"}
                </div>
              </div>
            ) : denoiseStatus === "processing" || denoiseStatus === "queued" ? (
              <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Enhancing speech... {denoiseProgress}%</span>
              </div>
            ) : (
              <button
                onClick={handleRunNoiseReduction}
                className="w-full py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/20 transition-all cursor-pointer"
              >
                Enhance Voice Clarity
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
