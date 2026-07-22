// ============================================================
// FutureCut — Export Pipeline (Phase 3 Multi-Track)
// ============================================================
// Performs frame-by-frame canvas compositing using the shared
// `renderFrame` compositor, writing JPEGs to the virtual FS.
// Mixes multiple audio tracks with volume adjustments, offsets,
// trims, and pitch-resampled speed multipliers in a single-pass
// ffmpeg.wasm execution.
// ============================================================

import { getFFmpeg } from "./ffmpegLoader";
import { fetchFile } from "@ffmpeg/util";
import type { Project, Asset } from "../model/types";
import { clipEndTime } from "../model/types";
import { renderFrame } from "../preview/compositor";
import { Demuxer, type DemuxedSample } from "../preview/demuxer";
import { Decoder } from "../preview/decoder";
import { WebCodecsExporter } from "./webCodecsExporter";

export type ExportProgressCallback = (progress: number) => void;

export interface ExportOptions {
  project: Project;
  assets: Record<string, Asset>;
  width?: number;
  height?: number;
  bitrateBps?: number;
  onProgress?: ExportProgressCallback;
  writableStream?: WritableStream<Uint8Array>;
  useServerFallback?: boolean;
}

export function canUseNativeWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined";
}

/**
 * On-demand sequential frame resolver for video assets.
 * Streams chunks progressively to minimize memory consumption.
 */
class ExportFrameResolver {
  private sources: Map<
    string,
    {
      decoder: Decoder;
      demuxer: Demuxer;
      frames: { timestamp: number; bitmap: ImageBitmap }[];
      samples: DemuxedSample[];
      sampleIndex: number;
    }
  > = new Map();

  constructor(private assets: Record<string, Asset>) {}

  /** Initialize decoders for all referenced video assets */
  async init(assetIds: string[]): Promise<void> {
    for (const id of assetIds) {
      const asset = this.assets[id];
      if (!asset) continue;

      const demuxer = new Demuxer();
      const frames: { timestamp: number; bitmap: ImageBitmap }[] = [];
      const samples: DemuxedSample[] = [];

      const decoder = new Decoder({
        onFrame: async (frame) => {
          // Convert VideoFrame to ImageBitmap for offscreen drawing
          const bitmap = await createImageBitmap(frame);
          frames.push({ timestamp: frame.timestamp, bitmap });
          frame.close();
        },
        onError: (err) => {
          console.error("Export decoder error:", err);
        },
      });

      // Demux all samples
      await new Promise<void>((resolve, reject) => {
        demuxer
          .init(
            asset.file,
            async (cfg) => {
              try {
                await decoder.configure({
                  codec: cfg.codec,
                  codedWidth: cfg.codedWidth,
                  codedHeight: cfg.codedHeight,
                  description: cfg.description,
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            (s) => {
              samples.push(...s);
            }
          )
          .then(() => {
            demuxer.startExtracting();
          })
          .catch((err) => {
            reject(err);
          });
      });

      this.sources.set(id, {
        decoder,
        demuxer,
        frames,
        samples,
        sampleIndex: 0,
      });
    }
  }

  /** Retrieve the closest frame for a given clip source time (in seconds) */
  async getFrame(
    assetId: string,
    sourceTimeSeconds: number
  ): Promise<ImageBitmap | null> {
    const source = this.sources.get(assetId);
    if (!source) return null;

    const targetTimeUs = sourceTimeSeconds * 1_000_000;

    // Decode more frames linearly until we reach the target time
    while (
      source.frames.length === 0 ||
      source.frames[source.frames.length - 1].timestamp < targetTimeUs
    ) {
      if (source.sampleIndex >= source.samples.length) {
        break; // end of file reached
      }

      const sample = source.samples[source.sampleIndex++];
      const chunk = new EncodedVideoChunk({
        type: sample.isKeyframe ? "key" : "delta",
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      });

      source.decoder.decode(chunk);

      // Yield event loop execution to allow output callback to fire
      await new Promise((r) => setTimeout(r, 0));
    }

    if (source.frames.length === 0) return null;

    // Find the closest decoded frame in our list
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < source.frames.length; i++) {
      const diff = Math.abs(source.frames[i].timestamp - targetTimeUs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const result = source.frames[closestIdx];

    // Evict older frames from the buffer since time only increases forward
    for (let i = 0; i < closestIdx; i++) {
      source.frames[i].bitmap.close();
    }
    source.frames = source.frames.slice(closestIdx);

    return result.bitmap;
  }

  /** Clean up decoders */
  dispose(): void {
    for (const source of this.sources.values()) {
      source.decoder.dispose();
      source.demuxer.dispose();
      for (const f of source.frames) {
        f.bitmap.close();
      }
    }
    this.sources.clear();
  }
}

/**
 * Builds chainable atempo filters in FFmpeg based on speed.
 * Value range must fit between [0.5, 2.0].
 */
function getAtempoFilter(speed: number): string {
  if (Math.abs(speed - 1.0) < 0.01) return "";

  const factors: number[] = [];
  let rem = speed;

  while (rem > 2.0) {
    factors.push(2.0);
    rem /= 2.0;
  }
  while (rem < 0.5) {
    factors.push(0.5);
    rem /= 0.5;
  }
  factors.push(rem);

  return factors.map((f) => `atempo=${f.toFixed(2)}`).join(",");
}

/**
 * Composite the timeline and export it into an MP4 file.
 */
export async function exportTimeline(options: ExportOptions): Promise<Blob> {
  const { project, assets, onProgress } = options;

  // Try WebCodecs native hardware export first
  if (canUseNativeWebCodecs()) {
    try {
      const exporter = new WebCodecsExporter();
      const resultBlob = await exporter.export({
        project,
        assets,
        width: options.width,
        height: options.height,
        bitrateBps: options.bitrateBps,
        onProgress: (prog) => onProgress?.(prog.percent),
        writableStream: options.writableStream,
      });

      if (resultBlob) {
        return resultBlob;
      }
    } catch (err) {
      console.warn("WebCodecs native export failed, falling back to FFmpeg WASM:", err);
    }
  }

  // Fallback: FFmpeg WASM single-pass rendering
  return exportTimelineFFmpeg(options);
}

export async function exportTimelineFFmpeg(options: ExportOptions): Promise<Blob> {
  const { project, assets, onProgress } = options;
  const ffmpeg = await getFFmpeg();

  // Find all referenced video asset IDs
  const videoAssetIds = Array.from(
    new Set(
      project.tracks
        .filter((t) => t.type === "video")
        .flatMap((t) => t.clips)
        .map((c) => c.sourceId)
    )
  );

  const resolver = new ExportFrameResolver(assets);
  await resolver.init(videoAssetIds);

  const totalFrames = Math.max(1, Math.ceil(project.duration * project.fps));
  const frameDuration = 1 / project.fps;

  // Resolve dimensions from the first video asset or default to 1280x720
  const firstVideoTrack = project.tracks.find((t) => t.type === "video");
  const firstVideoClip = firstVideoTrack?.clips[0];
  const firstAsset = firstVideoClip ? assets[firstVideoClip.sourceId] : null;
  const width = firstAsset?.width ?? 1280;
  const height = firstAsset?.height ?? 720;

  // Set up offscreen canvas for frame composting
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not construct Offscreen Canvas Context");

  // ============================================================
  // Step 1: Render and write composite frames (0% to 60% progress)
  // ============================================================
  for (let i = 0; i < totalFrames; i++) {
    const timeSeconds = i * frameDuration;

    await renderFrame({
      project,
      timeSeconds,
      ctx,
      canvasWidth: width,
      canvasHeight: height,
      getVideoFrame: (clipId, sourceTime) => {
        const clip = project.tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === clipId);
        if (!clip) return null;

        // Retrieve decoded source frame asynchronously from decoder stream
        return resolver.getFrame(clip.sourceId, sourceTime);
      },
    });

    // Convert offscreen canvas to JPEG blob and write to virtual filesystem
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.9,
    });
    const fileData = await fetchFile(blob);
    await ffmpeg.writeFile(`frame_${i}.jpg`, fileData);

    onProgress?.(Math.round((i / totalFrames) * 60));
  }

  // Cleanup resolver
  resolver.dispose();

  // ============================================================
  // Step 2: Build FFmpeg audio mix and encode (60% to 100% progress)
  // ============================================================
  const ffmpegArgs: string[] = ["-framerate", String(project.fps), "-i", "frame_%d.jpg"];

  // Track and write audio asset inputs
  const audioTracks = project.tracks.filter(
    (t) => t.type === "audio" && !t.muted && t.clips.length > 0
  );

  const audioAssetIds = Array.from(
    new Set(audioTracks.flatMap((t) => t.clips).map((c) => c.sourceId))
  );

  // Write audio asset files to virtual system
  const assetFileMap: Record<string, string> = {};
  for (let idx = 0; idx < audioAssetIds.length; idx++) {
    const aid = audioAssetIds[idx];
    const asset = assets[aid];
    if (asset) {
      const filename = `audio_${idx}.mp4`;
      const audioData = await fetchFile(asset.file);
      await ffmpeg.writeFile(filename, audioData);
      assetFileMap[aid] = filename;
    }
  }

  // Append input files to FFmpeg args
  audioAssetIds.forEach((aid) => {
    ffmpegArgs.push("-i", assetFileMap[aid]);
  });

  // Construct audio filters
  let audioFilter = "";
  if (audioTracks.length > 0) {
    const filterParts: string[] = [];
    let mixInputs = 0;

    audioTracks.forEach((track) => {
      track.clips.forEach((clip) => {
        const inputIdx = audioAssetIds.indexOf(clip.sourceId);
        if (inputIdx !== -1) {
          const fileInputIndex = inputIdx + 1; // 0 is the JPEGs sequence input
          const delayMs = Math.round(clip.startTime * 1000);
          const vol = track.volume ?? 1.0;
          const outLabel = `a_clip_${mixInputs}`;

          // Calculate average speed value for atempo pitch alignment
          const speedVal =
            clip.speed?.points && clip.speed.points.length > 0
              ? clip.speed.points.reduce((acc, p) => acc + p.speed, 0) /
                clip.speed.points.length
              : 1.0;

          const tempoFilter = getAtempoFilter(speedVal);

          // Trim, reset pts, apply atempo, apply delay, and apply track volume
          filterParts.push(
            `[${fileInputIndex}:a]atrim=start=${clip.sourceInPoint}:end=${
              clip.sourceOutPoint
            },asetpts=PTS-STARTPTS${
              tempoFilter ? "," + tempoFilter : ""
            },adelay=${delayMs}|${delayMs},volume=${vol}[${outLabel}]`
          );
          mixInputs++;
        }
      });
    });

    if (mixInputs > 0) {
      const inputsList = Array.from({ length: mixInputs }, (_, i) => `[a_clip_${i}]`).join("");
      filterParts.push(`${inputsList}amix=inputs=${mixInputs}[a]`);
      audioFilter = filterParts.join(";");
    }
  }

  // Set up progress tracking for encoding
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(100, 60 + Math.round(progress * 40)));
  };
  ffmpeg.on("progress", progressHandler);

  // FFmpeg command array
  ffmpegArgs.push("-c:v", "libx264", "-pix_fmt", "yuv420p");

  if (audioFilter) {
    ffmpegArgs.push("-filter_complex", audioFilter, "-map", "0:v", "-map", "[a]", "-c:a", "aac");
  } else {
    ffmpegArgs.push("-map", "0:v");
  }

  ffmpegArgs.push("-movflags", "faststart", "-y", "output.mp4");

  try {
    await ffmpeg.exec(ffmpegArgs);

    // Read final output file
    const outputData = await ffmpeg.readFile("output.mp4");
    const finalBytes =
      outputData instanceof Uint8Array ? new Uint8Array(outputData) : outputData;
    const finalBlob = new Blob([finalBytes], { type: "video/mp4" });

    // ============================================================
    // Cleanup virtual filesystem files
    // ============================================================
    for (let i = 0; i < totalFrames; i++) {
      try {
        await ffmpeg.deleteFile(`frame_${i}.jpg`);
      } catch (_e) {}
    }
    for (const key in assetFileMap) {
      try {
        await ffmpeg.deleteFile(assetFileMap[key]);
      } catch (_e) {}
    }
    try {
      await ffmpeg.deleteFile("output.mp4");
    } catch (_e) {}

    return finalBlob;
  } finally {
    ffmpeg.off("progress", progressHandler);
  }
}

/**
 * Trigger download of the exported video file.
 */
export function downloadBlob(blob: Blob, filename: string = "export.mp4"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
