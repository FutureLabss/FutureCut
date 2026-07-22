// ============================================================
// FutureCut — Unified Visual Compositor (Phase 3)
// ============================================================
// Composites video tracks (with transitions, keyframes, filters,
// and LUTs) and text overlays (with entrance animations and
// keyframe transformations) onto a 2D canvas context.
// Shared between the preview canvas and the export pipeline.
// ============================================================

import type { Project, Track, Clip, Filter } from "../model/types";
import { clipDuration, clipEndTime } from "../model/types";
import { interpolateKeyframes } from "../utils/interpolation";
import { sourceTimeForTimelineTime } from "../utils/speed";

export interface RenderFrameOptions {
  project: Project;
  timeSeconds: number;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  /** Retreive decoded frame bitmap for a video clip at the source time */
  getVideoFrame: (
    clipId: string,
    sourceTime: number
  ) => ImageBitmap | Promise<ImageBitmap | null> | null;
}

/**
 * Composites all active video and text layers for a timeline timestamp.
 */
export async function renderFrame(options: RenderFrameOptions): Promise<void> {
  const { project, timeSeconds, ctx, canvasWidth, canvasHeight, getVideoFrame } = options;

  // 1. Clear frame with solid black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Filter rendering tracks (video and text) and sort by stacking order (order asc)
  const renderTracks = (project.tracks || [])
    .filter((t) => t.type === "video" || t.type === "text")
    .sort((a, b) => a.order - b.order);

  for (const track of renderTracks) {
    if (track.type === "video") {
      await renderVideoTrack(track, timeSeconds, ctx, canvasWidth, canvasHeight, getVideoFrame);
    } else if (track.type === "text") {
      renderTextTrack(track, timeSeconds, ctx, canvasWidth, canvasHeight);
    }
  }
}

/**
 * Helper to extract filter styling string.
 */
function getCanvasFilterString(filters: Filter[] | undefined): string {
  if (!filters || filters.length === 0) return "none";

  const parts: string[] = [];
  for (const filter of filters) {
    // Value range expected: -1 to 1 (mapped to percentage offset: e.g. 0.0 value is 100%)
    const pct = Math.round((1.0 + filter.value) * 100);

    if (filter.type === "brightness") {
      parts.push(`brightness(${pct}%)`);
    } else if (filter.type === "contrast") {
      parts.push(`contrast(${pct}%)`);
    } else if (filter.type === "saturation") {
      parts.push(`saturate(${pct}%)`);
    } else if (filter.type === "lut" && filter.lutId) {
      parts.push(`url(#lut-${filter.lutId})`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

/**
 * Helper to interpolate keyframe transformations for a clip at a relative time.
 */
function getClipTransform(
  clip: Clip,
  relativeTime: number,
  defaultX: number,
  defaultY: number
) {
  const findTrack = (prop: string) =>
    clip.keyframedProps?.find((t) => t.property === prop)?.keyframes;

  return {
    x: interpolateKeyframes(findTrack("position.x"), relativeTime, defaultX),
    y: interpolateKeyframes(findTrack("position.y"), relativeTime, defaultY),
    scale: interpolateKeyframes(findTrack("scale"), relativeTime, 1.0),
    rotation: interpolateKeyframes(findTrack("rotation"), relativeTime, 0.0),
    opacity: interpolateKeyframes(findTrack("opacity"), relativeTime, 1.0),
  };
}

/**
 * Renders video track clips, including active transition blends, keyframes, and filters.
 */
async function renderVideoTrack(
  track: Track,
  timeSeconds: number,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  getVideoFrame: (
    clipId: string,
    sourceTime: number
  ) => ImageBitmap | Promise<ImageBitmap | null> | null
): Promise<void> {
  const activeClips = track.clips.filter(
    (c) => timeSeconds >= c.startTime && timeSeconds <= clipEndTime(c)
  );

  if (activeClips.length === 0) return;

  if (activeClips.length === 1) {
    const clip = activeClips[0];
    const sourceTime = sourceTimeForTimelineTime(clip, timeSeconds - clip.startTime);
    const bitmap = await getVideoFrame(clip.id, sourceTime);

    if (bitmap) {
      const duration = clipDuration(clip);
      const relativeTime = timeSeconds - clip.startTime;

      // Extract keyframes and transitions
      const tform = getClipTransform(clip, relativeTime, 0.5, 0.5);
      const filterStr = getCanvasFilterString(clip.filters);

      ctx.save();
      ctx.filter = filterStr;

      // Transition opacity
      let transitionAlpha = 1.0;
      if (clip.transitionIn && relativeTime < clip.transitionIn.duration) {
        transitionAlpha = relativeTime / clip.transitionIn.duration;
      } else if (
        clip.transitionOut &&
        duration - relativeTime < clip.transitionOut.duration
      ) {
        transitionAlpha = (duration - relativeTime) / clip.transitionOut.duration;
      }

      ctx.globalAlpha = tform.opacity * transitionAlpha;

      // Apply keyframed transformations (scale, rotate, translate)
      ctx.translate(tform.x * width, tform.y * height);
      ctx.rotate((tform.rotation * Math.PI) / 180);
      ctx.scale(tform.scale, tform.scale);

      // Draw image centered at origin
      ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
  } else {
    // 2 overlapping clips (transition phase)
    const sorted = [...activeClips].sort((a, b) => a.startTime - b.startTime);
    const clipA = sorted[0];
    const clipB = sorted[1];

    const sourceTimeA = sourceTimeForTimelineTime(clipA, timeSeconds - clipA.startTime);
    const sourceTimeB = sourceTimeForTimelineTime(clipB, timeSeconds - clipB.startTime);

    const bitmapA = await getVideoFrame(clipA.id, sourceTimeA);
    const bitmapB = await getVideoFrame(clipB.id, sourceTimeB);

    const transition = clipB.transitionIn ?? clipA.transitionOut;
    const duration = transition?.duration ?? 1.0;
    const transitionStart = clipB.startTime;
    const alpha = Math.min(1, Math.max(0, (timeSeconds - transitionStart) / duration));

    // Render clip A (outgoing)
    if (bitmapA) {
      const relativeTimeA = timeSeconds - clipA.startTime;
      const tformA = getClipTransform(clipA, relativeTimeA, 0.5, 0.5);
      ctx.save();
      ctx.filter = getCanvasFilterString(clipA.filters);
      ctx.globalAlpha = tformA.opacity;
      ctx.translate(tformA.x * width, tformA.y * height);
      ctx.rotate((tformA.rotation * Math.PI) / 180);
      ctx.scale(tformA.scale, tformA.scale);
      ctx.drawImage(bitmapA, -width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // Render clip B (incoming) with transition mapping
    if (bitmapB) {
      const relativeTimeB = timeSeconds - clipB.startTime;
      const tformB = getClipTransform(clipB, relativeTimeB, 0.5, 0.5);
      ctx.save();
      ctx.filter = getCanvasFilterString(clipB.filters);

      if (!transition || transition.type === "crossfade") {
        ctx.globalAlpha = tformB.opacity * alpha;
        ctx.translate(tformB.x * width, tformB.y * height);
        ctx.rotate((tformB.rotation * Math.PI) / 180);
        ctx.scale(tformB.scale, tformB.scale);
        ctx.drawImage(bitmapB, -width / 2, -height / 2, width, height);
      } else if (transition.type === "fadeToBlack") {
        // Fade to black overlay
        ctx.globalAlpha = tformB.opacity;
        ctx.translate(tformB.x * width, tformB.y * height);
        ctx.rotate((tformB.rotation * Math.PI) / 180);
        ctx.scale(tformB.scale, tformB.scale);
        ctx.drawImage(bitmapB, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Overlay black mask on top of screen
        ctx.save();
        const maskAlpha = alpha < 0.5 ? alpha * 2 : (1 - alpha) * 2;
        ctx.fillStyle = `rgba(0, 0, 0, ${maskAlpha})`;
        ctx.fillRect(0, 0, width, height);
      } else if (transition.type === "wipe") {
        // Wipe clip rect
        ctx.beginPath();
        ctx.rect(0, 0, width * alpha, height);
        ctx.clip();

        ctx.globalAlpha = tformB.opacity;
        ctx.translate(tformB.x * width, tformB.y * height);
        ctx.rotate((tformB.rotation * Math.PI) / 180);
        ctx.scale(tformB.scale, tformB.scale);
        ctx.drawImage(bitmapB, -width / 2, -height / 2, width, height);
      }
      ctx.restore();
    }
  }
}

/**
 * Renders text track overlays, applying keyframes and filters.
 */
function renderTextTrack(
  track: Track,
  timeSeconds: number,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const activeClips = track.clips.filter(
    (c) => timeSeconds >= c.startTime && timeSeconds <= clipEndTime(c)
  );

  for (const clip of activeClips) {
    if (!clip.text) continue;

    const relativeTime = timeSeconds - clip.startTime;
    const animationDuration = 0.8; // seconds

    const defaultX = clip.position?.x ?? 0.5;
    const defaultY = clip.position?.y ?? 0.5;

    // Retrieve transform matrices
    const tform = getClipTransform(clip, relativeTime, defaultX, defaultY);
    const filterStr = getCanvasFilterString(clip.filters);

    ctx.save();
    ctx.filter = filterStr;

    // 1. Text Properties setup
    const fontSize = clip.fontSize ?? 48;
    const fontFamily = clip.fontFamily ?? "Inter, sans-serif";
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = clip.color ?? "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 2. Entrance Animation (fadeIn / slideIn)
    let animationAlpha = 1.0;
    let animYOffset = 0;

    if (clip.animation && clip.animation !== "none" && relativeTime < animationDuration) {
      const progress = relativeTime / animationDuration;
      const t = progress * (2 - progress);

      if (clip.animation === "fadeIn") {
        animationAlpha = t;
      } else if (clip.animation === "slideIn") {
        animYOffset = 50 * (1 - t);
        animationAlpha = t;
      }
    }

    ctx.globalAlpha = tform.opacity * animationAlpha;

    // Apply keyframe translations & rotations
    ctx.translate(tform.x * width, tform.y * height + animYOffset);
    ctx.rotate((tform.rotation * Math.PI) / 180);
    ctx.scale(tform.scale, tform.scale);

    // 3. Draw text overlay centered at origin
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(clip.text, 0, 0);
    ctx.restore();
  }
}
