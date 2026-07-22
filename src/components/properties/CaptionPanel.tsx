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
    <div className="w-full lg:w-[300px] bg-[var(--bg-panel)] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden h-full">
      {/* Title */}
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-surface)]/20 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          AI Auto Captions
        </span>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)]/30 rounded text-xs text-[var(--danger)]">
            ⚠️ {error}
          </div>
        )}

        {/* Generate / Loading state */}
        {captions.length === 0 && !status && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="text-4xl">💬</div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">No Captions Yet</h4>
              <p className="text-xs text-[var(--text-secondary)] max-w-[200px]">
                Transcribe voice track into styleable text overlays instantly.
              </p>
            </div>
            <button
              onClick={handleGenerateCaptions}
              className="px-4 py-2 text-xs font-semibold rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-lg"
            >
              Generate Auto-Captions
            </button>
          </div>
        )}

        {status && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
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
                  stroke="var(--accent)"
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
              <span className="text-xs font-semibold text-white">Transcribing Audio…</span>
              <p className="text-[10px] text-[var(--text-secondary)]">Running WhisperX / Deepgram Nova-2</p>
            </div>
          </div>
        )}

        {/* Captions loaded - display styling & list */}
        {captions.length > 0 && !status && (
          <div className="space-y-5">
            {/* Global Styling Inspector */}
            <div className="space-y-2">
              <label className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
                Captions Styling
              </label>
              <div className="bg-[var(--bg-surface)] p-3 rounded border border-[var(--border)] space-y-3 text-xs">
                {/* Font selection */}
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Font Family:</span>
                  <select
                    value={fontFamily}
                    onChange={(e) => handleUpdateGlobalStyling("fontFamily", e.target.value)}
                    className="bg-[var(--bg-panel)] border border-[var(--border)] rounded px-1.5 py-0.5 text-white"
                  >
                    <option value="Outfit">Outfit</option>
                    <option value="Inter">Inter</option>
                    <option value="sans-serif">System Sans</option>
                  </select>
                </div>

                {/* Font Size */}
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Font Size:</span>
                  <input
                    type="number"
                    min="10"
                    max="72"
                    value={fontSize}
                    onChange={(e) => handleUpdateGlobalStyling("fontSize", e.target.value)}
                    className="w-16 bg-[var(--bg-panel)] border border-[var(--border)] rounded px-1.5 py-0.5 text-white text-right font-mono"
                  />
                </div>

                {/* Color */}
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Text Color:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleUpdateGlobalStyling("color", e.target.value)}
                      className="w-6 h-5 bg-transparent border-0 cursor-pointer focus:outline-none"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => handleUpdateGlobalStyling("color", e.target.value)}
                      className="w-20 bg-[var(--bg-panel)] border border-[var(--border)] rounded px-1.5 py-0.5 text-white text-center font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Height Position slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)]">Vertical Position (Y)</span>
                    <span className="font-mono">{(posY * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.02"
                    value={posY}
                    onChange={(e) => handleUpdateGlobalStyling("posY", e.target.value)}
                    className="w-full h-1 accent-[var(--accent)]"
                  />
                </div>
              </div>
            </div>

            {/* SRT/VTT export actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleExportSubtitle("srt")}
                className="flex-1 py-1.5 text-[10px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded font-semibold text-white transition-colors"
              >
                📥 Export SRT
              </button>
              <button
                onClick={() => handleExportSubtitle("vtt")}
                className="flex-1 py-1.5 text-[10px] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded font-semibold text-white transition-colors"
              >
                📥 Export VTT
              </button>
            </div>

            {/* Transcript Sync list */}
            <div className="space-y-2">
              <label className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">
                Transcript Segments
              </label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {captions.map((clip) => {
                  const isActive = playheadTime >= clip.startTime && playheadTime <= clipEndTime(clip);
                  return (
                    <div
                      key={clip.id}
                      onClick={() => setPlayhead(clip.startTime)}
                      className={`p-2.5 rounded border transition-all cursor-pointer text-xs space-y-1.5 ${
                        isActive
                          ? "bg-[var(--bg-hover)] border-[var(--accent)] shadow-md"
                          : "bg-[var(--bg-panel)] border-[var(--border)] hover:bg-[var(--bg-hover)]/40"
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-secondary)]">
                        <span>{formatTimecode(clip.startTime, 30)}</span>
                        {isActive && <span className="text-[var(--accent)] font-bold">ACTIVE</span>}
                      </div>
                      <input
                        type="text"
                        value={clip.text || ""}
                        onClick={(e) => e.stopPropagation()} // Prevent seek when clicking input
                        onChange={(e) => updateTextProperties(clip.id, { text: e.target.value })}
                        className="w-full bg-transparent border-0 border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] text-white focus:outline-none py-0.5 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clear / Re-run */}
            <button
              onClick={handleGenerateCaptions}
              className="w-full py-1.5 text-[10px] text-[var(--text-muted)] hover:text-white transition-colors"
            >
              🔄 Re-run Auto-Transcription
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
