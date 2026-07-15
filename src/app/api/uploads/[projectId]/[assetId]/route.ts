// ============================================================
// FutureCut — Dynamic Uploads File Server (For E2E/Dev)
// ============================================================
// Serves uploaded files dynamically from disk to bypass Next.js
// static directory caching in production mode.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const { projectId, assetId } = await params;
  
  if (!projectId || !assetId) {
    return NextResponse.json({ error: "Invalid path parameters" }, { status: 400 });
  }

  const filepath = path.join(process.cwd(), "public", "uploads", projectId, assetId);

  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(filepath);
    
    // Resolve content type based on extension
    const ext = path.extname(assetId).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".wav") contentType = "audio/wav";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[uploads API] Failed to serve file:", err);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
