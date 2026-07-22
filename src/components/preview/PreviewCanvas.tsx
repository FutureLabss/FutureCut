"use client";

// ============================================================
// FutureCut — Preview Canvas
// ============================================================
// Renders the current video frame at the playhead position
// using the preview engine. Maintains aspect ratio within
// the available space.
// ============================================================

import { useRef, useEffect } from "react";
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
  const isBuffering = useUIStore((s) => s.isBuffering);
  const isDecoding = useUIStore((s) => s.isDecoding);
  const decodeProgress = useUIStore((s) => s.decodeProgress);

  // Video dimensions from first asset
  const firstAsset = Object.values(assets)[0];
  const videoWidth = firstAsset?.width ?? 1920;
  const videoHeight = firstAsset?.height ?? 1080;

  // ============================================================
  // Set up render + buffering + decode progress callbacks
  // ============================================================
  useEffect(() => {
    const engine = getPreviewEngine();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    engine.onRender((bitmap, _width, _height) => {
      if (!bitmap) {
        // Render black frame (gap in timeline)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // ReadyState guard: only draw if the bitmap carries actual pixel data.
      // This mirrors the HTMLVideoElement readyState >= 2 (HAVE_CURRENT_DATA)
      // check — in the WebCodecs pipeline, an empty bitmap means the decoder
      // hasn't populated the frame buffer yet. Drawing it would overwrite the
      // last good frame and freeze the visual preview.
      if (bitmap.width === 0 || bitmap.height === 0) {
        bitmap.close();
        return;
      }

      // Clear and draw the frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      // Release the ImageBitmap after painting to free GPU memory promptly
      bitmap.close();
    });

    // Wire up buffering callback → UI store
    engine.onBuffering((buffering) => {
      useUIStore.getState().setBuffering(buffering);
    });

    // Wire up decode progress callback → UI store
    engine.onDecodeProgress((decoded, total) => {
      if (total > 0) {
        const pct = Math.round((decoded / total) * 100);
        useUIStore.getState().setDecodeProgress(pct);

        // Auto-clear decoding state when complete
        if (decoded >= total) {
          useUIStore.getState().setDecoding(false);
          useUIStore.getState().setDecodeProgress(null);
        }
      }
    });

    // Update project state in the engine
    engine.updateProject(project, assets);
  }, [project, assets]);

  // ============================================================
  // Load assets into preview engine & gate on decode
  // ============================================================
  useEffect(() => {
    const engine = getPreviewEngine();
    const assetList = Object.values(assets);
    if (assetList.length === 0) return;

    // Mark decoding state before loading starts
    useUIStore.getState().setDecoding(true);
    useUIStore.getState().setDecodeProgress(0);

    // Load all assets
    for (const asset of assetList) {
      engine.loadAsset(asset);
    }

    // Await full decode with 3s max timeout, then clear the gate
    Promise.race([
      engine.awaitFullDecode(3000),
      new Promise((res) => setTimeout(res, 3000)),
    ]).finally(() => {
      useUIStore.getState().setDecoding(false);
      useUIStore.getState().setDecodeProgress(null);

      // Render the first frame so the canvas isn't blank
      engine.seekTo(useUIStore.getState().playheadTime);
    });
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

  // Compute the circular progress ring
  const progressPct = decodeProgress ?? 0;
  const circumference = 2 * Math.PI * 36; // r=36
  const strokeOffset = circumference - (progressPct / 100) * circumference;

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

        {/* Decode progress overlay — blocks interaction until ready */}
        {isDecoding && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto z-20">
            {/* Circular progress ring */}
            <div className="relative w-24 h-24 mb-4">
              <svg
                className="w-24 h-24 -rotate-90"
                viewBox="0 0 80 80"
              >
                {/* Background ring */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="4"
                />
                {/* Progress ring */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="url(#decode-gradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  style={{ transition: "stroke-dashoffset 200ms ease-out" }}
                />
                <defs>
                  <linearGradient
                    id="decode-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="hsl(230, 90%, 65%)" />
                    <stop offset="100%" stopColor="hsl(280, 80%, 65%)" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Percentage in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-semibold text-white tabular-nums">
                  {progressPct}%
                </span>
              </div>
            </div>

            <span className="text-sm font-medium text-white/80 tracking-wide">
              Preparing video…
            </span>
            <span className="text-xs text-white/50 mt-1">
              Decoding frames for smooth playback
            </span>
          </div>
        )}

        {/* Buffering indicator (during playback only) */}
        {isBuffering && isPlaying && !isDecoding && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-white/70 font-medium tracking-wide">
                Buffering…
              </span>
            </div>
          </div>
        )}

        {/* Play button overlay when paused and ready */}
        {!isPlaying && !isBuffering && !isDecoding && Object.keys(assets).length > 0 && (
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

