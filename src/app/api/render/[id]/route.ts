// ============================================================
// FutureCut — Render Job Status / Update API
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne, execute } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/render/[id] — Get render job status
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await queryOne<Record<string, unknown>>(
    `SELECT r.* FROM render_jobs r
     JOIN projects p ON r.project_id = p.id
     WHERE r.id = ? AND p.owner_id = ?`,
    [id, session.user.id]
  );

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

// PUT /api/render/[id] — Update render job (progress, status, output)
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Verify ownership via project
  const job = await queryOne(
    `SELECT r.id FROM render_jobs r
     JOIN projects p ON r.project_id = p.id
     WHERE r.id = ? AND p.owner_id = ?`,
    [id, session.user.id]
  );

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.status !== undefined) {
    updates.push("status = ?");
    values.push(body.status);
  }
  if (body.progress !== undefined) {
    updates.push("progress = ?");
    values.push(body.progress);
  }
  if (body.outputUrl !== undefined) {
    updates.push("output_url = ?");
    values.push(body.outputUrl);
  }
  if (body.errorMessage !== undefined) {
    updates.push("error_message = ?");
    values.push(body.errorMessage);
  }

  if (updates.length > 0) {
    values.push(id);
    await execute(
      `UPDATE render_jobs SET ${updates.join(", ")} WHERE id = ?`,
      values
    );
  }

  return NextResponse.json({ success: true });
}
