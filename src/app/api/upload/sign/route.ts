// ============================================================
// FutureCut — Signed Upload URL API
// ============================================================
// Issues a short-lived Supabase Storage upload URL so the browser
// can upload the video file DIRECTLY to Supabase, bypassing the
// Netlify function's 6MB payload / 10s execution limits.
//
// This endpoint's own request/response bodies are tiny (just a
// filename + a URL back), so it is never affected by those limits
// itself.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createSignedUploadUrl } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const originalName = body?.filename as string | undefined;
  const projectId = (body?.projectId as string | undefined) || "general";

  if (!originalName) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const ext = path.extname(originalName) || ".mp4";
  const assetId = uuidv4();
  const filename = `${projectId}/${assetId}${ext}`;

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      // Local dev/testing fallback
      const uploadUrl = `${req.nextUrl.origin}/api/upload/local-upload?filename=${encodeURIComponent(filename)}`;
      const publicUrl = `/api/uploads/${filename}`;
      return NextResponse.json({ assetId, uploadUrl, publicUrl });
    }

    const { uploadUrl, publicUrl } = await createSignedUploadUrl(
      "uploads",
      filename
    );

    return NextResponse.json({ assetId, uploadUrl, publicUrl });
  } catch (err) {
    console.error("[upload/sign API] failed to create signed URL:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to prepare upload. Please try again.",
      },
      { status: 500 }
    );
  }
}
