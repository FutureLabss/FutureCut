// ============================================================
// FutureCut — Server Render Job Interface
// ============================================================
// Fallback interface for offloading heavy timeline export jobs
// to the backend server API (/api/render).
// ============================================================

import type { Project } from "../model/types";

export interface ServerRenderJob {
  id: string;
  projectId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  outputUrl?: string;
  errorMessage?: string;
}

export async function submitServerRenderJob(
  project: Project,
  options?: { width?: number; height?: number; bitrateBps?: number }
): Promise<ServerRenderJob> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      timeline: project,
      width: options?.width,
      height: options?.height,
      bitrateBps: options?.bitrateBps,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to submit render job to backend server");
  }

  return (await res.json()) as ServerRenderJob;
}

export async function checkServerRenderJobStatus(jobId: string): Promise<ServerRenderJob> {
  const res = await fetch(`/api/render/${jobId}`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Failed to check render job status from backend server");
  }

  return (await res.json()) as ServerRenderJob;
}

export async function pollServerRenderJob(
  jobId: string,
  onProgress?: (progress: number) => void,
  intervalMs = 2000
): Promise<string> {
  while (true) {
    const job = await checkServerRenderJobStatus(jobId);
    onProgress?.(job.progress);

    if (job.status === "completed" && job.outputUrl) {
      return job.outputUrl;
    }

    if (job.status === "failed") {
      throw new Error(job.errorMessage || "Server-side render job failed");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
