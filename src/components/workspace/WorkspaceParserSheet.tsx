import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ParserModeToggle } from "@/components/flashcard/ParserModeToggle";
import { InlineSplitSettings } from "@/components/flashcard/InlineSplitSettings";
import { AiSettingsPanel, Toggle, AI_MODEL_PRESETS, useAiSettings } from "@/components/flashcard/AiSettingsPanel";
import { type SplitSettings, PREDEFINED_EXTRACTION_SETS } from "@/components/flashcard/SplitSettingsDialog";
import type { AiModelPresetId } from "@/hooks/useDeckWorkspace";
import { SlidersHorizontal, FileCode2, Check } from "lucide-react";
import { LLM_FORMAT_INSTRUCTIONS } from "@/data/formatInstructions";

interface WorkspaceParserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parserMode: "regex" | "heuristic";
  onParserModeChange: (mode: "regex" | "heuristic") => void;
  selectedModel: AiModelPresetId;
  onModelChange: (model: AiModelPresetId) => void;
  validateJson: boolean;
  onValidateJsonChange: (val: boolean) => void;
  extractTopicBadges?: boolean;
  onExtractTopicBadgesChange?: (val: boolean) => void;
  splitSettings: SplitSettings;
  onSplitSettingsChange: (settings: SplitSettings) => void;
  sampleText: string;
  // AI Heuristic support
  aiSettings: ReturnType<typeof useAiSettings>;
  onDeriveStencil: () => void;
  clearStencil: () => void;
  isProcessing: boolean;
  aiError: string | null;
}

export function WorkspaceParserSheet({
  open,
  onOpenChange,
  parserMode,
  onParserModeChange,
  selectedModel,
  onModelChange,
  validateJson,
  onValidateJsonChange,
  extractTopicBadges = true,
  onExtractTopicBadgesChange,
  splitSettings,
  onSplitSettingsChange,
  sampleText,
  aiSettings,
  onDeriveStencil,
  clearStencil,
  isProcessing,
  aiError,
}: WorkspaceParserSheetProps) {
  const aiExtractionActive = Boolean(aiSettings.stencil);
  const [copied, setCopied] = React.useState(false);

  const handleCopyFormatInstructions = React.useCallback(() => {
    navigator.clipboard.writeText(LLM_FORMAT_INSTRUCTIONS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[600px] md:w-[640px] sm:max-w-[640px] p-0 flex flex-col bg-background border-l border-border shadow-2xl"
      >
        <SheetHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            <SheetTitle className="text-lg font-bold">Parser & Extraction Tuning</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Configure custom delimiters, AI output normalization, and structural heuristics.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6 space-y-6">
          {/* Section 1: Normalization & General Constraints */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Input Normalization & Validation
            </h4>

            <div className="space-y-3 bg-muted/30 border border-border/60 rounded-xl p-3.5">
              <label className="text-xs font-medium flex items-center justify-between">
                <span>Model Target / Normalizer</span>
                <select
                  value={selectedModel}
                  onChange={(e) => onModelChange(e.target.value as AiModelPresetId)}
                  className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-1 focus:ring-primary min-w-[140px]"
                >
                  {(Object.keys(AI_MODEL_PRESETS) as AiModelPresetId[]).map((id) => (
                    <option key={id} value={id}>
                      {AI_MODEL_PRESETS[id].label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <div className="flex flex-col">
                  <span className="text-xs font-medium">Strict JSON Validation</span>
                  <span className="text-[10px] text-muted-foreground">
                    Enforce required &apos;front&apos; and &apos;back&apos; properties
                  </span>
                </div>
                <Toggle checked={validateJson} onChange={onValidateJsonChange} />
              </div>

              {onExtractTopicBadgesChange && (
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <div className="flex flex-col pr-2">
                    <span className="text-xs font-medium">Extract Topic Badges</span>
                    <span className="text-[10px] text-muted-foreground">
                      Format leading $$Topic | Subtopic$$ or [Topic] into styled card badges and Anki tags
                    </span>
                  </div>
                  <Toggle checked={extractTopicBadges} onChange={onExtractTopicBadgesChange} />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Strategy Selector & Visually Connected Content Panel */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Extraction Strategy
            </h4>

            {/* Seamless unified card: Tab selection directly anchors to content under it */}
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
              {/* Tab Header */}
              <div className="bg-muted/50 p-3 border-b border-border/70">
                <ParserModeToggle
                  mode={parserMode}
                  onModeChange={onParserModeChange}
                  disabled={isProcessing}
                />
              </div>

              {/* Connected Content Body (No gaps, direct and uncollapsed) */}
              <div className="p-4 bg-background">
                {parserMode === "heuristic" ? (
                  <AiSettingsPanel
                    settings={aiSettings}
                    onDeriveStencil={onDeriveStencil}
                    clearStencil={clearStencil}
                    hasInput={Boolean(sampleText.trim())}
                    stencilActive={aiExtractionActive}
                    error={aiError}
                    isProcessing={isProcessing}
                  />
                ) : (
                  <InlineSplitSettings
                    settings={splitSettings}
                    onSettingsChange={onSplitSettingsChange}
                    sampleText={sampleText}
                  />
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyFormatInstructions}
            className="text-xs font-medium gap-1.5 shadow-2xs"
            title="Copy LLM Format Instructions prompt to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-semibold">Format Copied!</span>
              </>
            ) : (
              <>
                <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Copy Format Instructions</span>
              </>
            )}
          </Button>

          <Button size="sm" onClick={() => onOpenChange(false)} className="text-xs font-semibold px-4">
            Done & Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
