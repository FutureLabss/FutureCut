"use client";

// ============================================================
// FutureCut — Caption Panel (Phase 5 AI-Assisted Editing)
// ============================================================
// Subtitle and caption management view:
// - Generate auto-captions via POST /api/ai/jobs (Deepgram/WhisperX)
// - View and inline-edit caption transcripts
// - Synchronize active subtitle selection to timeline playhead
// - Adjust global captions styling parameters (font, size, color, position)
// - Export captions as sidecar SRT or VTT files
// ============================================================

import { useState, useEffect } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { clipEndTime } from "@/lib/model/types";
import { formatTimecode } from "@/lib/utils/time";

export function CaptionPanel() {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const serverProjectId = useEditorStore((s) => s.serverProjectId);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setPlayhead = useUIStore((s) => s.setPlayhead);
  const applyCaptions = useEditorStore((s) => s.applyCaptions);
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties);

  // AI Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Styling properties state (governs all captions for design parity)
  const [fontFamily, setFontFamily] = useState("Outfit");
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState("#FFFFFF");
  const [posY, setPosY] = useState(0.8); // 80% down the frame

  // Find captions track
  const captionTrack = project.tracks.find((t) => t.type === "text");
  const captions = captionTrack?.clips || [];

  // Polling for the transcription job
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${jobId}`);
        if (!res.ok) throw new Error("Failed to fetch job status");
        
        const job = await res.json();
        setStatus(job.status);
        setProgress(job.progress);

        if (job.status === "completed") {
          clearInterval(interval);
          setJobId(null);
          // Apply results to the editor store
          if (job.output_data?.words) {
            applyCaptions(job.output_data.words);
          }
        } else if (job.status === "failed") {
          clearInterval(interval);
          setJobId(null);
          setError(job.error_message || "Transcription job failed");
        }
      } catch (err: unknown) {
        clearInterval(interval);
        setJobId(null);
        setError(err instanceof Error ? err.message : "Error tracking job");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, applyCaptions]);

  const handleGenerateCaptions = async () => {
    if (!serverProjectId) {
      setError("Project must be saved before running AI jobs. Save your project first.");
      return;
    }

    // Pick the first video asset in the project
    const videoAsset = Object.values(assets).find(
      (a) => a.fileName.endsWith(".mp4") || a.fileName.endsWith(".webm") || a.duration > 0
    );

    if (!videoAsset) {
      setError("No media files found to transcribe. Import an asset first.");
      return;
    }

    // Try to find the first clip that uses this asset to get its track id
    let targetClipId = null;
    for (const track of project.tracks) {
      const found = track.clips.find((c) => c.sourceId === videoAsset.id);
      if (found) {
        targetClipId = found.id;
        break;
      }
    }

    // Strip non-serializable fields (File, objectUrl) before sending
    const { file: _file, objectUrl: _objectUrl, ...serializableAsset } = videoAsset;

    setError(null);
    setStatus("queued");
    setProgress(0);

    try {
      const res = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: serverProjectId,
          clipId: targetClipId,
          jobType: "transcribe",
          inputData: { asset: serializableAsset },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit transcription job");
      }

      const data = await res.json();
      setJobId(data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start transcription");
      setStatus(null);
    }
  };

  // Update styling of all captions in unison
  const handleUpdateGlobalStyling = (prop: string, val: string | number) => {
    if (!captionTrack) return;
    
    // Save to local view state
    if (prop === "fontFamily") setFontFamily(String(val));
    if (prop === "fontSize") setFontSize(Number(val));
    if (prop === "color") setColor(String(val));
    if (prop === "posY") setPosY(Number(val));

    // Batch update clips on caption track
    captions.forEach((clip) => {
      updateTextProperties(clip.id, {
        [prop === "posY" ? "position" : prop]: prop === "posY" ? { x: 0.5, y: Number(val) } : val,
      });
    });
  };

  // Helper to generate SRT/VTT formatted timestamps
  const formatSubTime = (seconds: number, isVtt: boolean): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    const delim = isVtt ? "." : ",";

    const hh = String(hrs).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    const ss = String(secs).padStart(2, "0");
    const mmm = String(ms).padStart(3, "0");

    return `${hh}:${mm}:${ss}${delim}${mmm}`;
  };

  // Trigger SRT/VTT sidecar downloads
  const handleExportSubtitle = (type: "srt" | "vtt") => {
    const isVtt = type === "vtt";
    let output = isVtt ? "WEBVTT\n\n" : "";

    captions.forEach((clip, index) => {
      const start = clip.startTime;
      const end = clipEndTime(clip);
      
      output += `${index + 1}\n`;
      output += `${formatSubTime(start, isVtt)} --> ${formatSubTime(end, isVtt)}\n`;
      output += `${clip.text || ""}\n\n`;
    });

    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "_")}_subtitles.${type}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-[#0d0e17]/80 flex flex-col shrink-0 overflow-hidden h-full">
      {/* Main Body */}
      <div className="flex-1 overflow-y-auto space-y-5 text-xs text-gray-200">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Generate / Loading state when no captions present yet */}
        {captions.length === 0 && !status && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 glass-card p-6 rounded-2xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl">
              💬
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white font-outfit">Auto Captions Generator</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Transcribe voice track into styleable text overlays automatically.
              </p>
            </div>
            <button
              onClick={handleGenerateCaptions}
              className="w-full py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/30 transition-all cursor-pointer"
            >
              Generate Auto-Captions
            </button>
          </div>
        )}

        {status && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 glass-card p-6 rounded-2xl">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 36}
                  strokeDashoffset={2 * Math.PI * 36 - (progress / 100) * 2 * Math.PI * 36}
                  style={{ transition: "stroke-dashoffset 200ms ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {progress}%
              </div>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white font-outfit">Transcribing Audio…</span>
              <p className="text-[10px] text-gray-400">Running WhisperX AI model</p>
            </div>
          </div>
        )}

        {/* Captions loaded or Inspector controls active */}
        <div className="space-y-5">
          {/* Captions Styling Controls matching stitch/mainScreen.png */}
          <div className="space-y-3 glass-card p-4 rounded-2xl border border-white/10">
            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-300 font-medium">
                <span>Font Size</span>
                <span className="font-mono text-white font-semibold">{fontSize}</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="12"
                  max="60"
                  value={fontSize}
                  onChange={(e) => handleUpdateGlobalStyling("fontSize", e.target.value)}
                  className="flex-1 h-1.5 accent-purple-500 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Color & Font Family */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-300 font-medium block">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleUpdateGlobalStyling("color", e.target.value)}
                    className="w-10 h-9 rounded-xl bg-purple-600 border border-white/20 cursor-pointer p-0.5"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-300 font-medium block">Font Family</label>
                <select
                  value={fontFamily}
                  onChange={(e) => handleUpdateGlobalStyling("fontFamily", e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.08] border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500 font-outfit"
                >
                  <option value="Outfit">Outfit</option>
                  <option value="Inter">Inter</option>
                  <option value="sans-serif">System Sans</option>
                </select>
              </div>
            </div>

            {/* Vertical Position */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-gray-300 font-medium">
                <span>Vertical Position</span>
                <span className="font-mono text-white font-semibold">{(posY * 100 - 80).toFixed(0)}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.02"
                value={posY}
                onChange={(e) => handleUpdateGlobalStyling("posY", e.target.value)}
                className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Transcript Segments matching stitch/mainScreen.png */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-bold text-gray-400 tracking-wider uppercase font-outfit">
              Transcript Segments
            </label>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {captions.length > 0 ? (
                captions.map((clip) => {
                  const isActive = playheadTime >= clip.startTime && playheadTime <= clipEndTime(clip);
                  return (
                    <div
                      key={clip.id}
                      onClick={() => setPlayhead(clip.startTime)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                        isActive
                          ? "bg-purple-900/30 border-purple-500/60 shadow-lg shadow-purple-500/10"
                          : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08]"
                      }`}
                    >
                      <input
                        type="text"
                        value={clip.text || ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateTextProperties(clip.id, { text: e.target.value })}
                        className="w-full bg-transparent border-0 text-white font-medium focus:outline-none py-0.5 text-sm"
                      />
                    </div>
                  );
                })
              ) : (
                /* Default sample transcript segments if none generated yet, matching stitch/mainScreen.png */
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-medium text-gray-200">
                    Welcome to FutureCut, the
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-medium text-gray-200">
                    advanced web video editor.
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-medium text-gray-200">
                    Welcome to FutureCut, the
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => handleExportSubtitle("srt")}
              className="flex-1 py-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
            >
              📥 Export SRT
            </button>
            <button
              onClick={() => handleExportSubtitle("vtt")}
              className="flex-1 py-2 text-xs bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-gray-200 transition-colors"
            >
              📥 Export VTT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
