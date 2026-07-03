// ============================================================
// FutureCut — Preview Engine (Phase 2 Multi-Track)
// ============================================================
// Orchestrates multi-track decoding and visual compositing.
// Employs a shared `renderFrame` call onto an OffscreenCanvas.
// Manages synchronized multi-track audio playback using HTMLAudioElements.
// ============================================================

import { Demuxer, type DemuxedSample, type DemuxerConfig } from "./demuxer";
import { Decoder } from "./decoder";
import { FrameCache } from "./frameCache";
import type { Asset, Clip, Track, Project } from "../model/types";
import { clipDuration, clipEndTime } from "../model/types";
import { renderFrame } from "./compositor";
import { sourceTimeForTimelineTime, getSpeedAtTime } from "../utils/speed";

export type RenderCallback = (
  bitmap: ImageBitmap | null,
  width: number,
  height: number
) => void;

interface ActiveSource {
  assetId: string;
  demuxer: Demuxer;
  decoder: Decoder;
  frameCache: FrameCache;
  config: DemuxerConfig;
}

/**
 * Preview engine: connects the timeline playhead to rendered video frames.
 */
export class PreviewEngine {
  private sources: Map<string, ActiveSource> = new Map();
  private renderCallback: RenderCallback | null = null;
  private animFrameId: number | null = null;
  private isPlaying = false;
  private currentTime = 0; // seconds
  private fps = 30;
  private lastFrameTime = 0;

  // Offscreen canvas for rendering the composite frame
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

  // Audio elements for real-time preview mixing
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  // References to timeline state — updated externally
  private project: Project | null = null;
  private assets: Record<string, Asset> = {};

  /**
   * Set the callback that receives rendered frames.
   */
  onRender(callback: RenderCallback): void {
    this.renderCallback = callback;
  }

  /**
   * Update the engine with current project state.
   */
  updateProject(project: Project, assets: Record<string, Asset>): void {
    this.project = project;
    this.assets = assets;
    this.fps = project.fps;

    // Sync track volume/mute controls in real-time
    this.syncAudioControls();
  }

  /**
   * Sync mute and volume levels for audio track playback.
   */
  private syncAudioControls() {
    if (!this.project || !this.project.tracks) return;

    for (const track of this.project.tracks) {
      if (track.type !== "audio") continue;

      const audioEl = this.audioElements.get(track.id);
      if (audioEl) {
        audioEl.volume = track.volume ?? 1.0;
        audioEl.muted = track.muted ?? false;
      }
    }
  }

  /**
   * Load a source asset for preview.
   */
  async loadAsset(asset: Asset): Promise<DemuxerConfig | null> {
    // Don't reload if already loaded
    if (this.sources.has(asset.id)) {
      return this.sources.get(asset.id)!.config;
    }

    const demuxer = new Demuxer();
    const frameCache = new FrameCache(15);

    return new Promise<DemuxerConfig | null>((resolve) => {
      let decoder: Decoder;
      let config: DemuxerConfig;

      const onConfig = async (cfg: DemuxerConfig) => {
        config = cfg;

        decoder = new Decoder({
          onFrame: async (frame: VideoFrame) => {
            // Cache the frame as ImageBitmap, then close the VideoFrame
            try {
              await frameCache.put(frame.timestamp, frame);
            } finally {
              frame.close();
            }
          },
          onError: (error) => {
            console.error(`Decoder error for asset ${asset.id}:`, error);
          },
        });

        // Configure the decoder
        const decoderConfig: VideoDecoderConfig = {
          codec: cfg.codec,
          codedWidth: cfg.codedWidth,
          codedHeight: cfg.codedHeight,
        };

        if (cfg.description) {
          decoderConfig.description = cfg.description;
        }

        try {
          await decoder.configure(decoderConfig);

          this.sources.set(asset.id, {
            assetId: asset.id,
            demuxer,
            decoder,
            frameCache,
            config: cfg,
          });

          resolve(cfg);
        } catch (err) {
          console.error(`Failed to configure decoder for asset ${asset.id}:`, err);
          resolve(null);
        }
      };

      const onSamples = (samples: DemuxedSample[]) => {
        if (!decoder?.isConfigured) return;

        for (const sample of samples) {
          const chunk = new EncodedVideoChunk({
            type: sample.isKeyframe ? "key" : "delta",
            timestamp: sample.timestamp,
            duration: sample.duration,
            data: sample.data,
          });

          decoder.decode(chunk);
        }
      };

      demuxer.init(asset.file, onConfig, onSamples)
        .then(() => {
          demuxer.startExtracting();
        })
        .catch((err) => {
          console.error(`Demuxer init failed for asset ${asset.id}:`, err);
          resolve(null);
        });
    });
  }

  /**
   * Seek to a specific time and render the frame.
   */
  async seekTo(timeSeconds: number): Promise<void> {
    this.currentTime = timeSeconds;
    if (!this.project) return;

    // Determine dimensions from the first video asset or default to 1280x720
    const firstAsset = Object.values(this.assets)[0];
    const width = firstAsset?.width ?? 1280;
    const height = firstAsset?.height ?? 720;

    // Initialize or resize offscreen canvas if necessary
    if (
      !this.offscreenCanvas ||
      this.offscreenCanvas.width !== width ||
      this.offscreenCanvas.height !== height
    ) {
      this.offscreenCanvas = new OffscreenCanvas(width, height);
      this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    }

    if (!this.offscreenCtx) return;

    // Composite all active video and text layers
    await renderFrame({
      project: this.project,
      timeSeconds,
      ctx: this.offscreenCtx,
      canvasWidth: width,
      canvasHeight: height,
      getVideoFrame: (clipId: string, sourceTime: number) => {
        // Find clip by ID to locate source asset
        const clip = this.project?.tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === clipId);

        if (!clip) return null;

        const source = this.sources.get(clip.sourceId);
        if (!source) return null;

        const sourceTimeUs = sourceTime * 1_000_000;
        return (
          source.frameCache.get(sourceTimeUs) ??
          source.frameCache.getNearest(sourceTimeUs)
        );
      },
    });

    // Extract the composite image bitmap and push to the canvas display
    const compositeBitmap = this.offscreenCanvas.transferToImageBitmap();
    this.renderCallback?.(compositeBitmap, width, height);

    // Sync HTML audio tracks current position
    this.syncAudioPositions(timeSeconds);
  }

  /**
   * Synchronize audio elements play/pause state and time positions.
   */
  private syncAudioPositions(timeSeconds: number) {
    if (!this.project) return;

    for (const track of this.project.tracks) {
      if (track.type !== "audio") continue;

      // Find if there is an active audio clip at the current time
      const activeClip = track.clips.find(
        (c) => timeSeconds >= c.startTime && timeSeconds <= clipEndTime(c)
      );

      let audioEl = this.audioElements.get(track.id);

      if (activeClip) {
        const asset = this.assets[activeClip.sourceId];
        if (!asset) continue;

        if (!audioEl) {
          audioEl = new Audio(asset.objectUrl);
          audioEl.loop = false;
          this.audioElements.set(track.id, audioEl);
          this.syncAudioControls();
        }

        // Map timeline position to source audio point
        const sourceTime = sourceTimeForTimelineTime(activeClip, timeSeconds - activeClip.startTime);
        const speedMultiplier = getSpeedAtTime(activeClip, sourceTime);

        // Adjust HTMLAudioElement playback rate to match clip speed
        audioEl.playbackRate = speedMultiplier;
        
        // Prevent audio loops and fight-condition resets by checking delta threshold
        if (Math.abs(audioEl.currentTime - sourceTime) > 0.1) {
          audioEl.currentTime = sourceTime;
        }

        if (this.isPlaying) {
          if (audioEl.paused) audioEl.play().catch(() => {});
        } else {
          if (!audioEl.paused) audioEl.pause();
        }
      } else {
        // Stop audio if no active clip on this track
        if (audioEl) {
          audioEl.pause();
          audioEl.currentTime = 0;
        }
      }
    }
  }

  /**
   * Start playback.
   */
  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    
    // Play active audio elements
    for (const audioEl of this.audioElements.values()) {
      audioEl.play().catch(() => {});
    }

    this.tick();
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.isPlaying = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Pause audio elements
    for (const audioEl of this.audioElements.values()) {
      audioEl.pause();
    }
  }

  /**
   * Get current playback time.
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.pause();
    for (const source of this.sources.values()) {
      source.decoder.dispose();
      source.demuxer.dispose();
      source.frameCache.clear();
    }
    this.sources.clear();

    // Clean up audio elements
    for (const audioEl of this.audioElements.values()) {
      audioEl.pause();
      audioEl.src = "";
    }
    this.audioElements.clear();

    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }

  // ============================================================
  // Private
  // ============================================================

  private tick = (): void => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = (now - this.lastFrameTime) / 1000; // seconds

    if (elapsed >= 1 / this.fps) {
      this.currentTime += elapsed;
      this.lastFrameTime = now;

      // Check if we've reached the end of the timeline
      if (this.project) {
        if (this.currentTime >= this.project.duration) {
          this.pause();
          return;
        }
      }

      this.seekTo(this.currentTime);
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };
}

// Singleton instance
let engineInstance: PreviewEngine | null = null;

export function getPreviewEngine(): PreviewEngine {
  if (!engineInstance) {
    engineInstance = new PreviewEngine();
  }
  return engineInstance;
}
