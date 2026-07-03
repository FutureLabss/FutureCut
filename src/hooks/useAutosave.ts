// ============================================================
// FutureCut — Autosave Hook
// ============================================================
// Debounced autosave of project state to the backend.
// Watches for project state changes and PUTs to the API
// after a 3-second debounce window.
// ============================================================

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "@/lib/store/editorStore";

const DEBOUNCE_MS = 3000;

export function useAutosave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const isMountedRef = useRef(true);

  const save = useCallback(async () => {
    const state = useEditorStore.getState();
    const { serverProjectId, project, assets } = state;

    if (!serverProjectId) return;

    // Serialize assets omitting File and objectUrl
    const serializedAssets = Object.entries(assets).reduce((acc, [id, asset]) => {
      acc[id] = {
        id: asset.id,
        fileName: asset.fileName,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        codec: asset.codec,
        serverUrl: asset.serverUrl,
      };
      return acc;
    }, {} as Record<string, any>);

    const payload = {
      project,
      assets: serializedAssets,
    };
    const projectJson = JSON.stringify(payload);

    // Skip if nothing changed
    if (projectJson === lastSavedRef.current) return;

    state.setSaveStatus("saving");

    try {
      const res = await fetch(`/api/projects/${serverProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          projectData: payload,
        }),
      });

      if (!isMountedRef.current) return;

      if (res.ok) {
        lastSavedRef.current = projectJson;
        useEditorStore.getState().setSaveStatus("saved");
      } else {
        useEditorStore.getState().setSaveStatus("error");
      }
    } catch {
      if (!isMountedRef.current) return;
      useEditorStore.getState().setSaveStatus("offline");
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      // Only trigger on project changes or asset list size changes, not on saveStatus/serverProjectId changes
      if (
        JSON.stringify(state.project) === JSON.stringify(prevState.project) &&
        Object.keys(state.assets).length === Object.keys(prevState.assets).length
      ) {
        return;
      }

      if (!state.serverProjectId) return;

      // Mark as unsaved immediately
      state.setSaveStatus("unsaved");

      // Debounce the actual save
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(save, DEBOUNCE_MS);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [save]);
}
