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
  const [activeTab, setActiveTab] = useState<"projects" | "assets" | "templates" | "settings">("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    queueMicrotask(() => {
      fetchProjects();
    });
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

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Edited just now";
    if (diffHours < 24) return `Edited ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays === 1) return "Edited yesterday";
    if (diffDays < 7) return `Edited ${diffDays} days ago`;
    return `Edited ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  };

  // Mock durations for demonstration parity with mockup
  const getMockDuration = (index: number) => {
    const durations = ["02:15", "10:30", "05:45", "02:15", "10:30", "05:45"];
    return durations[index % durations.length];
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090a0f]">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#090a0f] text-gray-100 font-sans overflow-hidden">
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#0d0e17] md:bg-[#0d0e17]/80 backdrop-blur-xl border-r border-white/10 flex flex-col shrink-0 select-none transition-all duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${sidebarCollapsed ? "md:w-20" : "md:w-64"} w-64`}
      >
        {/* Logo & Collapse Header */}
        <div className="p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo-icon.png"
              alt="FutureCut Logo"
              className="w-9 h-9 object-contain drop-shadow-[0_0_12px_rgba(59,130,246,0.6)] shrink-0"
            />
            {!sidebarCollapsed && (
              <span className="text-xl font-bold text-white tracking-tight font-outfit truncate">
                FutureCut
              </span>
            )}
          </div>

          {/* Collapse / Close Button */}
          <button
            onClick={() => {
              setSidebarOpen(false);
              setSidebarCollapsed(!sidebarCollapsed);
            }}
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${
                sidebarCollapsed ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="px-3 py-4 flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => {
              setActiveTab("projects");
              setSidebarOpen(false);
            }}
            title="Projects"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "md:justify-center md:px-0 px-4 gap-3" : "gap-3 px-4"
            } py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === "projects"
                ? "bg-white/10 text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Projects</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("assets");
              setSidebarOpen(false);
            }}
            title="Assets"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "md:justify-center md:px-0 px-4 gap-3" : "gap-3 px-4"
            } py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === "assets"
                ? "bg-white/10 text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Assets</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("templates");
              setSidebarOpen(false);
            }}
            title="Templates"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "md:justify-center md:px-0 px-4 gap-3" : "gap-3 px-4"
            } py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === "templates"
                ? "bg-white/10 text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M4 10h16M10 4v16" />
            </svg>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Templates</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("settings");
              setSidebarOpen(false);
            }}
            title="Settings"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "md:justify-center md:px-0 px-4 gap-3" : "gap-3 px-4"
            } py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === "settings"
                ? "bg-white/10 text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Settings</span>
          </button>
        </nav>

        {/* Bottom Settings Link */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => {
              setActiveTab("settings");
              setSidebarOpen(false);
            }}
            title="Settings"
            className={`w-full flex items-center ${
              sidebarCollapsed ? "md:justify-center md:px-0 px-4 gap-3" : "gap-3 px-4"
            } py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all`}
          >
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Header Bar */}
        <header className="px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between border-b border-white/10 bg-[#0d0e17]/50 backdrop-blur-md sticky top-0 z-20 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Sidebar Toggle Button */}
            <button
              onClick={() => {
                setSidebarOpen((prev) => !prev);
                if (sidebarCollapsed) setSidebarCollapsed(false);
              }}
              aria-label="Toggle sidebar"
              className="p-2 rounded-xl bg-white/[0.06] border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-all shrink-0"
              title="Toggle navigation sidebar"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>

            {/* Search Input */}
            <div className="relative w-full max-w-[200px] sm:max-w-xs sm:w-80">
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 transition-all"
              />
            </div>
          </div>

          {/* Profile & New Project Button */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/10 text-xs sm:text-sm font-medium text-gray-200 transition-all"
              >
                <div className="w-6 sm:w-7 h-6 sm:h-7 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-400 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                  {(session?.user?.name || session?.user?.email || "U")[0]}
                </div>
                <span className="hidden sm:inline">Profile</span>
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#161826] border border-white/10 shadow-2xl p-1.5 z-30 space-y-1">
                  <div className="px-3 py-2 text-xs text-gray-400 truncate border-b border-white/5">
                    {session?.user?.email}
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/signin" })}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={createProject}
              disabled={creating}
              className="px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              <span>{creating ? "Creating..." : "+ New Project"}</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="p-4 sm:p-8 flex-1">
          {activeTab === "projects" && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white tracking-tight font-outfit">
                  Your Projects
                </h2>
              </div>

              {filteredProjects.length === 0 ? (
                /* Empty state */
                <div className="text-center py-24 glass-card rounded-2xl max-w-lg mx-auto p-8">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="3" />
                      <path d="M10 8l6 4-6 4V8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    No projects found
                  </h3>
                  <p className="text-sm text-gray-400 mb-6">
                    {searchQuery ? "No matching project titles found." : "Create your first video project to get started."}
                  </p>
                  <button
                    onClick={createProject}
                    disabled={creating}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-purple-500/30 hover:scale-105 transition-all"
                  >
                    + New Project
                  </button>
                </div>
              ) : (
                /* Projects Grid (3 Columns) */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project, index) => (
                    <div
                      key={project.id}
                      className="glass-card rounded-2xl p-4 transition-all duration-300 group flex flex-col justify-between"
                    >
                      <div>
                        {/* Video Thumbnail */}
                        <div
                          onClick={() => router.push(`/editor/${project.id}`)}
                          className="w-full aspect-video rounded-xl bg-black/40 border border-white/10 overflow-hidden relative cursor-pointer group-hover:border-purple-500/50 transition-all"
                        >
                          {project.thumbnail_url ? (
                            <img
                              src={project.thumbnail_url}
                              alt={project.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-950/40 via-indigo-950/20 to-black">
                              <svg className="w-12 h-12 text-purple-400/40 group-hover:text-purple-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="2" y="2" width="20" height="20" rx="3" />
                                <path d="M10 8l6 4-6 4V8z" />
                              </svg>
                            </div>
                          )}

                          {/* Hover Play Button Overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-lg shadow-purple-500/50 scale-90 group-hover:scale-100 transition-transform">
                              <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>

                          {/* Duration Badge */}
                          <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[11px] font-mono text-gray-200 border border-white/10">
                            {getMockDuration(index)}
                          </div>
                        </div>

                        {/* Title & Metadata */}
                        <div className="mt-4 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
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
                                className="w-full px-2 py-1 rounded bg-black/50 border border-purple-500 text-sm text-white focus:outline-none font-medium"
                              />
                            ) : (
                              <h3
                                onClick={() => startRename(project)}
                                title="Click to rename"
                                className="text-base font-semibold text-white truncate cursor-pointer hover:text-purple-300 transition-colors font-outfit"
                              >
                                {project.name}
                              </h3>
                            )}
                            <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                              <span>{getRelativeTime(project.updated_at)}</span>
                              <span className="font-mono">{getMockDuration(index)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                        <button
                          onClick={() => router.push(`/editor/${project.id}`)}
                          className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                        >
                          Open Editor
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startRename(project)}
                            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "assets" && (
            <div className="glass-card p-12 rounded-2xl text-center space-y-3 max-w-xl mx-auto mt-12">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-2xl">
                📁
              </div>
              <h3 className="text-xl font-bold text-white font-outfit">Asset Library</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Upload and manage re-usable video, audio, and subtitle assets across all your FutureCut video projects.
              </p>
            </div>
          )}

          {activeTab === "templates" && (
            <div className="glass-card p-12 rounded-2xl text-center space-y-3 max-w-xl mx-auto mt-12">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-2xl">
                🎨
              </div>
              <h3 className="text-xl font-bold text-white font-outfit">Video Templates</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Choose from pre-made video templates for TikTok, YouTube Shorts, Instagram Reels, and tech promo videos.
              </p>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="glass-card p-8 rounded-2xl max-w-xl mx-auto mt-8 space-y-6">
              <h3 className="text-xl font-bold text-white font-outfit border-b border-white/10 pb-4">
                Account & Editor Settings
              </h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400">User Email</span>
                  <span className="text-white font-mono">{session?.user?.email}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400">Default FPS</span>
                  <span className="text-white font-mono">30 FPS</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400">Export Hardware Acceleration</span>
                  <span className="text-purple-400 font-semibold">WebCodecs + WebGL</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
