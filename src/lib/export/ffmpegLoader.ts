// ============================================================
// FutureCut — FFmpeg Loader
// ============================================================
// Lazy-loads ffmpeg.wasm only when export is triggered.
// Checks for SharedArrayBuffer availability first.
// ============================================================

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;

/**
 * Check if the browser environment supports ffmpeg.wasm.
 */
export function canUseFFmpeg(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

/**
 * Lazy-load and initialize ffmpeg.wasm.
 * Returns the same instance on subsequent calls.
 */
export async function getFFmpeg(
  onProgress?: (message: string) => void
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (isLoading) {
    // Wait for existing load to complete
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (ffmpegInstance) {
          clearInterval(check);
          resolve(ffmpegInstance);
        }
      }, 100);
    });
  }

  if (!canUseFFmpeg()) {
    throw new Error(
      "SharedArrayBuffer is not available. Ensure the page is served with " +
        "Cross-Origin-Opener-Policy: same-origin and " +
        "Cross-Origin-Embedder-Policy: credentialless headers."
    );
  }

  isLoading = true;
  onProgress?.("Loading FFmpeg...");

  const ffmpeg = new FFmpeg();

  // Log FFmpeg output for debugging
  ffmpeg.on("log", ({ message }) => {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.log("[FFmpeg]", message);
    }
  });

  // Load the WASM core from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegInstance = ffmpeg;
  isLoading = false;
  onProgress?.("FFmpeg loaded");

  return ffmpeg;
}
