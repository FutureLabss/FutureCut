// ============================================================
// FutureCut — Local Upload Fallback Router (For E2E/Dev)
// ============================================================
// Handles direct browser PUT uploads to local public folder
// when Supabase env variables are not present.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function PUT(req: NextRequest) {
  const url = new URL(req.url);
  const filename = url.searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "filename param is required" }, { status: 400 });
  }

  try {
    const localDir = path.join(process.cwd(), "public", "uploads", path.dirname(filename));
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const filepath = path.join(process.cwd(), "public", "uploads", filename);
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(filepath, buffer);

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[local-upload API] Failed to write local upload:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to write file" },
      { status: 500 }
    );
  }
}
