"use client";

// ============================================================
// FutureCut — Editor Page (Project Loader)
// ============================================================
// Loads project data from the server and hydrates the editor store.
// Waits for the full decode pipeline to finish before showing
// the editor so the user never hits buffering on first play.
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEditorStore } from "@/lib/store/editorStore";
import { Editor } from "@/components/Editor";
import { getPreviewEngine } from "@/lib/preview/previewEngine";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState("Loading project...");
  const [decodeProgress, setDecodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const projectId = params.id as string;

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    async function loadProject() {
      try {
        setLoadStatus("Fetching project data...");
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Project not found");
          } else {
            setError("Failed to load project");
          }
          return;
        }

        const data = await res.json();
        const payload = data.project_data;
        let project = payload.project || payload;
        const serializedAssets = payload.assets || {};

        // Auto-migrate legacy or empty projects
        if (!project || !project.tracks) {
          project = {
            id: projectId,
            name: data.name || "Untitled Project",
            fps: 30,
            duration: 0,
            tracks: [
              { id: "video-track", type: "video", order: 0, clips: [] },
              {
                id: "audio-track",
                type: "audio",
                order: 1,
                clips: [],
                muted: false,
                volume: 1.0,
              },
            ],
          };
        }

        const hydratedAssets: Record<string, import("@/lib/model/types").Asset> = {};
        const assetEntries = Object.entries(serializedAssets);

        for (let i = 0; i < assetEntries.length; i++) {
          const [id, sAsset] = assetEntries[i];
          const serializedAsset = sAsset as import("@/lib/model/types").Asset;
          setLoadStatus(
            `Loading video file ${i + 1}/${assetEntries.length}: ${
              serializedAsset.fileName
            }...`
          );

          if (serializedAsset.serverUrl) {
            try {
              const fileRes = await fetch(serializedAsset.serverUrl);
              const blob = await fileRes.blob();
              const file = new File([blob], serializedAsset.fileName, {
                type: blob.type,
              });
              const objectUrl = URL.createObjectURL(file);

              hydratedAssets[id] = {
                id: serializedAsset.id,
                fileName: serializedAsset.fileName,
                duration: serializedAsset.duration,
                width: serializedAsset.width,
                height: serializedAsset.height,
                codec: serializedAsset.codec,
                serverUrl: serializedAsset.serverUrl,
                file,
                objectUrl,
              };
            } catch (err) {
              console.error(
                `Failed to load asset ${serializedAsset.fileName}:`,
                err
              );
            }
          }
        }

        setLoadStatus("Preparing video for editing...");

        // Load into preview engine in parallel
        const engine = getPreviewEngine();

        // Set up progress tracking before loading assets
        engine.onDecodeProgress((decoded, total) => {
          if (total > 0) {
            setDecodeProgress(Math.round((decoded / total) * 100));
          }
        });

        const loadAssetPromises = Object.values(hydratedAssets).map((asset) =>
          engine.loadAsset(asset)
        );

        await Promise.race([
          Promise.all(loadAssetPromises),
          new Promise((res) => setTimeout(res, 2500)),
        ]);

        // Wait for full decode with a 2.5s max timeout safeguard
        const hasVideoAssets = Object.keys(hydratedAssets).length > 0;
        if (hasVideoAssets) {
          await Promise.race([
            engine.awaitFullDecode(2500),
            new Promise((res) => setTimeout(res, 2500)),
          ]);
        }

        engine.updateProject(project, hydratedAssets);
        engine.seekTo(0);

        // Hydrate the editor store
        useEditorStore.getState().loadProject(
          project,
          hydratedAssets,
          projectId
        );

        setLoading(false);
      } catch (err) {
        console.error("Failed to load project:", err);
        setError("Failed to load project");
      }
    }

    loadProject();
  }, [projectId, status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)] mb-3">
            {loadStatus}
          </p>

          {/* Decode progress bar */}
          {decodeProgress > 0 && decodeProgress < 100 && (
            <div className="w-56 mx-auto">
              <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${decodeProgress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                {decodeProgress}%
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center max-w-md p-8 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)]">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            {error}
          </h1>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <Editor />;
}
