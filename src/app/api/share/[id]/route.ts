// ============================================================
// FutureCut — Share API (Public access to render info)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/share/[id] — Get public share data (no auth required)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const db = getDb();

  // Look up the render job and its project
  const data = db
    .prepare(
      `SELECT r.id as job_id, r.output_url, r.status,
              p.name as project_name, p.is_public
       FROM render_jobs r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = ?`
    )
    .get(id) as
    | {
        job_id: string;
        output_url: string | null;
        status: string;
        project_name: string;
        is_public: number;
      }
    | undefined;

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!data.is_public) {
    return NextResponse.json(
      { error: "This project is not publicly shared" },
      { status: 403 }
    );
  }

  if (data.status !== "complete" || !data.output_url) {
    return NextResponse.json(
      { error: "Render not complete" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    jobId: data.job_id,
    projectName: data.project_name,
    outputUrl: data.output_url,
  });
}
