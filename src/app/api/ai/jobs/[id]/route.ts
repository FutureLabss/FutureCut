// ============================================================
// FutureCut — AI Processing Job Status / Results API
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/ai/jobs/[id] — Fetch AI processing job status and results
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await queryOne<Record<string, any>>(
    `SELECT j.* FROM ai_jobs j
     JOIN projects p ON j.project_id = p.id
     WHERE j.id = ? AND p.owner_id = ?`,
    [id, session.user.id]
  );

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse JSON data fields if present
  if (job.input_data) {
    try {
      job.input_data = JSON.parse(job.input_data);
    } catch {}
  }
  if (job.output_data) {
    try {
      job.output_data = JSON.parse(job.output_data);
    } catch {}
  }

  return NextResponse.json(job);
}
