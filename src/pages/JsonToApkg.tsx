import React, { useRef, useCallback, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAiSettings, StreamingResponseDialog, LlmGuideDialog } from "@/components/flashcard/AiSettingsPanel";
import { useKeyboardShortcuts } from "@/components/flashcard/useKeyboardShortcuts";
import { useDeckWorkspace } from "@/hooks/useDeckWorkspace";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceSourcePanel } from "@/components/workspace/WorkspaceSourcePanel";
import { WorkspacePreviewPanel } from "@/components/workspace/WorkspacePreviewPanel";
import { WorkspaceParserSheet } from "@/components/workspace/WorkspaceParserSheet";
import { AlertCircle, X, FileText, Layers } from "lucide-react";

export default function JsonToApkg() {
  const [mobileActiveTab, setMobileActiveTab] = useState<"source" | "preview">("source");
  const [sheetActiveTab, setSheetActiveTab] = useState<"card" | "parser">("card");
  const ai = useAiSettings();
  const abortRef = useRef<AbortController | null>(null);

  const workspace = useDeckWorkspace(ai.stencil);

  const handleOpenParserSettings = useCallback(() => {
    setSheetActiveTab("parser");
    workspace.setIsSheetOpen(true);
  }, [workspace]);

  const handleOpenCardSettings = useCallback(() => {
    setSheetActiveTab("card");
    workspace.setIsSheetOpen(true);
  }, [workspace]);

  // Keyboard shortcuts (Ctrl+Enter to save batch, Ctrl+S to export, Ctrl+M to toggle rules/settings)
  useKeyboardShortcuts({
    onCompile: () => {
      if (workspace.draftCards.length > 0) {
        workspace.addCurrentAsBatch();
      }
    },
    onExport: () => {
      if (workspace.totalCardCount > 0) {
        workspace.exportApkg();
      }
    },
    onToggleMarkers: () => {
      if (!workspace.isSheetOpen) {
        setSheetActiveTab("card");
      }
      workspace.setIsSheetOpen((prev) => !prev);
    },
  });

  // Handler for AI stencil structure derivation
  const handleAnalyzeStructure = useCallback(async () => {
    if (!workspace.sourceText.trim()) return;
    if (ai.llmModels.length === 0) {
      ai.setIsLlmGuideOpen(true);
      return;
    }
    if (!ai.selectedLlmModel) {
      workspace.setExportError("Please select a local LLM model in settings.");
      return;
    }

    abortRef.current = new AbortController();
    await ai.deriveStencil(workspace.sourceText, {
      onError: (msg) => workspace.setExportError(msg),
      onDone: () => {},
    });
  }, [workspace, ai]);

  const handleClearStencil = useCallback(() => {
    ai.setStencil(null);
  }, [ai]);

  return (
    <TooltipProvider>
      <div className="relative h-full flex-1 min-h-0 overflow-hidden bg-[#F4F5F7] flex flex-col w-full">
        {/* Workspace Top Header */}
        <WorkspaceHeader
          deckName={workspace.deckName}
          onDeckNameChange={workspace.setDeckName}
          cardCount={workspace.totalCardCount}
          batchCount={workspace.batches.length}
          draftCount={workspace.draftCards.length}
          savedCount={workspace.deckCards.length}
          isProcessing={workspace.isProcessing || ai.isStreamingActive}
          onExport={workspace.exportApkg}
          onOpenParserSettings={handleOpenCardSettings}
          hasCustomRules={Boolean(ai.stencil) || workspace.parserRule === "custom"}
        />

        {/* Global Error Banner */}
        {workspace.exportError && (
          <div className="max-w-[1920px] mx-auto w-full px-3 md:px-4 pt-3 shrink-0">
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between shrink-0 animate-in fade-in-50">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{workspace.exportError}</span>
              </div>
              <button
                onClick={() => workspace.setExportError(null)}
                className="p-1 hover:bg-destructive/20 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile / Narrow Screen View Switcher (< lg) */}
        <div className="lg:hidden px-2.5 sm:px-3 pt-2 shrink-0 max-w-[1920px] mx-auto w-full">
          <div className="flex items-center bg-zinc-200/70 p-1 rounded-xl border border-zinc-200/80 shadow-2xs gap-1">
            <button
              type="button"
              onClick={() => setMobileActiveTab("source")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mobileActiveTab === "source"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Notes</span>
              {workspace.draftCards.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200/80">
                  {workspace.draftCards.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("preview")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mobileActiveTab === "preview"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Deck Preview</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                  workspace.totalCardCount > 0
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-500 border border-zinc-200/80"
                }`}
              >
                {workspace.totalCardCount}
              </span>
            </button>
          </div>
        </div>

        {/* Responsive Workspace: Tabbed on narrow screens (< lg), 2-Column Split on desktop (>= lg) */}
        <main className="flex-1 min-h-0 p-2 sm:p-3 md:p-4 flex flex-col lg:grid lg:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4 overflow-hidden max-w-[1920px] mx-auto w-full">
          {/* Column 1: Source Notes Editor */}
          <div className={`h-full min-h-0 ${mobileActiveTab === "source" ? "flex flex-col flex-1" : "hidden lg:flex lg:flex-col"}`}>
            <WorkspaceSourcePanel
              value={workspace.sourceText}
              onChange={workspace.setSourceText}
              markerPatterns={workspace.highlightPatterns}
              detectedFormatLabel={workspace.parseResult.detectedFormatLabel}
              detectedCardCount={workspace.draftCards.length}
              parserRule={workspace.parserRule}
              onParserRuleChange={workspace.setParserRule}
              hasCustomRules={Boolean(ai.stencil) || workspace.parserRule === "custom"}
              onLoadSample={workspace.loadSample}
              onClear={workspace.clearSource}
              onOpenParserSettings={handleOpenParserSettings}
              onAddToDeck={workspace.addCurrentAsBatch}
              onViewPreview={() => setMobileActiveTab("preview")}
              isProcessing={workspace.isProcessing}
              onFileLoaded={(_text, filename) => {
                if (filename) {
                  const cleanName = filename.replace(/\.[^/.]+$/, "");
                  workspace.setDeckName(cleanName);
                }
              }}
            />
          </div>

          {/* Column 2: Live Flashcard Deck Preview with Collapsible Batches */}
          <div className={`h-full min-h-0 ${mobileActiveTab === "preview" ? "flex flex-col flex-1" : "hidden lg:flex lg:flex-col"}`}>
            <WorkspacePreviewPanel
              batches={workspace.batches}
              draftCards={workspace.draftCards}
              selectedTemplate={workspace.selectedTemplate}
              onTemplateChange={workspace.setSelectedTemplate}
              searchQuery={workspace.searchQuery}
              onSearchChange={workspace.setSearchQuery}
              viewMode={workspace.previewViewMode}
              onViewModeChange={workspace.setPreviewViewMode}
              onDeleteBatch={workspace.deleteBatch}
              onDeleteCardFromBatch={workspace.deleteCardFromBatch}
              onDeleteDraftCard={workspace.deleteDraftCard}
              onClearDeck={workspace.clearDeck}
              onSaveDraftToDeck={workspace.addCurrentAsBatch}
              onLoadSample={workspace.loadSample}
              onOpenParserSettings={handleOpenParserSettings}
              onOpenCardSettings={handleOpenCardSettings}
              extractTopicBadges={workspace.extractTopicBadges}
              onBackToSource={() => setMobileActiveTab("source")}
              diagnostics={workspace.parseResult.diagnostics}
            />
          </div>
        </main>

        {/* Progressive Disclosure: Parser & Delimiter Tuning Slide-Over Sheet */}
        <WorkspaceParserSheet
          open={workspace.isSheetOpen}
          onOpenChange={workspace.setIsSheetOpen}
          activeTab={sheetActiveTab}
          onActiveTabChange={setSheetActiveTab}
          parserMode={workspace.parserMode}
          onParserModeChange={workspace.setParserMode}
          selectedModel={workspace.selectedModel}
          onModelChange={workspace.setSelectedModel}
          validateJson={workspace.validateJson}
          onValidateJsonChange={workspace.setValidateJson}
          extractTopicBadges={workspace.extractTopicBadges}
          onExtractTopicBadgesChange={workspace.setExtractTopicBadges}
          splitSettings={workspace.splitSettings}
          onSplitSettingsChange={workspace.setSplitSettings}
          sampleText={workspace.sourceText}
          selectedTemplate={workspace.selectedTemplate}
          onTemplateChange={workspace.setSelectedTemplate}
          aiSettings={ai}
          onDeriveStencil={handleAnalyzeStructure}
          clearStencil={handleClearStencil}
          isProcessing={workspace.isProcessing}
          aiError={workspace.exportError}
        />

        {/* Supporting Dialogs */}
        <StreamingResponseDialog
          open={ai.isStreamDialogOpen}
          onClose={() => ai.setIsStreamDialogOpen(false)}
          onCloseAbort={() => {
            abortRef.current?.abort();
            ai.setIsStreamingActive(false);
          }}
          isStreaming={ai.isStreamingActive}
          streamText={ai.streamText}
        />
        <LlmGuideDialog
          open={ai.isLlmGuideOpen}
          onRefresh={ai.fetchLlmModels}
          onClose={() => ai.setIsLlmGuideOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}