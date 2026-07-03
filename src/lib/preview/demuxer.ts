// ============================================================
// FutureCut — MP4 Demuxer (mp4box.js wrapper)
// ============================================================
// Parses MP4 files and extracts EncodedVideoChunks for WebCodecs.
// Handles streaming ingestion (no full file load), seeking, and
// sample extraction with correct timestamp conversion.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import MP4Box from "mp4box";

export interface DemuxerConfig {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description?: Uint8Array;
  duration: number; // seconds
  fps: number;
  numberOfSamples: number;
}

export interface DemuxedSample {
  timestamp: number; // microseconds
  duration: number; // microseconds
  isKeyframe: boolean;
  data: Uint8Array;
}

export type OnConfigCallback = (config: DemuxerConfig) => void | Promise<void>;
export type OnSamplesCallback = (samples: DemuxedSample[]) => void;

/**
 * Wraps mp4box.js to demux MP4 files for WebCodecs consumption.
 */
export class Demuxer {
  private mp4File: any;
  private videoTrackId: number | null = null;
  private audioTrackId: number | null = null;
  private onConfig: OnConfigCallback | null = null;
  private onSamples: OnSamplesCallback | null = null;
  private _config: DemuxerConfig | null = null;
  private configPromise: Promise<void> | null = null;

  constructor() {
    this.mp4File = MP4Box.createFile();
    this.setupCallbacks();
  }

  get config(): DemuxerConfig | null {
    return this._config;
  }

  /**
   * Initialize the demuxer with a video file.
   * Streams the file data progressively — does not load entirely into memory.
   */
  async init(
    file: File,
    onConfig: OnConfigCallback,
    onSamples: OnSamplesCallback
  ): Promise<void> {
    this.onConfig = onConfig;
    this.onSamples = onSamples;
    this.configPromise = null;

    const reader = file.stream().getReader();
    let offset = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // mp4box requires an ArrayBuffer with a fileStart property
      const buffer = value.buffer as ArrayBuffer & { fileStart: number };
      buffer.fileStart = offset;
      this.mp4File.appendBuffer(buffer);
      offset += value.byteLength;
    }

    this.mp4File.flush();

    if (this.configPromise) {
      await this.configPromise;
    }
  }

  /**
   * Start extracting samples from the video track.
   */
  startExtracting(): void {
    if (this.videoTrackId !== null) {
      this.mp4File.setExtractionOptions(this.videoTrackId, null, {
        nbSamples: 100, // Process 100 samples at a time
      });
      this.mp4File.start();
    }
  }

  /**
   * Seek to a specific time in the file.
   * Returns the actual seek time (snapped to nearest sync point).
   */
  seek(timeInSeconds: number): number {
    if (!this.mp4File) return 0;
    const seekResult = this.mp4File.seek(timeInSeconds, true);
    return seekResult.offset / (seekResult.timescale || 1);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.mp4File) {
      this.mp4File.flush();
      this.mp4File = null;
    }
    this.onConfig = null;
    this.onSamples = null;
  }

  // ============================================================
  // Private
  // ============================================================

  private setupCallbacks(): void {
    this.mp4File.onReady = (info: any) => {
      const videoTrack = info.videoTracks?.[0];
      if (!videoTrack) {
        console.error("No video track found in file");
        return;
      }

      this.videoTrackId = videoTrack.id;

      // Extract codec description (AVCC/HVCC data needed by VideoDecoder)
      const description = this.getDescription(videoTrack);

      // Calculate FPS from track metadata
      const durationInSeconds =
        videoTrack.movie_duration / videoTrack.movie_timescale;
      const fps =
        videoTrack.nb_samples / durationInSeconds || 30;

      const config: DemuxerConfig = {
        codec: videoTrack.codec,
        codedWidth: videoTrack.video.width,
        codedHeight: videoTrack.video.height,
        description,
        duration: durationInSeconds,
        fps: Math.round(fps * 100) / 100, // Round to 2 decimal places
        numberOfSamples: videoTrack.nb_samples,
      };

      this._config = config;
      const res = this.onConfig?.(config);
      if (res instanceof Promise) {
        this.configPromise = res;
      }

      // Check for audio track
      if (info.audioTracks?.length > 0) {
        this.audioTrackId = info.audioTracks[0].id;
      }
    };

    this.mp4File.onSamples = (
      _trackId: number,
      _user: any,
      samples: any[]
    ) => {
      const demuxedSamples: DemuxedSample[] = samples.map((sample) => ({
        timestamp: (sample.cts * 1_000_000) / sample.timescale,
        duration: (sample.duration * 1_000_000) / sample.timescale,
        isKeyframe: sample.is_sync,
        data: new Uint8Array(sample.data),
      }));

      this.onSamples?.(demuxedSamples);
    };

    this.mp4File.onError = (error: Error) => {
      console.error("MP4Box error:", error);
    };
  }

  /**
   * Extract the codec-specific description data from the track.
   * This is required by VideoDecoder.configure().
   */
  private getDescription(videoTrack: any): Uint8Array | undefined {
    const trak = this.mp4File.getTrackById(videoTrack.id);
    if (!trak) return undefined;

    const stbl = trak.mdia?.minf?.stbl;
    if (!stbl) return undefined;

    const stsd = stbl.stsd;
    if (!stsd?.entries?.length) return undefined;

    const entry = stsd.entries[0];
    // Look for avcC (H.264) or hvcC (H.265) boxes
    const descriptionBox = entry.avcC || entry.hvcC;
    if (!descriptionBox) return undefined;

    // Serialize the box to get the raw description bytes
    const stream = new MP4Box.DataStream(
      undefined,
      0,
      MP4Box.DataStream.BIG_ENDIAN
    );
    descriptionBox.write(stream);
    return new Uint8Array(stream.buffer, 8); // Skip the box header (8 bytes)
  }
}
