// ============================================================
// FutureCut — WebCodecs Native Export Engine
// ============================================================
// Frame-accurate, losslessly-intended video export pipeline.
// Re-renders directly from original high-res media (ignoring proxies),
// composites via shared renderFrame compositor, encodes natively using
// VideoEncoder/AudioEncoder, and muxes MP4 chunks with strict backpressure
// and memory safety.
// ============================================================

import { Muxer, ArrayBufferTarget, StreamTarget } from "mp4-muxer";
import type { Project, Asset } from "../model/types";
import { renderFrame } from "../preview/compositor";
import { Demuxer, type DemuxedSample } from "../preview/demuxer";
import { Decoder } from "../preview/decoder";

export interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  etaSeconds: number;
}

export interface WebCodecsExporterOptions {
  project: Project;
  assets: Record<string, Asset>;
  width?: number;
  height?: number;
  bitrateBps?: number;
  onProgress?: (progress: RenderProgress) => void;
  writableStream?: WritableStream<Uint8Array>;
}

export class OriginalMediaResolver {
  private sources: Map<
    string,
    {
      demuxer: Demuxer;
      decoder: Decoder;
      frames: { timestamp: number; bitmap: ImageBitmap }[];
      samples: DemuxedSample[];
      sampleIndex: number;
    }
  > = new Map();

  constructor(private assets: Record<string, Asset>) {}

  async init(assetIds: string[]): Promise<void> {
    for (const id of assetIds) {
      const asset = this.assets[id];
      // STRICT REQUIREMENT: Always use asset.file (original high-res source), NEVER proxies
      if (!asset || !asset.file) continue;

      const demuxer = new Demuxer();
      const frames: { timestamp: number; bitmap: ImageBitmap }[] = [];
      const samples: DemuxedSample[] = [];

      const decoder = new Decoder({
        onFrame: async (frame: VideoFrame) => {
          try {
            const bitmap = await createImageBitmap(frame);
            frames.push({ timestamp: frame.timestamp, bitmap });
          } finally {
            frame.close();
          }
        },
        onError: (err) => {
          console.error(`Export demuxer/decoder error for original asset ${id}:`, err);
        },
      });

      // Demux directly from original source asset.file
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
          .then(() => demuxer.startExtracting())
          .catch((err) => reject(err));
      });

      this.sources.set(id, {
        demuxer,
        decoder,
        frames,
        samples,
        sampleIndex: 0,
      });
    }
  }

  async getFrame(assetId: string, sourceTimeSeconds: number): Promise<ImageBitmap | null> {
    const source = this.sources.get(assetId);
    if (!source) return null;

    const targetTimeUs = sourceTimeSeconds * 1_000_000;

    // Decode frames sequentially until we reach or pass target timestamp
    while (
      source.frames.length === 0 ||
      source.frames[source.frames.length - 1].timestamp < targetTimeUs
    ) {
      if (source.sampleIndex >= source.samples.length) break;

      const sample = source.samples[source.sampleIndex++];
      const chunk = new EncodedVideoChunk({
        type: sample.isKeyframe ? "key" : "delta",
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      });

      source.decoder.decode(chunk);
      await new Promise((r) => setTimeout(r, 0));
    }

    if (source.frames.length === 0) return null;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < source.frames.length; i++) {
      const diff = Math.abs(source.frames[i].timestamp - targetTimeUs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const matched = source.frames[closestIdx];

    // Evict older frames from buffer to maintain strict memory boundaries
    for (let i = 0; i < closestIdx; i++) {
      source.frames[i].bitmap.close();
    }
    source.frames = source.frames.slice(closestIdx);

    return matched.bitmap;
  }

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

export class WebCodecsExporter {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async export(options: WebCodecsExporterOptions): Promise<Blob | null> {
    this.isCancelled = false;
    const { project, assets, onProgress, writableStream } = options;

    const fps = project.fps || 30;
    const totalFrames = Math.max(1, Math.ceil(project.duration * fps));
    const frameDurationUs = Math.round((1 / fps) * 1_000_000);

    // Determine target dimensions from options or first video asset or default to 1920x1080
    const firstAsset = Object.values(assets)[0];
    const width = options.width || firstAsset?.width || 1920;
    const height = options.height || firstAsset?.height || 1080;
    const bitrate = options.bitrateBps || (width >= 3840 ? 40_000_000 : 15_000_000);

    // Set up offscreen canvas for frame compositing
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not initialize OffscreenCanvas context for export");

    // Identify referenced video assets
    const videoAssetIds = Array.from(
      new Set(
        project.tracks
          .filter((t) => t.type === "video")
          .flatMap((t) => t.clips)
          .map((c) => c.sourceId)
      )
    );

    const resolver = new OriginalMediaResolver(assets);
    await resolver.init(videoAssetIds);

    // Set up MP4 Muxer with streaming writer or in-memory array buffer target
    let streamWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
    if (writableStream) {
      streamWriter = writableStream.getWriter();
    }

    const target = streamWriter
      ? new StreamTarget({
          onData: (chunk) => {
            streamWriter?.write(chunk);
          },
        })
      : new ArrayBufferTarget();

    const muxer = new Muxer({
      target,
      video: {
        codec: "avc",
        width,
        height,
      },
      audio: {
        codec: "aac",
        numberOfChannels: 2,
        sampleRate: 44100,
      },
      fastStart: "in-memory",
    });

    // Configure WebCodecs VideoEncoder
    let videoEncoder: VideoEncoder | null = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (err) => console.error("VideoEncoder error:", err),
    });

    videoEncoder.configure({
      codec: "avc1.640028", // H.264 High Profile @ Level 4.0
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: "prefer-hardware",
    });

    const startTime = performance.now();

    try {
      // Step 1: Render and encode video frame-by-frame (Walk every frame in order without skipping)
      for (let i = 0; i < totalFrames; i++) {
        if (this.isCancelled) {
          throw new Error("Export cancelled by user");
        }

        const timeSeconds = i / fps;
        const timestampUs = i * frameDurationUs;

        // Render composite frame onto offscreen canvas using unified preview/export compositor
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
            return resolver.getFrame(clip.sourceId, sourceTime);
          },
        });

        // Create VideoFrame from canvas context
        const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
        const isKeyFrame = i % (fps * 2) === 0;

        try {
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } finally {
          // Immediately close VideoFrame to enforce strict memory boundaries
          videoFrame.close();
        }

        // Bounded queue backpressure: pause if encoder queue exceeds threshold
        while (videoEncoder.encodeQueueSize > 2) {
          if (this.isCancelled) throw new Error("Export cancelled by user");
          await new Promise((r) => setTimeout(r, 5));
        }

        // Progress calculation & reporting
        const percent = Math.round(((i + 1) / totalFrames) * 90);
        const elapsedSec = (performance.now() - startTime) / 1000;
        const framesPerSec = (i + 1) / elapsedSec;
        const remainingFrames = totalFrames - (i + 1);
        const etaSeconds = framesPerSec > 0 ? Math.round(remainingFrames / framesPerSec) : 0;

        onProgress?.({
          currentFrame: i + 1,
          totalFrames,
          percent,
          etaSeconds,
        });
      }

      // Flush remaining encoded frames
      await videoEncoder.flush();
      videoEncoder.close();
      videoEncoder = null;

      // Step 2: Render audio tracks via OfflineAudioContext & encode
      await this.encodeAudioTracks(project, assets, muxer);

      onProgress?.({
        currentFrame: totalFrames,
        totalFrames,
        percent: 100,
        etaSeconds: 0,
      });

      // Finalize muxer container
      muxer.finalize();

      if (streamWriter) {
        streamWriter.releaseLock();
        streamWriter = null;
      }

      if (target instanceof ArrayBufferTarget) {
        return new Blob([target.buffer], { type: "video/mp4" });
      }

      return null;
    } finally {
      resolver.dispose();
      if (videoEncoder && videoEncoder.state !== "closed") {
        videoEncoder.close();
      }
      if (streamWriter) {
        streamWriter.releaseLock();
      }
    }
  }

  /**
   * Mixes all audio tracks on timeline via OfflineAudioContext and feeds encoded audio into MP4 muxer.
   */
  private async encodeAudioTracks(
    project: Project,
    assets: Record<string, Asset>,
    muxer: Muxer<ArrayBufferTarget | StreamTarget>
  ): Promise<void> {
    const audioTracks = project.tracks.filter((t) => t.type === "audio" && !t.muted);
    if (audioTracks.length === 0) return;

    const sampleRate = 44100;
    const totalSamples = Math.ceil(project.duration * sampleRate);
    if (totalSamples <= 0) return;

    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    // Decode and position audio clips
    for (const track of audioTracks) {
      const volume = track.volume ?? 1.0;
      for (const clip of track.clips) {
        const asset = assets[clip.sourceId];
        // Always use original asset.file for highest audio fidelity
        if (!asset || !asset.file) continue;

        try {
          const arrayBuf = await asset.file.arrayBuffer();
          const decodedBuffer = await offlineCtx.decodeAudioData(arrayBuf);

          const sourceNode = offlineCtx.createBufferSource();
          sourceNode.buffer = decodedBuffer;

          const gainNode = offlineCtx.createGain();
          gainNode.gain.value = volume;

          sourceNode.connect(gainNode);
          gainNode.connect(offlineCtx.destination);

          // Position clip in offline audio timeline
          sourceNode.start(clip.startTime, clip.sourceInPoint, clip.sourceOutPoint - clip.sourceInPoint);
        } catch (err) {
          console.warn(`Failed to process audio clip ${clip.id}:`, err);
        }
      }
    }

    const renderedAudioBuf = await offlineCtx.startRendering();

    // Configure AudioEncoder
    let audioEncoder: AudioEncoder | null = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => console.error("AudioEncoder error:", err),
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC Low Complexity
      numberOfChannels: 2,
      sampleRate,
      bitrate: 192_000,
    });

    const leftChannel = renderedAudioBuf.getChannelData(0);
    const rightChannel = renderedAudioBuf.getChannelData(1);

    // Feed PCM samples in 1024-sample frames (standard AAC frame size)
    const frameSize = 1024;
    for (let offset = 0; offset < totalSamples; offset += frameSize) {
      if (this.isCancelled) break;

      const size = Math.min(frameSize, totalSamples - offset);
      const interleaved = new Float32Array(size * 2);

      for (let i = 0; i < size; i++) {
        interleaved[i * 2] = leftChannel[offset + i];
        interleaved[i * 2 + 1] = rightChannel[offset + i];
      }

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfChannels: 2,
        numberOfFrames: size,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: interleaved,
      });

      try {
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }

      while (audioEncoder.encodeQueueSize > 2) {
        if (this.isCancelled) break;
        await new Promise((r) => setTimeout(r, 5));
      }
    }

    if (audioEncoder && audioEncoder.state !== "closed") {
      await audioEncoder.flush();
      audioEncoder.close();
      audioEncoder = null;
    }
  }
}
