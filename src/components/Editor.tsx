"use client";

// ============================================================
// FutureCut — Editor Shell
// ============================================================
// Top-level editor component that assembles the layout:
// - Header with toolbar
// - Preview canvas (prominent, top)
// - Timeline (bottom)
// - Upload overlay (when no content)
// ============================================================

import { useEffect, useCallback, useState } from "react";
import { useStore } from "zustand";
import { useEditorStore, useTemporalStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { PreviewCanvas } from "./preview/PreviewCanvas";
import { TransportControls } from "./preview/TransportControls";
import { Timeline } from "./timeline/Timeline";
import { UploadZone } from "./upload/UploadZone";
import { ExportDialog } from "./export/ExportDialog";
import { ClipPropertiesPanel } from "./properties/ClipPropertiesPanel";
import { useAutosave } from "@/hooks/useAutosave";
import {
  detectFeatures,
  getUnsupportedMessage,
} from "@/lib/utils/featureDetect";

export function Editor() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "properties">("timeline");
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const isExporting = useUIStore((s) => s.isExporting);

  // Wire up autosave
  useAutosave();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-switch to properties tab on mobile/tablet when a clip is selected
  useEffect(() => {
    if (selectedClipId) {
      setActiveTab("properties");
    } else {
      setActiveTab("timeline");
    }
  }, [selectedClipId]);

  // Bind the temporal store reactively to check past/future states
  const { undo, redo, pastStates, futureStates } = useStore(useEditorStore.temporal);

  const hasContent = Object.keys(assets).length > 0;
// ============================================================
// Keyboard shortcuts
// ============================================================
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Undo: Cmd/Ctrl + Z
      if (isMeta && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z
      if (isMeta && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
        return;
      }

      // Space: Play/Pause
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        useUIStore.getState().togglePlay();
        return;
      }

      // Delete/Backspace: Delete selected clip
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedClipId &&
        e.target === document.body
      ) {
        e.preventDefault();
        useEditorStore.getState().deleteClip(selectedClipId);
        useUIStore.getState().selectClip(null);
        return;
      }

      // S: Split at playhead
      if (
        e.key === "s" &&
        !isMeta &&
        selectedClipId &&
        e.target === document.body
      ) {
        e.preventDefault();
        const playheadTime = useUIStore.getState().playheadTime;
        useEditorStore
          .getState()
          .splitAtPlayhead(selectedClipId, playheadTime);
        return;
      }
    },
    [selectedClipId, undo, redo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted) {
    return <div className="h-screen bg-[var(--bg-app)]" />;
  }

  // Rest of metadata, unsupported detection remains same
  const features = detectFeatures();
  const unsupportedMessage = getUnsupportedMessage(features);

  if (unsupportedMessage) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-app)]">
        <div className="max-w-lg p-8 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)] text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
            Browser Not Supported
          </h1>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            {unsupportedMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-app)]">
      {/* Header */}
      <header className="flex items-center justify-between h-[var(--header-height)] px-4 bg-[var(--bg-panel)] border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          <div className="w-px h-4 bg-[var(--border)]" />
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate max-w-[150px]">
            {project.name}
          </h1>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            Phase 4
          </span>
          <div className="w-px h-4 bg-[var(--border)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
            {saveStatus === "saving" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
                Saving...
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                Saved
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                Unsaved changes
              </>
            )}
            {saveStatus === "offline" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />
                Offline
              </>
            )}
            {saveStatus === "error" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />
                Save error
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasContent && (
            <>
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  onClick={() => undo()}
                  disabled={pastStates.length === 0}
                  className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Undo (Cmd/Ctrl+Z)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => redo()}
                  disabled={futureStates.length === 0}
                  className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Redo (Cmd/Ctrl+Shift+Z)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="w-px h-5 bg-[var(--border)] mx-1" />
              </div>

              <button
                onClick={() => useUIStore.getState().setExporting(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
              >
                Export MP4
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {!hasContent ? (
          /* Upload state */
          <UploadZone />
        ) : (
          <>
            {/* Preview & Properties Sidebar - adapts side-by-side or stacked tabbed layout */}
            <div className="flex-1 flex flex-col lg:flex-row min-h-0">
              <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-app)] min-h-0 p-4">
                <PreviewCanvas />
                <TransportControls />
              </div>

              {/* Desktop Properties Sidebar (hidden on mobile/tablet) */}
              <div className="hidden lg:flex shrink-0">
                <ClipPropertiesPanel />
              </div>
            </div>

            {/* Mobile/Tablet Workspace Tabs Switcher */}
            <div className="flex lg:hidden border-t border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
              <button
                onClick={() => setActiveTab("timeline")}
                className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "timeline"
                    ? "border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-hover)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveTab("properties")}
                className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === "properties"
                    ? "border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-hover)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Properties
                {selectedClipId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                )}
              </button>
            </div>

            {/* Mobile/Tablet Properties Panel (visible when properties tab is active) */}
            <div className={`${activeTab === "properties" ? "flex" : "hidden"} lg:hidden h-[280px] sm:h-[320px] border-t border-[var(--border)] overflow-hidden shrink-0`}>
              <ClipPropertiesPanel />
            </div>

            {/* Timeline (always visible on desktop, tabbed on mobile) */}
            <div className={`${activeTab === "timeline" ? "block" : "hidden"} lg:block shrink-0 border-t border-[var(--border)]`}>
              <Timeline />
            </div>
          </>
        )}
      </div>

      {/* Export dialog */}
      {isExporting && <ExportDialog />}
    </div>
  );
}
