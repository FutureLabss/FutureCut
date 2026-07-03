// ============================================================
// FutureCut — Render Output Upload API
// ============================================================
// Client uploads the rendered MP4 after client-side ffmpeg.wasm export.
// Updates the render job with the output URL.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import path from "path";
import fs from "fs";

const RENDER_DIR = path.join(process.cwd(), "public", "renders");

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const jobId = formData.get("jobId") as string | null;

  if (!file || !jobId) {
    return NextResponse.json(
      { error: "file and jobId are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify job ownership
  const job = db
    .prepare(
      `SELECT r.id, r.project_id FROM render_jobs r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = ? AND p.owner_id = ?`
    )
    .get(jobId, session.user.id) as
    | { id: string; project_id: string }
    | undefined;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Store the rendered file
  if (!fs.existsSync(RENDER_DIR)) {
    fs.mkdirSync(RENDER_DIR, { recursive: true });
  }

  const filename = `${jobId}.mp4`;
  const filepath = path.join(RENDER_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  const outputUrl = `/renders/${filename}`;

  // Update job status
  db.prepare(
    "UPDATE render_jobs SET status = 'complete', progress = 100, output_url = ? WHERE id = ?"
  ).run(outputUrl, jobId);

  return NextResponse.json({ outputUrl });
}
