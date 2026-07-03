// ============================================================
// FutureCut — Project CRUD API (Get, Update, Delete)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] — Get a single project
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?")
    .get(id, session.user.id) as Record<string, unknown> | undefined;

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...project,
    project_data: JSON.parse(project.project_data as string),
  });
}

// PUT /api/projects/[id] — Update a project (autosave target)
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const db = getDb();

  // Verify ownership
  const existing = db
    .prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?")
    .get(id, session.user.id);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name);
  }
  if (body.projectData !== undefined) {
    updates.push("project_data = ?");
    values.push(JSON.stringify(body.projectData));
  }
  if (body.thumbnailUrl !== undefined) {
    updates.push("thumbnail_url = ?");
    values.push(body.thumbnailUrl);
  }
  if (body.isPublic !== undefined) {
    updates.push("is_public = ?");
    values.push(body.isPublic ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id, session.user.id);

    db.prepare(
      `UPDATE projects SET ${updates.join(", ")} WHERE id = ? AND owner_id = ?`
    ).run(...values);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/projects/[id] — Delete a project
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const result = db
    .prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?")
    .run(id, session.user.id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
