// ============================================================
// FutureCut — Frame Cache (LRU)
// ============================================================
// Caches decoded frames as ImageBitmaps for smooth scrubbing.
// Uses a simple LRU eviction strategy. ImageBitmaps are safe
// for GC (unlike VideoFrames which hold GPU memory).
// ============================================================

export interface CachedFrame {
  timestamp: number; // microseconds
  bitmap: ImageBitmap;
}

/**
 * LRU cache for decoded video frames stored as ImageBitmaps.
 */
export class FrameCache {
  private cache: Map<number, ImageBitmap> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  /**
   * Store a frame in the cache.
   * Converts a VideoFrame to ImageBitmap (which is cheaper to hold).
   */
  async put(timestampUs: number, frame: VideoFrame): Promise<void> {
    // Quantize timestamp to avoid floating-point duplicates
    const key = Math.round(timestampUs);

    // Don't store if we already have this frame
    if (this.cache.has(key)) {
      return;
    }

    // Convert VideoFrame → ImageBitmap before closing the frame
    const bitmap = await createImageBitmap(frame);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldBitmap = this.cache.get(oldestKey);
        oldBitmap?.close();
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, bitmap);
  }

  /**
   * Get a cached frame by timestamp.
   * Returns the ImageBitmap if found, null otherwise.
   */
  get(timestampUs: number): ImageBitmap | null {
    const key = Math.round(timestampUs);
    const bitmap = this.cache.get(key);
    if (!bitmap) return null;

    // Move to end (most recently used) — LRU refresh
    this.cache.delete(key);
    this.cache.set(key, bitmap);

    return bitmap;
  }

  /**
   * Get the nearest cached frame to a given timestamp.
   * Useful for fast scrubbing — shows closest available frame.
   */
  getNearest(timestampUs: number): ImageBitmap | null {
    if (this.cache.size === 0) return null;

    let nearest: ImageBitmap | null = null;
    let nearestDist = Infinity;

    for (const [key, bitmap] of this.cache) {
      const dist = Math.abs(key - timestampUs);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = bitmap;
      }
    }

    return nearest;
  }

  /**
   * Check if a frame is cached for the given timestamp.
   */
  has(timestampUs: number): boolean {
    return this.cache.has(Math.round(timestampUs));
  }

  /**
   * Clear all cached frames.
   */
  clear(): void {
    for (const bitmap of this.cache.values()) {
      bitmap.close();
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
