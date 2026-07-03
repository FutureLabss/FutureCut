"use client";

// ============================================================
// FutureCut — Export Dialog
// ============================================================
// Modal dialog showing export progress.
// Triggers the ffmpeg.wasm pipeline and provides download.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { exportTimeline, downloadBlob } from "@/lib/export/exportPipeline";
import { canUseFFmpeg } from "@/lib/export/ffmpegLoader";

type ExportState = "idle" | "loading" | "exporting" | "done" | "error";

export function ExportDialog() {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const setExporting = useUIStore((s) => s.setExporting);
  const exportProgress = useUIStore((s) => s.exportProgress);
  const setExportProgress = useUIStore((s) => s.setExportProgress);

  const [state, setState] = useState<ExportState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleClose = useCallback(() => {
    setExporting(false);
    setExportProgress(null);
  }, [setExporting, setExportProgress]);

  const handleExport = useCallback(async () => {
    if (!canUseFFmpeg()) {
      setError("SharedArrayBuffer is not available. Export requires cross-origin isolation.");
      setState("error");
      return;
    }

    const hasClips = project.tracks.some((t) => t.clips.length > 0);

    if (!hasClips) {
      setError("No clips on timeline to export");
      setState("error");
      return;
    }

    setState("loading");
    setError(null);

    try {
      // 1. Create render job on server
      const jobRes = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      if (!jobRes.ok) {
        throw new Error("Failed to initialize render job on server");
      }

      const jobData = await jobRes.json();
      const jobId = jobData.id;

      setState("exporting");

      // 2. Perform client-side render
      const result = await exportTimeline({
        project,
        assets,
        onProgress: (progress) => {
          // Scale export progress to 90%
          setExportProgress(Math.round(progress * 0.9));
        },
      });

      setBlob(result);

      // 3. Upload output to server
      setExportProgress(95);
      const formData = new FormData();
      formData.append("file", result, `${project.name}.mp4`);
      formData.append("jobId", jobId);

      const uploadRes = await fetch("/api/render/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload render output to server");
      }

      // 4. Mark project as public for sharing
      await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });

      // 5. Generate share link
      const origin = window.location.origin;
      setShareUrl(`${origin}/share/${jobId}`);
      setState("done");
      setExportProgress(100);
    } catch (err) {
      console.error("Export failed:", err);
      setError(
        `Export failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setState("error");
    }
  }, [project, assets, setExportProgress]);

  const handleDownload = useCallback(() => {
    if (blob) {
      const name = project.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      downloadBlob(blob, `${name}_export.mp4`);
    }
  }, [blob, project.name]);

  // Auto-start export
  useEffect(() => {
    if (state === "idle") {
      handleExport();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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

        {/* Content */}
        <div className="space-y-4">
          {/* Loading / Exporting state */}
          {(state === "loading" || state === "exporting") && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[var(--text-secondary)]">
                  {state === "loading"
                    ? "Loading FFmpeg..."
                    : "Exporting..."}
                </span>
                {exportProgress !== null && (
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    {exportProgress}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                  style={{
                    width: `${exportProgress ?? 0}%`,
                  }}
                />
              </div>
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
                <button
                  onClick={handleDownload}
                  className="px-6 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Download MP4
                </button>
              </div>

              {shareUrl && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] text-left">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Share Link (Anyone with this link can view)
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
              <p className="text-sm text-[var(--danger)]">{error}</p>
              <button
                onClick={handleExport}
                className="mt-4 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)] transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
