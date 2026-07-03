// ============================================================
// Feature Detection
// ============================================================
// Check for browser capabilities required by the editor.
// Used to show fallback messages rather than failing silently.
// ============================================================

export interface FeatureSupport {
  webCodecs: boolean;
  sharedArrayBuffer: boolean;
  offscreenCanvas: boolean;
  allRequired: boolean;
}

/** Detect support for all required browser APIs */
export function detectFeatures(): FeatureSupport {
  const webCodecs =
    typeof globalThis !== "undefined" &&
    "VideoDecoder" in globalThis &&
    "VideoFrame" in globalThis &&
    "EncodedVideoChunk" in globalThis;

  const sharedArrayBuffer =
    typeof globalThis !== "undefined" &&
    "SharedArrayBuffer" in globalThis;

  const offscreenCanvas =
    typeof globalThis !== "undefined" &&
    "OffscreenCanvas" in globalThis;

  return {
    webCodecs,
    sharedArrayBuffer,
    offscreenCanvas,
    allRequired: webCodecs && sharedArrayBuffer,
  };
}

/** Get a human-readable message for missing features */
export function getUnsupportedMessage(features: FeatureSupport): string | null {
  if (features.allRequired) return null;

  const missing: string[] = [];
  if (!features.webCodecs) {
    missing.push(
      "WebCodecs API (required for video preview — try Chrome or Edge)"
    );
  }
  if (!features.sharedArrayBuffer) {
    missing.push(
      "SharedArrayBuffer (required for video export — ensure cross-origin isolation is enabled)"
    );
  }

  return `Your browser doesn't support: ${missing.join("; ")}. FutureCut requires a Chromium-based browser (Chrome, Edge, Opera, Brave) for full functionality.`;
}
