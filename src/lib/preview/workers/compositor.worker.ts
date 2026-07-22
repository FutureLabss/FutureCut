// ============================================================
// FutureCut — Offscreen Worker Compositor
// ============================================================
// Web Worker that receives the OffscreenCanvas from the main thread
// and executes WebGL / 2D GPU compositing off the main UI thread.
// ============================================================

import { GpuCompositor, type LayerBitmap } from "../gpuCompositor";

let compositor: GpuCompositor | null = null;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case "initCanvas": {
      const { canvas } = payload as { canvas: OffscreenCanvas };
      compositor = new GpuCompositor(canvas);
      self.postMessage({ type: "canvasInitialized", isFallback: compositor.isFallback });
      break;
    }

    case "renderFrame": {
      const { layers, width, height } = payload as {
        layers: LayerBitmap[];
        width: number;
        height: number;
      };

      if (compositor) {
        compositor.render(layers, width, height);
      }

      // Close layer bitmaps after rendering to immediately release GPU texture resources
      for (const layer of layers) {
        if (layer.bitmap) {
          layer.bitmap.close();
        }
      }
      break;
    }

    default:
      console.warn("Unknown message type in compositor.worker:", type);
  }
};
