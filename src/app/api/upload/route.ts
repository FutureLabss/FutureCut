// ============================================================
// FutureCut — Asset Upload API
// ============================================================
// Handles direct file uploads to local storage.
// Returns a URL that can be used to access the uploaded file.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { saveFile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Generate unique filename
  const ext = path.extname(file.name) || ".mp4";
  const assetId = uuidv4();
  const folder = projectId || "general";
  const filename = `${folder}/${assetId}${ext}`;

  // Save the file (via Supabase or local disk fallback)
  const url = await saveFile(file, "uploads", filename);

  return NextResponse.json({
    assetId,
    url,
    filename: file.name,
    size: file.size,
  });
}
