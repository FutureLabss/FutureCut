"use client";

// ============================================================
// FutureCut — Project Dashboard
// ============================================================
// Lists user's projects with create, open, rename, delete.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

interface ProjectItem {
  id: string;
  name: string;
  thumbnail_url: string | null;
  is_public: number;
  created_at: string;
  updated_at: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }
    fetchProjects();
  }, [status, router, fetchProjects]);

  const createProject = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Project" }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/editor/${data.id}`);
      }
    } catch {
      // Handle error
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // Handle error
    }
  };

  const startRename = (project: ProjectItem) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) return;

    try {
      await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: renameValue.trim() } : p))
      );
    } catch {
      // Handle error
    } finally {
      setRenamingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
            FutureCut
          </h1>

          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-muted)]">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Your Projects
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>

          <button
            onClick={createProject}
            disabled={creating}
            className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            {creating ? "Creating..." : "New Project"}
          </button>
        </div>

        {projects.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-[var(--text-muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="2" width="20" height="20" rx="3" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
            </div>
            <h3 className="text-base font-medium text-[var(--text-primary)] mb-1">
              No projects yet
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Create your first video project to get started.
            </p>
            <button
              onClick={createProject}
              disabled={creating}
              className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              Create Project
            </button>
          </div>
        ) : (
          /* Project grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl bg-[var(--bg-panel)] border border-[var(--border)] overflow-hidden hover:border-[var(--border-hover)] transition-colors"
              >
                {/* Thumbnail */}
                <button
                  onClick={() => router.push(`/editor/${project.id}`)}
                  className="w-full aspect-video bg-[var(--bg-surface)] flex items-center justify-center cursor-pointer relative overflow-hidden"
                >
                  {project.thumbnail_url ? (
                    <img
                      src={project.thumbnail_url}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg
                      className="w-10 h-10 text-[var(--text-muted)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="2" y="2" width="20" height="20" rx="3" />
                      <path d="M10 8l6 4-6 4V8z" />
                    </svg>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Open
                    </span>
                  </div>
                </button>

                {/* Info */}
                <div className="p-3">
                  {renamingId === project.id ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => saveRename(project.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(project.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                      className="w-full px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--accent)] text-sm text-[var(--text-primary)] focus:outline-none"
                    />
                  ) : (
                    <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {project.name}
                    </h3>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDate(project.updated_at)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startRename(project)}
                      className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="px-2 py-1 rounded text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
