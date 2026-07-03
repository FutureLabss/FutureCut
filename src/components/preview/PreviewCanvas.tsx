"use client";

// ============================================================
// FutureCut — Preview Canvas
// ============================================================
// Renders the current video frame at the playhead position
// using the preview engine. Maintains aspect ratio within
// the available space.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { getPreviewEngine } from "@/lib/preview/previewEngine";

export function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const isPlaying = useUIStore((s) => s.isPlaying);

  // Video dimensions from first asset
  const firstAsset = Object.values(assets)[0];
  const videoWidth = firstAsset?.width ?? 1920;
  const videoHeight = firstAsset?.height ?? 1080;

  // ============================================================
  // Set up render callback
  // ============================================================
  useEffect(() => {
    const engine = getPreviewEngine();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    engine.onRender((bitmap, width, height) => {
      if (!bitmap) {
        // Render black frame (gap in timeline)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // Clear and draw the frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    });

    // Update project state in the engine
    engine.updateProject(project, assets);
  }, [project, assets]);

  // ============================================================
  // Load assets into preview engine
  // ============================================================
  useEffect(() => {
    const engine = getPreviewEngine();
    for (const asset of Object.values(assets)) {
      engine.loadAsset(asset);
    }
  }, [assets]);

  // ============================================================
  // Seek when playhead changes (and not playing)
  // ============================================================
  useEffect(() => {
    if (!isPlaying) {
      const engine = getPreviewEngine();
      engine.seekTo(playheadTime);
    }
  }, [playheadTime, isPlaying]);

  // ============================================================
  // Play/Pause
  // ============================================================
  useEffect(() => {
    const engine = getPreviewEngine();
    if (isPlaying) {
      engine.play();

      // Sync playhead back from engine during playback
      const syncInterval = setInterval(() => {
        const time = engine.getCurrentTime();
        useUIStore.getState().setPlayhead(time);
      }, 1000 / 30); // 30fps sync

      return () => {
        clearInterval(syncInterval);
        engine.pause();
      };
    } else {
      engine.pause();
    }
  }, [isPlaying]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center w-full min-h-0"
    >
      <div
        className="relative bg-black rounded-lg overflow-hidden shadow-2xl"
        style={{
          aspectRatio: `${videoWidth} / ${videoHeight}`,
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "100%",
        }}
      >
        <canvas
          ref={canvasRef}
          width={videoWidth}
          height={videoHeight}
          className="w-full h-full object-contain"
        />

        {/* Play button overlay when paused */}
        {!isPlaying && Object.keys(assets).length > 0 && (
          <button
            onClick={() => useUIStore.getState().togglePlay()}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white ml-1"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
