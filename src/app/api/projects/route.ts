// ============================================================
// FutureCut — Projects API (List + Create)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryAll, execute } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// GET /api/projects — List user's projects
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await queryAll(
    "SELECT id, name, thumbnail_url, is_public, created_at, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
    [session.user.id]
  );

  return NextResponse.json({ projects });
}

// POST /api/projects — Create a new project
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = body.name || "Untitled Project";

  const id = uuidv4();

  // Create initial project data payload with valid tracks
  const initialProject = {
    id,
    name,
    fps: 30,
    duration: 0,
    tracks: [
      { id: uuidv4(), type: "video", order: 0, clips: [] },
      {
        id: uuidv4(),
        type: "audio",
        order: 1,
        clips: [],
        muted: false,
        volume: 1.0,
      },
    ],
  };

  const payload = {
    project: initialProject,
    assets: {},
  };

  await execute(
    "INSERT INTO projects (id, owner_id, name, project_data) VALUES (?, ?, ?, ?)",
    [id, session.user.id, name, JSON.stringify(payload)]
  );

  return NextResponse.json({ id, name }, { status: 201 });
}
