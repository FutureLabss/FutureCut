"use client";

// ============================================================
// FutureCut — Export Dialog
// ============================================================
// Modal dialog for timeline export. Supports native WebCodecs
// hardware export, File System Access streaming, server-side fallback,
// ETA estimation, and clean cancellation.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { exportTimeline, downloadBlob, canUseNativeWebCodecs } from "@/lib/export/exportPipeline";
import { WebCodecsExporter } from "@/lib/export/webCodecsExporter";
import { submitServerRenderJob, pollServerRenderJob } from "@/lib/export/serverRenderJob";

type ExportState = "idle" | "configuring" | "exporting" | "done" | "error";
type ExportMode = "client" | "server";
type ResolutionPreset = "1080p" | "4k" | "720p";

export function ExportDialog() {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const setExporting = useUIStore((s) => s.setExporting);
  const exportProgress = useUIStore((s) => s.exportProgress);
  const setExportProgress = useUIStore((s) => s.setExportProgress);

  const [state, setState] = useState<ExportState>("idle");
  const [exportMode, setExportMode] = useState<ExportMode>("client");
  const [resolution, setResolution] = useState<ResolutionPreset>("1080p");
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [currentFrameInfo, setCurrentFrameInfo] = useState<string>("");

  const exporterRef = useRef<WebCodecsExporter | null>(null);

  const handleClose = useCallback(() => {
    if (exporterRef.current) {
      exporterRef.current.cancel();
      exporterRef.current = null;
    }
    setExporting(false);
    setExportProgress(null);
  }, [setExporting, setExportProgress]);

  const getTargetDimensions = useCallback(() => {
    if (resolution === "4k") return { width: 3840, height: 2160 };
    if (resolution === "720p") return { width: 1280, height: 720 };
    return { width: 1920, height: 1080 };
  }, [resolution]);

  const handleStartExport = useCallback(async () => {
    const hasClips = project.tracks.some((t) => t.clips.length > 0);
    if (!hasClips) {
      setError("No clips on timeline to export");
      setState("error");
      return;
    }

    setState("exporting");
    setError(null);
    setExportProgress(0);

    const dims = getTargetDimensions();

    if (exportMode === "server") {
      try {
        const job = await submitServerRenderJob(project, dims);
        setExportProgress(10);

        const outputUrl = await pollServerRenderJob(job.id, (prog) => {
          setExportProgress(prog);
        });

        setShareUrl(outputUrl);
        setState("done");
        setExportProgress(100);
      } catch (err) {
        console.error("Server export failed:", err);
        setError(err instanceof Error ? err.message : "Server render failed");
        setState("error");
      }
      return;
    }

    // Client-side export path
    try {
      // Create server job tracking record
      const jobRes = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const jobData = await jobRes.json().catch(() => ({ id: "client_job" }));
      const jobId = jobData.id || "client_job";

      // File System Access API progressive disk stream if supported and requested
      let writableStream: WritableStream<Uint8Array> | undefined;
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
          }).showSaveFilePicker({
            suggestedName: `${project.name}.mp4`,
            types: [{ description: "MP4 Video", accept: { "video/mp4": [".mp4"] } }],
          });
          writableStream = await handle.createWritable();
        } catch (_e) {
          // User cancelled file picker; proceed with in-memory Blob export
        }
      }

      if (canUseNativeWebCodecs()) {
        const exporter = new WebCodecsExporter();
        exporterRef.current = exporter;

        const result = await exporter.export({
          project,
          assets,
          width: dims.width,
          height: dims.height,
          onProgress: (prog) => {
            setExportProgress(prog.percent);
            setEtaSeconds(prog.etaSeconds);
            setCurrentFrameInfo(`Frame ${prog.currentFrame} / ${prog.totalFrames}`);
          },
          writableStream,
        });

        if (result) {
          setBlob(result);
        }
      } else {
        // Fallback to legacy exportTimeline path
        const result = await exportTimeline({
          project,
          assets,
          width: dims.width,
          height: dims.height,
          onProgress: (pct) => setExportProgress(pct),
        });
        setBlob(result);
      }

      // Mark project public for sharing
      await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });

      const origin = window.location.origin;
      setShareUrl(`${origin}/share/${jobId}`);
      setState("done");
      setExportProgress(100);
    } catch (err) {
      console.error("Export failed:", err);
      setError(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setState("error");
    } finally {
      exporterRef.current = null;
    }
  }, [project, assets, exportMode, getTargetDimensions, setExportProgress]);

  const handleDownload = useCallback(() => {
    if (blob) {
      const name = project.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      downloadBlob(blob, `${name}_export.mp4`);
    }
  }, [blob, project.name]);

  useEffect(() => {
    if (state === "idle") {
      queueMicrotask(() => {
        setState("configuring");
      });
    }
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)] shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Export Video
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Configuring State */}
        {state === "configuring" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Resolution
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["720p", "1080p", "4k"] as ResolutionPreset[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                      resolution === r
                        ? "bg-[var(--accent)] border-transparent text-white"
                        : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Render Engine Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setExportMode("client")}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition-colors ${
                    exportMode === "client"
                      ? "bg-[var(--accent)] border-transparent text-white"
                      : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="font-semibold">Browser (Local)</div>
                  <div className="text-[10px] opacity-80">WebCodecs Hardware</div>
                </button>
                <button
                  onClick={() => setExportMode("server")}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition-colors ${
                    exportMode === "server"
                      ? "bg-[var(--accent)] border-transparent text-white"
                      : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="font-semibold">Cloud (Server)</div>
                  <div className="text-[10px] opacity-80">Reliability Fallback</div>
                </button>
              </div>
            </div>

            <button
              onClick={handleStartExport}
              className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
            >
              Start Export
            </button>
          </div>
        )}

        {/* Exporting state */}
        {state === "exporting" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Rendering timeline frame-by-frame…</span>
              <span className="font-mono text-[var(--text-primary)] font-semibold">
                {exportProgress ?? 0}%
              </span>
            </div>

            <div className="w-full h-2.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                style={{ width: `${exportProgress ?? 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
              <span>{currentFrameInfo}</span>
              {etaSeconds !== null && <span>ETA: ~{etaSeconds}s</span>}
            </div>

            <button
              onClick={handleClose}
              className="w-full py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--danger)] text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors mt-2"
            >
              Cancel Export
            </button>
          </div>
        )}

        {/* Done state */}
        {state === "done" && (
          <div className="text-center py-2 space-y-4">
            <div>
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-[var(--text-primary)] font-medium">
                Export complete!
              </p>
              {blob && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {(blob.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-center">
              {blob && (
                <button
                  onClick={handleDownload}
                  className="px-6 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Download MP4
                </button>
              )}
            </div>

            {shareUrl && (
              <div className="mt-4 pt-4 border-t border-[var(--border)] text-left">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Share Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-primary)] font-medium transition-colors min-w-[70px]"
                  >
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="text-center py-2">
            <div className="text-3xl mb-2">❌</div>
            <p className="text-sm text-[var(--danger)] mb-4">{error}</p>
            <button
              onClick={() => setState("configuring")}
              className="px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
