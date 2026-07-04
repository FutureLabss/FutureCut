"use client";

// ============================================================
// FutureCut — Upload Zone
// ============================================================
// Drag-and-drop or file picker for importing video files.
// Shown when no content has been imported yet.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { getPreviewEngine } from "@/lib/preview/previewEngine";

export function UploadZone() {
  const addAsset = useEditorStore((s) => s.addAsset);
  const serverProjectId = useEditorStore((s) => s.serverProjectId);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // Process uploaded file
  // ============================================================
  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setError("Please upload a video file (MP4, WebM, etc.)");
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Upload file to the server
        const formData = new FormData();
        formData.append("file", file);
        if (serverProjectId) {
          formData.append("projectId", serverProjectId);
        }

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload video to server");
        }

        const uploadData = await uploadRes.json();
        const serverUrl = uploadData.url;

        // Create object URL
        const objectUrl = URL.createObjectURL(file);

        // Extract metadata using a video element
        const metadata = await extractMetadata(file, objectUrl);

        // Create asset in the store
        const assetId = addAsset({
          fileName: file.name,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          objectUrl,
          file,
          codec: metadata.codec,
          serverUrl,
        });

        // Load into preview engine
        const engine = getPreviewEngine();
        const asset = useEditorStore.getState().assets[assetId];
        if (asset) {
          await engine.loadAsset(asset);

          // Update engine with project state
          const project = useEditorStore.getState().project;
          engine.updateProject(project, useEditorStore.getState().assets);

          // Seek to start
          engine.seekTo(0);
        }
      } catch (err) {
        console.error("Failed to process video:", err);
        setError(
          `Failed to process video: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [addAsset]
  );

  // ============================================================
  // Drag and drop handlers
  // ============================================================
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div
      className="flex-1 flex items-center justify-center p-8"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`
          w-full max-w-lg p-12 rounded-2xl border-2 border-dashed
          flex flex-col items-center justify-center gap-4
          transition-all duration-200 cursor-pointer
          ${
            isDragOver
              ? "border-[var(--accent)] bg-[var(--accent-dim)] scale-[1.02]"
              : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
          }
        `}
        onClick={() => inputRef.current?.click()}
      >
        {isProcessing ? (
          <>
            <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)]">
              Processing video...
            </p>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[var(--text-muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Drop a video file here
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                or click to browse · MP4, WebM, MOV
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="text-xs text-[var(--danger)] mt-2">{error}</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}

// ============================================================
// Extract video metadata using HTMLVideoElement
// ============================================================
async function extractMetadata(
  file: File,
  objectUrl: string
): Promise<{
  duration: number;
  width: number;
  height: number;
  codec?: string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    // Environment attributes: bypass browser sandbox restrictions that block
    // visual frame decoding. Without these, some browsers (mobile Safari,
    // certain Chromium builds) refuse to populate the video frame buffer,
    // which can hold a hardware codec lock and starve WebCodecs downstream.
    video.playsInline = true;
    video.muted = true;
    video.crossOrigin = "anonymous";

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      // Release the element fully to free any codec resources
      video.removeAttribute("src");
      video.load();
    };

    video.onerror = () => {
      reject(new Error("Failed to load video metadata"));
      video.removeAttribute("src");
      video.load();
    };

    video.src = objectUrl;
  });
}
