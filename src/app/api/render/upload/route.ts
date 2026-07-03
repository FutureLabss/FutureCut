// ============================================================
// FutureCut — Render Output Upload API
// ============================================================
// Client uploads the rendered MP4 after client-side ffmpeg.wasm export.
// Updates the render job with the output URL.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne, execute } from "@/lib/db";
import { saveFile } from "@/lib/storage";

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

  // Verify job ownership
  const job = await queryOne<{ id: string; project_id: string }>(
    `SELECT r.id, r.project_id FROM render_jobs r
     JOIN projects p ON r.project_id = p.id
     WHERE r.id = ? AND p.owner_id = ?`,
    [jobId, session.user.id]
  );

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Store the rendered file
  const filename = `${jobId}.mp4`;
  const outputUrl = await saveFile(file, "renders", filename);

  // Update job status
  await execute(
    "UPDATE render_jobs SET status = 'complete', progress = 100, output_url = ? WHERE id = ?",
    [outputUrl, jobId]
  );

  return NextResponse.json({ outputUrl });
}
