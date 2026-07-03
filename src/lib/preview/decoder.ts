// ============================================================
// FutureCut — WebCodecs Video Decoder
// ============================================================
// Manages a VideoDecoder instance with proper lifecycle:
// - Configuration from demuxer output
// - Chunk feeding with backpressure control
// - Seeking (flush + re-decode from keyframe)
// - Proper VideoFrame cleanup to prevent GPU memory leaks
// ============================================================

export type FrameCallback = (frame: VideoFrame) => void;

export interface DecoderOptions {
  onFrame: FrameCallback;
  onError?: (error: Error) => void;
}

function cloneDescription(description: AllowSharedBufferSource | undefined): AllowSharedBufferSource | undefined {
  if (!description) return undefined;
  if (ArrayBuffer.isView(description)) {
    return new Uint8Array(
      description.buffer.slice(
        description.byteOffset,
        description.byteOffset + description.byteLength
      )
    );
  }
  if (description instanceof ArrayBuffer) {
    return description.slice(0);
  }
  if (typeof SharedArrayBuffer !== "undefined" && description instanceof SharedArrayBuffer) {
    return description.slice(0);
  }
  return description;
}

/**
 * Manages a WebCodecs VideoDecoder with backpressure and seek support.
 */
export class Decoder {
  private decoder: VideoDecoder | null = null;
  private onFrame: FrameCallback;
  private onError: ((error: Error) => void) | null;
  private pendingFrames = 0;
  private readonly MAX_PENDING = 3;
  private _isConfigured = false;

  constructor(options: DecoderOptions) {
    this.onFrame = options.onFrame;
    this.onError = options.onError ?? null;
  }

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  /**
   * Configure the decoder with parameters extracted from the demuxer.
   */
  async configure(config: VideoDecoderConfig): Promise<void> {
    // Clean up existing decoder if any
    this.dispose();

    let targetConfig: VideoDecoderConfig = {
      ...config,
      hardwareAcceleration: "prefer-hardware",
    };

    if (typeof VideoDecoder !== "undefined" && typeof VideoDecoder.isConfigSupported === "function") {
      try {
        const testConfig = {
          ...targetConfig,
          description: cloneDescription(targetConfig.description),
        };
        let support = await VideoDecoder.isConfigSupported(testConfig);
        if (!support.supported) {
          console.warn("Hardware video decoding not supported for this config. Trying software decoding...");
          targetConfig.hardwareAcceleration = "prefer-software";
          const testConfigSoft = {
            ...targetConfig,
            description: cloneDescription(targetConfig.description),
          };
          support = await VideoDecoder.isConfigSupported(testConfigSoft);

          if (!support.supported) {
            console.warn("Software video decoding not supported for this config. Trying no-preference...");
            targetConfig.hardwareAcceleration = "no-preference";
            const testConfigNoPref = {
              ...targetConfig,
              description: cloneDescription(targetConfig.description),
            };
            support = await VideoDecoder.isConfigSupported(testConfigNoPref);

            if (!support.supported) {
              console.warn(`VideoDecoder.isConfigSupported reports this configuration is unsupported (codec: ${config.codec}, resolution: ${config.codedWidth}x${config.codedHeight}). Attempting configuration anyway with no-preference...`);
              targetConfig.hardwareAcceleration = "no-preference";
            }
          }
        }
      } catch (err) {
        console.error("Error checking video decoder configuration support:", err);
      }
    }

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        this.pendingFrames--;
        this.onFrame(frame);
        // Note: the consumer (previewEngine/frameCache) MUST call frame.close()
      },
      error: (error: DOMException) => {
        console.error("VideoDecoder error:", error);
        this.onError?.(new Error(error.message));
      },
    });

    this.decoder.configure(targetConfig);
    this._isConfigured = true;
  }

  /**
   * Decode an encoded video chunk.
   * Returns false if backpressure is active (too many pending frames).
   */
  decode(chunk: EncodedVideoChunk): boolean {
    if (!this.decoder || this.decoder.state !== "configured") {
      return false;
    }

    // Backpressure: don't feed more chunks if we have too many pending
    if (this.pendingFrames >= this.MAX_PENDING) {
      return false;
    }

    this.pendingFrames++;
    this.decoder.decode(chunk);
    return true;
  }

  /**
   * Flush the decoder — required before seeking.
   * Waits for all pending frames to be output.
   */
  async flush(): Promise<void> {
    if (!this.decoder || this.decoder.state !== "configured") {
      return;
    }

    await this.decoder.flush();
    this.pendingFrames = 0;
  }

  /**
   * Reset the decoder for seeking.
   * Flushes pending work and resets internal state.
   */
  async reset(): Promise<void> {
    if (!this.decoder) return;

    if (this.decoder.state === "configured") {
      this.decoder.reset();
      this.pendingFrames = 0;
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.decoder) {
      if (this.decoder.state !== "closed") {
        this.decoder.close();
      }
      this.decoder = null;
      this._isConfigured = false;
      this.pendingFrames = 0;
    }
  }
}
