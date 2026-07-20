// ============================================================
// FutureCut — Frame Cache (Playhead-Aware Eviction)
// ============================================================
// Caches decoded frames as ImageBitmaps for smooth scrubbing.
// Uses a playhead-aware eviction strategy: frames furthest from
// the current playhead are evicted first, keeping the buffer
// focused around the viewing window. ImageBitmaps are safe
// for GC (unlike VideoFrames which hold GPU memory).
// ============================================================

export interface CachedFrame {
  timestamp: number; // microseconds
  bitmap: ImageBitmap;
}

/**
 * Playhead-aware cache for decoded video frames stored as ImageBitmaps.
 * Evicts frames furthest from the current playhead rather than simple LRU.
 */
export class FrameCache {
  private cache: Map<number, ImageBitmap> = new Map();
  private readonly maxSize: number;
  private playheadUs: number = 0;

  constructor(maxSize: number = 300) {
    this.maxSize = maxSize;
  }

  /**
   * Update the playhead position so eviction can prioritise
   * frames near the current viewing position.
   */
  setPlayhead(timestampUs: number): void {
    this.playheadUs = timestampUs;
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

    // Evict frame furthest from the current playhead if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictFurthest();
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
    return bitmap;
  }

  /**
   * Get the nearest cached frame to a given timestamp.
   * Useful for fast scrubbing — shows closest available frame within maxDistanceUs.
   */
  getNearest(timestampUs: number, maxDistanceUs: number = 2_000_000): ImageBitmap | null {
    if (this.cache.size === 0) return null;

    let nearest: ImageBitmap | null = null;
    let nearestDist = maxDistanceUs;

    for (const [key, bitmap] of this.cache) {
      const dist = Math.abs(key - timestampUs);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = bitmap;
      }
    }

    return nearest;
  }

  /**
   * Check whether the cache has a frame within `toleranceUs` of the
   * requested timestamp.  Used by the engine to detect buffering.
   */
  hasNear(timestampUs: number, toleranceUs: number): boolean {
    const key = Math.round(timestampUs);
    if (this.cache.has(key)) return true;

    for (const cachedKey of this.cache.keys()) {
      if (Math.abs(cachedKey - key) <= toleranceUs) {
        return true;
      }
    }
    return false;
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

  // ============================================================
  // Private
  // ============================================================

  /**
   * Evict the frame that is furthest from the current playhead.
   * This ensures frames ahead of and close behind the playhead
   * survive while already-played distant frames are recycled.
   */
  private evictFurthest(): void {
    let furthestKey: number | undefined;
    let furthestDist = -1;

    for (const key of this.cache.keys()) {
      const dist = Math.abs(key - this.playheadUs);
      if (dist > furthestDist) {
        furthestDist = dist;
        furthestKey = key;
      }
    }

    if (furthestKey !== undefined) {
      const oldBitmap = this.cache.get(furthestKey);
      oldBitmap?.close();
      this.cache.delete(furthestKey);
    }
  }
}
