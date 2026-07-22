// ============================================================
// FutureCut — Off-Main-Thread Video Decoder Worker
// ============================================================
// Web Worker hosting Demuxer + VideoDecoder.
// Handles demuxing and hardware/software decoding off the main thread,
// transferring decoded ImageBitmaps straight to the main thread or cache.
// ============================================================

import { Demuxer, type DemuxerConfig, type DemuxedSample } from "../demuxer";
import { Decoder } from "../decoder";

let demuxer: Demuxer | null = null;
let decoder: Decoder | null = null;
let currentAssetId: string | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case "init": {
      const { assetId, file } = payload as { assetId: string; file: File };
      currentAssetId = assetId;

      if (demuxer) demuxer.dispose();
      if (decoder) decoder.dispose();

      demuxer = new Demuxer();
      decoder = new Decoder({
        onFrame: async (frame: VideoFrame) => {
          const timestampUs = frame.timestamp;
          try {
            // Convert VideoFrame to ImageBitmap for zero-copy transferable postMessage
            const bitmap = await createImageBitmap(frame);
            // Close VideoFrame immediately to release GPU memory
            frame.close();

            (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
              {
                type: "frame",
                assetId: currentAssetId,
                timestampUs,
                bitmap,
              },
              [bitmap]
            );
          } catch (err) {
            frame.close();
            console.error("Worker failed to convert VideoFrame to ImageBitmap:", err);
          }
        },
        onError: (err) => {
          self.postMessage({ type: "error", assetId: currentAssetId, message: err.message });
        },
      });

      await demuxer.init(
        file,
        async (config: DemuxerConfig) => {
          if (decoder) {
            await decoder.configure({
              codec: config.codec,
              codedWidth: config.codedWidth,
              codedHeight: config.codedHeight,
              description: config.description,
            });
          }
          self.postMessage({ type: "configured", assetId: currentAssetId, config });
        },
        (samples: DemuxedSample[]) => {
          for (const sample of samples) {
            const chunk = new EncodedVideoChunk({
              type: sample.isKeyframe ? "key" : "delta",
              timestamp: sample.timestamp,
              duration: sample.duration,
              data: sample.data,
            });
            if (decoder) {
              decoder.decode(chunk);
            }
          }
        }
      );

      demuxer.startExtracting();
      break;
    }

    case "seek": {
      const { timeInSeconds } = payload as { timeInSeconds: number };
      if (demuxer && decoder) {
        await decoder.reset();
        const keyframeTime = demuxer.getKeyframeTime(timeInSeconds);
        demuxer.seek(keyframeTime);
        self.postMessage({ type: "seekDone", assetId: currentAssetId, seekTime: keyframeTime });
      }
      break;
    }

    case "dispose": {
      if (demuxer) demuxer.dispose();
      if (decoder) decoder.dispose();
      demuxer = null;
      decoder = null;
      currentAssetId = null;
      break;
    }

    default:
      console.warn("Unknown message type in decoder.worker:", type);
  }
};
