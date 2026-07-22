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
import { useEditorStore } from "@/lib/store/editorStore";
import { useUIStore } from "@/lib/store/uiStore";
import { PreviewCanvas } from "./preview/PreviewCanvas";
import { TransportControls } from "./preview/TransportControls";
import { Timeline } from "./timeline/Timeline";
import { UploadZone } from "./upload/UploadZone";
import { ExportDialog } from "./export/ExportDialog";
import { ClipPropertiesPanel } from "./properties/ClipPropertiesPanel";
import { CaptionPanel } from "./properties/CaptionPanel";
import { useAutosave } from "@/hooks/useAutosave";
import {
  detectFeatures,
  getUnsupportedMessage,
} from "@/lib/utils/featureDetect";

export function Editor() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "properties" | "captions">("timeline");
  const [sidebarTab, setSidebarTab] = useState<"effects" | "captions" | "audio">("captions");

  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const isExporting = useUIStore((s) => s.isExporting);

  // Wire up autosave
  useAutosave();

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  // Auto-switch to properties tab on mobile/tablet when a clip is selected
  useEffect(() => {
    queueMicrotask(() => {
      if (selectedClipId) {
        setActiveTab("properties");
      } else {
        setActiveTab("timeline");
      }
    });
  }, [selectedClipId]);

  // Bind the temporal store reactively to check past/future states
  const { undo, redo, pastStates, futureStates } = useStore(useEditorStore.temporal);

  const hasContent = Object.keys(assets).length > 0;

  // Keybindings handling omitted for brevity...
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
        const isDecoding = useUIStore.getState().isDecoding;
        if (!isDecoding) {
          useUIStore.getState().togglePlay();
        }
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
    return <div className="h-screen bg-[#090a0f]" />;
  }

  // Rest of metadata, unsupported detection remains same
  const features = detectFeatures();
  const unsupportedMessage = getUnsupportedMessage(features);

  if (unsupportedMessage) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#090a0f]">
        <div className="max-w-lg p-8 rounded-2xl bg-[#12141d]/90 border border-white/10 text-center backdrop-blur-xl">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-white mb-3 font-outfit">
            Browser Not Supported
          </h1>
          <p className="text-gray-400 leading-relaxed text-sm">
            {unsupportedMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#090a0f] text-gray-100 select-none">
      {/* Top Header matching stitch/mainScreen.png */}
      <header className="flex items-center justify-between h-14 px-5 bg-[#0d0e17]/90 border-b border-white/10 shrink-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="text-xs font-semibold text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          
          <div className="w-px h-4 bg-white/10" />

          {/* Logo Badge */}
          <div className="flex items-center gap-2">
            <img
              src="/logo-icon.png"
              alt="FutureCut Logo"
              className="w-6 h-6 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]"
            />
            <h1 className="text-sm font-bold tracking-tight text-white font-outfit">
              FutureCut
            </h1>
          </div>

          <div className="w-px h-4 bg-white/10" />

          <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
            {saveStatus === "saving" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Saving...
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Saved
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Unsaved changes
              </>
            )}
          </span>
        </div>

        {/* Top Right Header Controls */}
        <div className="flex items-center gap-3">
          {hasContent && (
            <>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => undo()}
                  disabled={pastStates.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-medium text-gray-200 border border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Undo (Cmd/Ctrl+Z)"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Undo
                </button>

                <button
                  onClick={() => redo()}
                  disabled={futureStates.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-medium text-gray-200 border border-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  title="Redo (Cmd/Ctrl+Shift+Z)"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Redo
                </button>
              </div>

              <button
                onClick={() => useUIStore.getState().setExporting(true)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Export MP4
              </button>

              <button
                onClick={() => alert("Settings configuration modal")}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all"
                title="Settings"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!hasContent ? (
          /* Upload state */
          <UploadZone />
        ) : (
          <>
            {/* Preview & Right Inspector Panel */}
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col items-center justify-center bg-[#07070d] min-h-0 p-4 relative">
                <PreviewCanvas />
                <TransportControls />
              </div>

              {/* Inspector Sidebar matching stitch/mainScreen.png */}
              <div className="hidden lg:flex flex-col shrink-0 border-l border-white/10 bg-[#0d0e17]/80 backdrop-blur-xl w-[320px] h-full min-h-0">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                  <h3 className="text-base font-bold text-white font-outfit tracking-wide">
                    Inspector
                  </h3>
                </div>

                {/* Tab switcher: Effects | Captions | Audio */}
                <div className="flex border-b border-white/10 p-1.5 bg-black/20 gap-1 mx-3 mt-3 rounded-xl border">
                  <button
                    onClick={() => setSidebarTab("effects")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      sidebarTab === "effects"
                        ? "bg-purple-600/30 text-white border border-purple-500/40 shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Effects
                  </button>
                  <button
                    onClick={() => setSidebarTab("captions")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      sidebarTab === "captions"
                        ? "bg-purple-600/30 text-white border border-purple-500/40 shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Captions
                  </button>
                  <button
                    onClick={() => setSidebarTab("audio")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      sidebarTab === "audio"
                        ? "bg-purple-600/30 text-white border border-purple-500/40 shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Audio
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {sidebarTab === "captions" ? (
                    <CaptionPanel />
                  ) : (
                    <ClipPropertiesPanel tab={sidebarTab} />
                  )}
                </div>
              </div>
            </div>

            {/* Mobile/Tablet Workspace Tabs Switcher */}
            <div className="flex lg:hidden border-t border-white/10 bg-[#0d0e17] shrink-0">
              <button
                onClick={() => setActiveTab("timeline")}
                className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "timeline"
                    ? "border-purple-500 text-white bg-white/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveTab("properties")}
                className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === "properties"
                    ? "border-purple-500 text-white bg-white/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                Properties
                {selectedClipId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("captions")}
                className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "captions"
                    ? "border-purple-500 text-white bg-white/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                Captions
              </button>
            </div>

            {/* Mobile/Tablet Properties Panel */}
            <div className={`${activeTab === "properties" ? "flex" : "hidden"} lg:hidden h-[280px] sm:h-[320px] border-t border-white/10 overflow-hidden shrink-0`}>
              <ClipPropertiesPanel />
            </div>

            {/* Mobile/Tablet Captions Panel */}
            <div className={`${activeTab === "captions" ? "flex" : "hidden"} lg:hidden h-[280px] sm:h-[320px] border-t border-white/10 overflow-hidden shrink-0`}>
              <CaptionPanel />
            </div>

            {/* Timeline (always visible on desktop, tabbed on mobile) */}
            <div className={`${activeTab === "timeline" ? "block" : "hidden"} lg:block shrink-0 border-t border-white/10`}>
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
