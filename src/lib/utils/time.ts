// ============================================================
// Time Utilities
// ============================================================

/** Format seconds as MM:SS.ff (frames) */
export function formatTimecode(seconds: number, fps: number = 30): string {
  const totalFrames = Math.floor(seconds * fps);
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = totalFrames % fps;

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

/** Format seconds as M:SS for compact display */
export function formatTimeShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Snap a time value to the nearest frame boundary */
export function snapToFrame(time: number, fps: number): number {
  return Math.round(time * fps) / fps;
}

/** Convert frame number to seconds */
export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

/** Convert seconds to frame number */
export function secondsToFrame(seconds: number, fps: number): number {
  return Math.floor(seconds * fps);
}
