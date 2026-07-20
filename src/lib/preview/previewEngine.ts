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

export type BufferingCallback = (isBuffering: boolean) => void;
export type DecodeProgressCallback = (decoded: number, total: number) => void;

interface ActiveSource {
  assetId: string;
  demuxer: Demuxer;
  decoder: Decoder;
  frameCache: FrameCache;
  config: DemuxerConfig;
  /** Buffered samples waiting for decoder capacity (backpressure queue) */
  pendingSamples: DemuxedSample[];
  /** Total number of samples expected from demuxer */
  totalSamples: number;
  /** Number of frames successfully decoded so far */
  decodedFrames: number;
  lastSoughtKeyframeTime?: number;
}

/**
 * Preview engine: connects the timeline playhead to rendered video frames.
 */
export class PreviewEngine {
  private sources: Map<string, ActiveSource> = new Map();
  private renderCallback: RenderCallback | null = null;
  private bufferingCallback: BufferingCallback | null = null;
  private progressCallback: DecodeProgressCallback | null = null;
  private animFrameId: number | null = null;
  private isPlaying = false;
  private currentTime = 0; // seconds
  private fps = 30;
  private lastFrameTime = 0;

  // Guards against overlapping async renders within the tick loop
  private renderPending = false;

  // Buffering state: true when the playhead is ahead of decoded frames
  private _isBuffering = false;
  // Number of consecutive ticks spent buffering before we force-render
  private bufferingTicks = 0;
  private readonly MAX_BUFFERING_TICKS = 90; // ~3 seconds at 30fps — fallback

  // Resolvers waiting for full decode to complete
  private decodeResolvers: (() => void)[] = [];

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
   * Set the callback that fires when buffering state changes.
   */
  onBuffering(callback: BufferingCallback): void {
    this.bufferingCallback = callback;
  }

  /**
   * Set the callback that fires as frames are decoded.
   * Reports (decodedFrames, totalSamples) across all sources.
   */
  onDecodeProgress(callback: DecodeProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Returns a promise that resolves when ALL loaded sources have
   * finished decoding every sample. Use this to gate the editor UI
   * so the user never hits buffering on first play.
   */
  async awaitFullDecode(): Promise<void> {
    if (this.isFullyDecoded()) return;
    return new Promise<void>((resolve) => {
      this.decodeResolvers.push(resolve);
    });
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
    const frameCache = new FrameCache(300);

    return new Promise<DemuxerConfig | null>((resolve) => {
      let decoder: Decoder;
      let config: DemuxerConfig;

      const onConfig = async (cfg: DemuxerConfig) => {
        config = cfg;

        decoder = new Decoder({
          onFrame: async (frame: VideoFrame) => {
            // Immediately try to feed more samples since the decoder
            // just freed a pending slot (pendingFrames was decremented
            // before this callback). This keeps the pipeline saturated.
            this.drainSampleQueue(asset.id);

            // Cache the frame as ImageBitmap, then close the VideoFrame
            try {
              await frameCache.put(frame.timestamp, frame);
            } finally {
              frame.close();
            }

            // Trigger a re-render if we are not playing, so that seeks/scrubbing updates the canvas
            // as soon as the target frame is decoded!
            if (!this.isPlaying) {
              this.seekTo(this.currentTime).catch((err) => {
                console.error("Error seeking in onFrame callback:", err);
              });
            }

            // Track decode progress
            const source = this.sources.get(asset.id);
            if (source) {
              source.decodedFrames++;
              this.fireDecodeProgress();
              this.checkDecodeComplete();
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
            pendingSamples: [],
            totalSamples: cfg.numberOfSamples,
            decodedFrames: 0,
            lastSoughtKeyframeTime: 0,
          });

          resolve(cfg);
          this.checkDecodeComplete();
        } catch (err) {
          console.error(`Failed to configure decoder for asset ${asset.id}:`, err);
          resolve(null);
        }
      };

      const onSamples = (samples: DemuxedSample[]) => {
        if (!decoder?.isConfigured) return;

        const source = this.sources.get(asset.id);
        if (source) {
          source.pendingSamples.push(...samples);
          this.drainSampleQueue(asset.id);

          // Stop demuxer if we have demuxed far enough ahead of the current playhead
          if (samples.length > 0) {
            const lastSample = samples[samples.length - 1];
            const playheadUs = this.currentTime * 1_000_000;
            const targetEndUs = playheadUs + 2_000_000; // 2 seconds ahead of playhead

            if (lastSample.timestamp > targetEndUs) {
              demuxer.stop();
            }
          }
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

    // Update playhead position in all frame caches for smart eviction
    for (const source of this.sources.values()) {
      const activeClip = this.project.tracks
        .flatMap((t) => t.clips)
        .find(
          (c) =>
            c.sourceId === source.assetId &&
            timeSeconds >= c.startTime &&
            timeSeconds <= clipEndTime(c)
        );

      if (activeClip) {
        const sourceTime = sourceTimeForTimelineTime(activeClip, timeSeconds - activeClip.startTime);
        source.frameCache.setPlayhead(sourceTime * 1_000_000);
      }
      await this.ensureBufferForSource(source, timeSeconds);
    }

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

    // Guard: only transfer the bitmap if the offscreen canvas has valid content.
    // transferToImageBitmap() can return a 0x0 bitmap if the compositor wrote
    // nothing (all frame lookups returned null), which would freeze the display
    // by overwriting the last good frame with a transparent/empty image.
    const compositeBitmap = this.offscreenCanvas.transferToImageBitmap();
    if (compositeBitmap.width > 0 && compositeBitmap.height > 0) {
      this.renderCallback?.(compositeBitmap, width, height);
    } else {
      compositeBitmap.close();
    }

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
    this.renderPending = false;
    this._isBuffering = false;
    this.bufferingTicks = 0;
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
    this.renderPending = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Clear buffering state on pause
    this.setBufferingState(false);

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

  /**
   * Update the external buffering state, only firing the callback
   * when the value actually changes.
   */
  private setBufferingState(buffering: boolean): void {
    if (this._isBuffering !== buffering) {
      this._isBuffering = buffering;
      this.bufferingCallback?.(buffering);
    }
  }

  /**
   * Ensures that the frame cache has samples decoded around the playhead.
   * If not, seeks the demuxer to the playhead (snapping to keyframe) and demuxes a short window.
   */
  private async ensureBufferForSource(source: ActiveSource, timeSeconds: number): Promise<void> {
    const activeClip = this.project?.tracks
      .flatMap((t) => t.clips)
      .find(
        (c) =>
          c.sourceId === source.assetId &&
          timeSeconds >= c.startTime &&
          timeSeconds <= clipEndTime(c)
      );

    if (!activeClip) {
      return;
    }

    const sourceTime = sourceTimeForTimelineTime(activeClip, timeSeconds - activeClip.startTime);
    const playheadUs = sourceTime * 1_000_000;
    const frameDurationUs = (1 / this.fps) * 1_000_000;
    const toleranceUs = frameDurationUs * 1.5;

    // Check if the frame at the playhead is already cached
    const hasCurrentFrame = source.frameCache.hasNear(playheadUs, toleranceUs);
    
    // We also want some buffer ahead of the playhead (e.g. 1 second ahead in timeline)
    const lookaheadTimeSeconds = Math.min(timeSeconds + 1.0, clipEndTime(activeClip));
    const lookaheadSourceTime = sourceTimeForTimelineTime(activeClip, lookaheadTimeSeconds - activeClip.startTime);
    const lookaheadPlayheadUs = lookaheadSourceTime * 1_000_000;

    const hasFutureFrame = source.frameCache.hasNear(lookaheadPlayheadUs, toleranceUs);

    if (hasCurrentFrame && hasFutureFrame) {
      return;
    }

    // Determine keyframe timestamp without mutating demuxer extraction state
    const keyframeTime = source.demuxer.getKeyframeTime(sourceTime);

    if (source.lastSoughtKeyframeTime === keyframeTime) {
      // Same GOP. Just make sure the demuxer is running to finish decoding
      source.demuxer.startExtracting();
      return;
    }

    // New GOP or first seek. Stop current extraction and reset the decoder.
    source.demuxer.stop();
    await source.decoder.reset();
    source.pendingSamples = [];

    // Seek the demuxer and set the last sought keyframe time
    source.demuxer.seek(sourceTime);
    source.lastSoughtKeyframeTime = keyframeTime;

    // Start extracting from the keyframe
    source.demuxer.startExtracting();
  }

  /**
   * Maintains the decoding buffer during playback.
   * Resumes extraction if buffer ahead is running low.
   */
  private maintainBuffer(): void {
    if (!this.project) return;
    
    const frameDurationUs = (1 / this.fps) * 1_000_000;
    const toleranceUs = frameDurationUs * 1.5;

    for (const source of this.sources.values()) {
      // Find if this source is active at current playback time
      const activeClip = this.project.tracks
        .flatMap((t) => t.clips)
        .find(
          (c) =>
            c.sourceId === source.assetId &&
            this.currentTime >= c.startTime &&
            this.currentTime <= clipEndTime(c)
        );

      if (!activeClip) continue;

      const lookaheadTimeSeconds = Math.min(this.currentTime + 1.0, clipEndTime(activeClip));
      const lookaheadSourceTime = sourceTimeForTimelineTime(activeClip, lookaheadTimeSeconds - activeClip.startTime);
      const lookaheadPlayheadUs = lookaheadSourceTime * 1_000_000;

      // Check if we are running low on future frames (less than 1.0 second ahead)
      const hasFutureFrame = source.frameCache.hasNear(lookaheadPlayheadUs, toleranceUs);
      
      if (!hasFutureFrame) {
        // Start/resume the demuxer to extract more frames
        source.demuxer.startExtracting();
      }
    }
  }

  /**
   * Check whether all active video clips at `timeSeconds` have a
   * frame available in their cache within a reasonable tolerance.
   */
  private hasFramesForTime(timeSeconds: number): boolean {
    if (!this.project) return true;

    const frameDurationUs = (1 / this.fps) * 1_000_000;
    // Allow up to 1.5 frame durations of tolerance
    const toleranceUs = frameDurationUs * 1.5;

    for (const track of this.project.tracks) {
      if (track.type !== "video") continue;

      for (const clip of track.clips) {
        if (timeSeconds < clip.startTime || timeSeconds > clipEndTime(clip)) {
          continue;
        }

        // This clip is active — check if its source has a nearby frame
        const source = this.sources.get(clip.sourceId);
        if (!source) continue;

        const sourceTime = sourceTimeForTimelineTime(clip, timeSeconds - clip.startTime);
        const sourceTimeUs = sourceTime * 1_000_000;

        if (!source.frameCache.hasNear(sourceTimeUs, toleranceUs)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Feed queued samples to the decoder until backpressure kicks in.
   * Called after each frame is decoded (freeing a pending slot) and
   * when new samples arrive from the demuxer.
   */
  private drainSampleQueue(assetId: string): void {
    const source = this.sources.get(assetId);
    if (!source || !source.decoder.isConfigured) return;

    while (source.pendingSamples.length > 0) {
      const sample = source.pendingSamples[0];
      const chunk = new EncodedVideoChunk({
        type: sample.isKeyframe ? "key" : "delta",
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      });

      const accepted = source.decoder.decode(chunk);
      if (!accepted) break; // Decoder at capacity — retry on next frame output
      source.pendingSamples.shift();
    }
  }

  private tick = (): void => {
    if (!this.isPlaying) return;

    // Always schedule the next frame first so the loop never silently dies
    this.animFrameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const elapsed = (now - this.lastFrameTime) / 1000; // seconds
    const frameDuration = 1 / this.fps;

    if (elapsed < frameDuration) return;

    // Skip this tick if a previous async seekTo is still rendering.
    // Without this guard, overlapping seekTo() calls pile up and the
    // compositor/frameCache races cause the canvas to freeze on a stale frame.
    if (this.renderPending) return;

    // ── Buffering detection ──────────────────────────────────
    // Before advancing the clock, check whether the frame cache
    // has frames available near the *next* playhead position.
    const nextTime = this.currentTime + elapsed;

    if (!this.hasFramesForTime(nextTime)) {
      this.bufferingTicks++;
      this.setBufferingState(true);

      // Pause audio during buffering so it doesn't desync
      for (const audioEl of this.audioElements.values()) {
        if (!audioEl.paused) audioEl.pause();
      }

      // Safety valve: if we've been buffering too long, force-render
      // with the nearest available frame so the UI isn't stuck forever.
      if (this.bufferingTicks < this.MAX_BUFFERING_TICKS) {
        // Don't advance currentTime — hold position and retry next tick
        this.lastFrameTime = now;
        return;
      }
      // Fallthrough: force-render with whatever we have
    }

    // ── Normal playback ──────────────────────────────────────
    this.bufferingTicks = 0;
    this.setBufferingState(false);

    // Frame skipping: if we're more than 2 frames behind (e.g. slow
    // system), skip ahead to avoid a cascade of catch-up renders.
    const maxSkip = frameDuration * 2;
    const advanceBy = elapsed > maxSkip ? maxSkip : elapsed;

    this.currentTime += advanceBy;
    this.lastFrameTime = now;

    this.maintainBuffer();

    // Check if we've reached the end of the timeline
    if (this.project) {
      if (this.currentTime >= this.project.duration) {
        this.pause();
        return;
      }
    }

    // Resume audio if it was paused during buffering
    for (const audioEl of this.audioElements.values()) {
      if (audioEl.paused && this.isPlaying) {
        audioEl.play().catch(() => {});
      }
    }

    // Await seekTo so the render callback fires before the next tick
    this.renderPending = true;
    this.seekTo(this.currentTime)
      .catch((err) => console.error("PreviewEngine tick render error:", err))
      .finally(() => {
        this.renderPending = false;
      });
  };

  /**
   * Fire the decode progress callback with aggregate counts.
   */
  private fireDecodeProgress(): void {
    if (!this.progressCallback) return;
    let decoded = 0;
    let total = 0;
    for (const source of this.sources.values()) {
      decoded += source.decodedFrames;
      total += source.totalSamples;
    }
    this.progressCallback(decoded, total);
  }

  /**
   * Check whether all sources are fully decoded and resolve
   * any pending awaitFullDecode() promises.
   */
  private checkDecodeComplete(): void {
    if (!this.isFullyDecoded()) return;
    
    if (this.progressCallback) {
      this.progressCallback(100, 100);
    }

    for (const resolve of this.decodeResolvers) {
      resolve();
    }
    this.decodeResolvers = [];
  }

  /**
   * Returns true when every loaded source has configured its decoder.
   */
  private isFullyDecoded(): boolean {
    if (this.sources.size === 0) return false;
    for (const source of this.sources.values()) {
      if (!source.decoder.isConfigured) return false;
    }
    return true;
  }
}

// Singleton instance
let engineInstance: PreviewEngine | null = null;

export function getPreviewEngine(): PreviewEngine {
  if (!engineInstance) {
    engineInstance = new PreviewEngine();
  }
  return engineInstance;
}
