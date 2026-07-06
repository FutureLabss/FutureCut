"use client";

// ============================================================
// FutureCut — Share Page (Public Video Viewer)
// ============================================================
// Read-only page for viewing rendered videos via shareable links.
// No auth required.
// ============================================================

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface ShareData {
  jobId: string;
  projectName: string;
  outputUrl: string;
}

export default function SharePage() {
  const params = useParams();
  const jobId = params.id as string;
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShare() {
      try {
        const res = await fetch(`/api/share/${jobId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "This video is not available");
          return;
        }

        const shareData = await res.json();
        setData(shareData);
      } catch {
        setError("Failed to load video");
      } finally {
        setLoading(false);
      }
    }

    fetchShare();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] px-4">
        <div className="text-center max-w-md p-8 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)]">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Video Not Available
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {error || "This link may be expired or the video is private."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              FutureCut
            </h1>
            <span className="text-xs text-[var(--text-muted)]">Shared Video</span>
          </div>
        </div>
      </header>

      {/* Video Player */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="rounded-xl overflow-hidden bg-black shadow-2xl border border-[var(--border)]">
            <video
              src={data.outputUrl}
              controls
              autoPlay
              className="w-full aspect-video"
            />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:gap-2 justify-between items-start sm:items-center">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] truncate max-w-full" title={data.projectName}>
              {data.projectName}
            </h2>

            <a
              href={data.outputUrl}
              download
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
