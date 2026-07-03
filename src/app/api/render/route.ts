// ============================================================
// FutureCut — Render Job API (Submit)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// POST /api/render — Submit a render job
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify project ownership
  const project = db
    .prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?")
    .get(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const id = uuidv4();

  db.prepare(
    "INSERT INTO render_jobs (id, project_id, status, progress) VALUES (?, ?, 'queued', 0)"
  ).run(id, projectId);

  return NextResponse.json({ id, status: "queued", progress: 0 }, { status: 201 });
}
