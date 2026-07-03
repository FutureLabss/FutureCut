// ============================================================
// FutureCut — Asset Upload API
// ============================================================
// Handles direct file uploads to local storage.
// Returns a URL that can be used to access the uploaded file.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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

  // Create upload directory for project
  const projectDir = path.join(UPLOAD_DIR, projectId || "general");
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Generate unique filename
  const ext = path.extname(file.name) || ".mp4";
  const assetId = uuidv4();
  const filename = `${assetId}${ext}`;
  const filepath = path.join(projectDir, filename);

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  // Return the public URL
  const url = `/uploads/${projectId || "general"}/${filename}`;

  return NextResponse.json({
    assetId,
    url,
    filename: file.name,
    size: file.size,
  });
}
