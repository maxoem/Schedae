import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InlineSplitSettings } from "@/components/flashcard/InlineSplitSettings";
import { AiSettingsPanel, Toggle, AI_MODEL_PRESETS, useAiSettings } from "@/components/flashcard/AiSettingsPanel";
import { type SplitSettings } from "@/components/flashcard/SplitSettingsDialog";
import type { AiModelPresetId } from "@/hooks/useDeckWorkspace";
import { CARD_TEMPLATES, type CardTemplateId } from "@/converters/templates";
import { resolveApkgModelConfig, type ExportMathFormat, type NoteTypeMode } from "@/converters/jsonToApkg";
import type { FlashCard } from "@/converters/types";
import {
  SlidersHorizontal,
  Layers,
  FileCode2,
  Check,
  Tag,
  Sparkles,
  Info,
  RotateCcw,
} from "lucide-react";
import { LLM_FORMAT_INSTRUCTIONS } from "@/data/formatInstructions";
import { cn } from "@/lib/utils";

const TEMPLATE_DESCRIPTIONS: Record<CardTemplateId, string> = {
  markdown_basic: "Clean, responsive typography with KaTeX math rendering, dark mode support, and native rendering for custom fields like Topic and Quelle.",
  modern_light: "Refined modern light styling with subtle card borders, rounded corners, and elevated typography.",
  modern_dark: "High-contrast dark theme optimized for OLED displays and low-light study sessions.",
  default: "Standard default Anki card styling without extra custom CSS.",
};

export type WorkspaceSheetTab = "card" | "parser";

interface WorkspaceParserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab?: WorkspaceSheetTab;
  onActiveTabChange?: (tab: WorkspaceSheetTab) => void;
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
  selectedTemplate?: CardTemplateId;
  onTemplateChange?: (template: CardTemplateId) => void;
  noteTypeMode?: NoteTypeMode;
  onNoteTypeModeChange?: (mode: NoteTypeMode) => void;
  customNoteTypeName?: string;
  onCustomNoteTypeNameChange?: (name: string) => void;
  exportMathFormat?: ExportMathFormat;
  onExportMathFormatChange?: (format: ExportMathFormat) => void;
  activeCards?: FlashCard[];
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
  activeTab: controlledActiveTab = "card",
  onActiveTabChange,
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
  selectedTemplate = "markdown_basic",
  onTemplateChange,
  noteTypeMode = "unified",
  onNoteTypeModeChange,
  customNoteTypeName = "",
  onCustomNoteTypeNameChange,
  exportMathFormat = "katex",
  onExportMathFormatChange,
  activeCards = [],
  aiSettings,
  onDeriveStencil,
  clearStencil,
  isProcessing,
  aiError,
}: WorkspaceParserSheetProps) {
  // Card & Anki Settings is primary (pre-selected by default)
  const [internalTab, setInternalTab] = useState<WorkspaceSheetTab>(
    controlledActiveTab || "card"
  );

  useEffect(() => {
    if (controlledActiveTab) {
      setInternalTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  const activeTab = controlledActiveTab ?? internalTab;
  const handleTabChange = (tab: WorkspaceSheetTab) => {
    setInternalTab(tab);
    onActiveTabChange?.(tab);
  };

  const aiExtractionActive = Boolean(aiSettings.stencil);
  const [copied, setCopied] = useState(false);

  const defaultNoteTypeName = CARD_TEMPLATES[selectedTemplate]?.noteTypeName || "Markdown+Katex";
  const effectiveBaseName = customNoteTypeName.trim() || defaultNoteTypeName;
  const resolvedModelPreview = React.useMemo(
    () =>
      resolveApkgModelConfig(activeCards, selectedTemplate, {
        noteTypeMode,
        customNoteTypeName,
      }),
    [activeCards, selectedTemplate, noteTypeMode, customNoteTypeName]
  );

  const handleCopyFormatInstructions = React.useCallback(() => {
    navigator.clipboard.writeText(LLM_FORMAT_INSTRUCTIONS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[600px] md:w-[640px] sm:max-w-[640px] p-0 flex flex-col bg-white dark:bg-zinc-950 border-l border-zinc-200/80 shadow-2xl h-full max-h-screen gap-0 overflow-hidden"
      >
        {/* Sheet Top Header (Fixed at top) */}
        <SheetHeader className="p-4 sm:p-5 pb-3 border-b border-zinc-200/80 shrink-0 space-y-3 bg-white dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200/80">
              {activeTab === "card" ? (
                <Layers className="w-4 h-4 text-zinc-700" />
              ) : (
                <SlidersHorizontal className="w-4 h-4 text-zinc-700" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base sm:text-lg font-bold text-zinc-950 tracking-tight">
                {activeTab === "card" ? "Card & Anki Settings" : "Parser & Extraction Tuning"}
              </SheetTitle>
              <SheetDescription className="text-xs text-zinc-500 leading-snug">
                {activeTab === "card"
                  ? "Configure card fields, topic badge detection, and Anki card display."
                  : "Configure custom delimiters, AI normalizers, and extraction heuristics."}
              </SheetDescription>
            </div>
          </div>

          {/* Segmented Top Tab Selector — Card & Anki Settings is Primary (First) */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 shadow-2xs gap-1">
            <button
              type="button"
              onClick={() => handleTabChange("card")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "card"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40"
              )}
            >
              <Layers className="w-3.5 h-3.5 text-zinc-700" />
              <span>Card &amp; Anki Settings</span>
              {extractTopicBadges && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Topic Badges Active" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("parser")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === "parser"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40"
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-700" />
              <span>Parser &amp; Extraction</span>
              {parserMode === "heuristic" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="AI Extraction Active" />
              )}
            </button>
          </div>
        </SheetHeader>

        {/* Scrollable Content Body — Flat, clean layout without nested boxes */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-6">
          {activeTab === "card" ? (
            /* ================================================================ */
            /* TAB 1 (PRIMARY): CARD & ANKI SETTINGS                            */
            /* ================================================================ */
            <div className="space-y-6">
              {/* Section 1: Anki Fields & Topic Badges */}
              <div className="space-y-3 pb-6 border-b border-zinc-200/70">
                <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Card Fields &amp; Anki Display
                </h4>

                <div className="space-y-3">
                  {/* Extract Topic Badges Toggle Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-zinc-600" />
                        <span className="text-xs font-semibold text-zinc-950">Extract Topic Badges</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 bg-zinc-100 text-zinc-700 border border-zinc-200/80 font-mono"
                        >
                          Topic Field
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Detects leading topic patterns such as{" "}
                        <code className="bg-zinc-100 px-1 py-0.5 rounded text-[11px] text-zinc-800 font-mono">
                          $$Topic | Subtopic$$
                        </code>
                        ,{" "}
                        <code className="bg-zinc-100 px-1 py-0.5 rounded text-[11px] text-zinc-800 font-mono">
                          [Topic]
                        </code>
                        , or{" "}
                        <code className="bg-zinc-100 px-1 py-0.5 rounded text-[11px] text-zinc-800 font-mono">
                          【Topic】
                        </code>{" "}
                        at the beginning of questions.
                      </p>
                    </div>
                    {onExtractTopicBadgesChange && (
                      <Toggle
                        checked={extractTopicBadges}
                        onChange={onExtractTopicBadgesChange}
                      />
                    )}
                  </div>

                  {/* Clean Single-Level Transformation Preview Banner */}
                  <div className="pt-1 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Live Preview
                      </span>
                      <span className="text-[10px] font-medium text-zinc-500">
                        {extractTopicBadges ? "✓ Creating Topic field & tag" : "✕ Kept as plain question text"}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-lg bg-zinc-50 border border-zinc-200/70">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-zinc-400 block font-medium">Source Note</span>
                        <span className="text-zinc-700 font-mono text-[11px] truncate block">
                          $$Pathologie | Zellschäden$$ Was ist Apoptose?
                        </span>
                      </div>
                      <span className="hidden sm:inline text-zinc-300 font-bold">→</span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[10px] text-zinc-400 block font-medium">Anki Output</span>
                        {extractTopicBadges ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              PATHOLOGIE | ZELLSCHÄDEN
                            </span>
                            <span className="text-xs font-semibold text-zinc-900">Was ist Apoptose?</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-600 font-mono">
                            $$Pathologie | Zellschäden$$ Was ist Apoptose?
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Anki Card Template Selection */}
              <div className="space-y-3 pb-6 border-b border-zinc-200/70">
                <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Target Card Template
                </h4>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-xs font-semibold text-zinc-900">
                      Visual Style Template
                    </Label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => onTemplateChange?.(e.target.value as CardTemplateId)}
                      className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 font-medium focus:ring-1 focus:ring-zinc-900 focus:outline-hidden cursor-pointer"
                    >
                      {(Object.keys(CARD_TEMPLATES) as CardTemplateId[]).map((tId) => (
                        <option key={tId} value={tId}>
                          {CARD_TEMPLATES[tId].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {TEMPLATE_DESCRIPTIONS[selectedTemplate] ||
                      "Responsive card styling with full KaTeX math support and automatic dark mode."}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-600 border-zinc-200/80">
                      LaTeX Math
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-600 border-zinc-200/80">
                      Dark Mode Safe
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-600 border-zinc-200/80">
                      Mobile Responsive
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-600 border-zinc-200/80">
                      Custom Fields
                    </Badge>
                  </div>

                  {/* Opt-in Anki MathJax Export Toggle */}
                  <div className="pt-3 mt-3 border-t border-zinc-200/60 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-950">
                          Convert Math to Anki MathJax
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] py-0 px-1.5 font-mono border",
                            exportMathFormat === "anki_mathjax"
                              ? "bg-amber-50 text-amber-800 border-amber-200/80"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200/80"
                          )}
                        >
                          {exportMathFormat === "anki_mathjax" ? "\\(…\\) / \\[…\\] (Opt-in)" : "KaTeX $ / $$"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        {exportMathFormat === "anki_mathjax" ? (
                          <>
                            Converts formulas into clean native Anki MathJax delimiters (
                            <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">\(…\)</code>{" "}
                            and{" "}
                            <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">\[…\]</code>
                            ) for templates without KaTeX.
                          </>
                        ) : (
                          <>
                            Default: normalizes all math into plain{" "}
                            <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">$…$</code>{" "}
                            and{" "}
                            <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">$$…$$</code>{" "}
                            so KaTeX renders cleanly without Anki converting formulas to{" "}
                            <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">&lt;anki-mathjax&gt;</code>.
                          </>
                        )}
                      </p>
                    </div>
                    {onExportMathFormatChange && (
                      <Toggle
                        checked={exportMathFormat === "anki_mathjax"}
                        onChange={(enabled) =>
                          onExportMathFormatChange(enabled ? "anki_mathjax" : "katex")
                        }
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Anki Note Type & Reuse Strategy */}
              <div className="space-y-3.5 pb-6 border-b border-zinc-200/70">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Anki Note Type &amp; Reuse
                  </h4>
                  <Badge
                    variant="secondary"
                    className="text-[10px] py-0 px-1.5 bg-zinc-100 text-zinc-700 border border-zinc-200/80 font-mono"
                  >
                    Stable ID
                  </Badge>
                </div>

                {/* Custom Note Type Name Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="anki-note-type-name" className="text-xs font-semibold text-zinc-900">
                      Note Type Name in Anki
                    </Label>
                    {customNoteTypeName.trim().length > 0 && onCustomNoteTypeNameChange && (
                      <button
                        type="button"
                        onClick={() => onCustomNoteTypeNameChange("")}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset to {defaultNoteTypeName}</span>
                      </button>
                    )}
                  </div>
                  <Input
                    id="anki-note-type-name"
                    type="text"
                    value={customNoteTypeName}
                    onChange={(e) => onCustomNoteTypeNameChange?.(e.target.value)}
                    placeholder={defaultNoteTypeName}
                    className="h-8 text-xs bg-white border-zinc-200 font-medium text-zinc-900"
                  />
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    Leave blank to use <code className="bg-zinc-100 px-1 py-0.2 rounded font-mono text-zinc-800">{defaultNoteTypeName}</code>. Avoids colliding with Anki&apos;s built-in Basic type.
                  </p>
                </div>

                {/* Field Schema Strategy (Unified vs Match Deck Fields) */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-900 block">
                    Field Schema Across Imports
                  </Label>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => onNoteTypeModeChange?.("unified")}
                      aria-pressed={noteTypeMode === "unified"}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all cursor-pointer space-y-1",
                        noteTypeMode === "unified"
                          ? "border-zinc-900 bg-zinc-50/90 shadow-2xs"
                          : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
                              noteTypeMode === "unified" ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
                            )}
                          >
                            {noteTypeMode === "unified" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="text-xs font-semibold text-zinc-950">
                            Unified Note Type
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium"
                          >
                            Recommended
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed pl-5.5">
                        Always includes <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">Front</code>,{" "}
                        <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">Back</code>, and{" "}
                        <code className="bg-zinc-100 px-1 rounded font-mono text-zinc-800">Topic</code> under one shared{" "}
                        <strong className="font-semibold text-zinc-700">{effectiveBaseName}</strong> Note Type so plain decks and topic-badge decks reuse &amp; update the same type in Anki. Extra fields (e.g. Quelle) get a dedicated variant.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNoteTypeModeChange?.("per_schema")}
                      aria-pressed={noteTypeMode === "per_schema"}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all cursor-pointer space-y-1",
                        noteTypeMode === "per_schema"
                          ? "border-zinc-900 bg-zinc-50/90 shadow-2xs"
                          : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
                            noteTypeMode === "per_schema" ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
                          )}
                        >
                          {noteTypeMode === "per_schema" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="text-xs font-semibold text-zinc-950">
                          Match Deck Fields Only
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed pl-5.5">
                        Exports only fields actually present in the deck (e.g.{" "}
                        <strong className="font-semibold text-zinc-700">{effectiveBaseName}</strong> for Q&amp;A vs{" "}
                        <strong className="font-semibold text-zinc-700">{effectiveBaseName} (Topic)</strong>). Each field set reuses &amp; updates its own stable Anki Note Type without adding unused fields.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Live Anki Export Metadata Preview */}
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/70 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Next .apkg Export
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      ID {resolvedModelPreview.modelId}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-700">
                    <span>
                      Note Type:{" "}
                      <code className="bg-white border border-zinc-200/80 px-1.5 py-0.5 rounded font-mono font-semibold text-zinc-900">
                        {resolvedModelPreview.noteTypeName}
                      </code>
                    </span>
                    <span>
                      Card Type:{" "}
                      <code className="bg-white border border-zinc-200/80 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                        {resolvedModelPreview.cardTypeName}
                      </code>
                    </span>
                    <span>
                      Math:{" "}
                      <code className="bg-white border border-zinc-200/80 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                        {exportMathFormat === "anki_mathjax" ? "Anki MathJax (\\( / \\[)" : "KaTeX ($ / $$)"}
                      </code>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5 text-zinc-600">
                    <span className="mr-1">Fields:</span>
                    {resolvedModelPreview.fieldNames.map((f) => (
                      <code
                        key={f}
                        className="text-[10px] bg-white border border-zinc-200/80 px-1.5 py-0.2 rounded font-mono text-zinc-800"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 4: Anki Field Architecture Guide */}
              <div className="space-y-2.5">
                <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Anki Field Schema Reference
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-700 font-medium">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Fields exported to your .apkg deck:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-600 pt-0.5">
                    <div className="flex items-start gap-1.5">
                      <code className="text-[10px] font-semibold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        Front
                      </code>
                      <span>Question side with KaTeX &amp; Markdown</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <code className="text-[10px] font-semibold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        Back
                      </code>
                      <span>Answer side with KaTeX &amp; Markdown</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <code className="text-[10px] font-semibold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        Topic
                      </code>
                      <span>Category badge rendered above question</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <code className="text-[10px] font-semibold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                        Quelle
                      </code>
                      <span>Optional citation rendered in footer</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================================================================ */
            /* TAB 2: PARSER & EXTRACTION TUNING                                */
            /* ================================================================ */
            <div className="space-y-6">
              {/* Option to select AI Extraction over Ollama (Flat, no box-in-box) */}
              <div className="space-y-3 pb-6 border-b border-zinc-200/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-zinc-700" />
                      <span className="text-xs font-semibold text-zinc-950">
                        Enable AI Extraction (via Ollama)
                      </span>
                      {parserMode === "heuristic" ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium"
                        >
                          AI Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 bg-zinc-100 text-zinc-600 border border-zinc-200/80"
                        >
                          Rules Mode
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Derive flashcards using local LLM heuristics from unstructured notes instead of delimiter rules.
                    </p>
                  </div>
                  <Toggle
                    checked={parserMode === "heuristic"}
                    onChange={(checked) => onParserModeChange(checked ? "heuristic" : "regex")}
                    disabled={isProcessing}
                  />
                </div>

                {/* When AI is enabled, show the AI extraction controls */}
                {parserMode === "heuristic" && (
                  <div className="pt-2">
                    <AiSettingsPanel
                      settings={aiSettings}
                      onDeriveStencil={onDeriveStencil}
                      clearStencil={clearStencil}
                      hasInput={Boolean(sampleText.trim())}
                      stencilActive={aiExtractionActive}
                      error={aiError}
                      isProcessing={isProcessing}
                    />
                  </div>
                )}
              </div>

              {/* Standard Delimiters & Pattern Rules (Flat layout, directly displayed) */}
              {parserMode === "regex" && (
                <div className="space-y-3 pb-6 border-b border-zinc-200/70">
                  <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Delimiters &amp; Patterns
                  </h4>

                  <InlineSplitSettings
                    settings={splitSettings}
                    onSettingsChange={onSplitSettingsChange}
                    sampleText={sampleText}
                  />
                </div>
              )}

              {/* Input Normalization & Validation (Strictly Input Normalization, flat) */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Input Normalization &amp; Validation
                </h4>

                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-zinc-900 font-semibold">Model Target / Normalizer</span>
                      <span className="text-[11px] text-zinc-500">
                        Sanitizes AI artifacts and citations from notes
                      </span>
                    </div>
                    <select
                      value={selectedModel}
                      onChange={(e) => onModelChange(e.target.value as AiModelPresetId)}
                      className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 font-medium focus:ring-1 focus:ring-zinc-900 focus:outline-hidden min-w-[140px] cursor-pointer"
                    >
                      {(Object.keys(AI_MODEL_PRESETS) as AiModelPresetId[]).map((id) => (
                        <option key={id} value={id}>
                          {AI_MODEL_PRESETS[id].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-200/60">
                    <div className="flex flex-col pr-2">
                      <span className="text-xs font-semibold text-zinc-900">Strict JSON Validation</span>
                      <span className="text-[11px] text-zinc-500">
                        Enforces mandatory &apos;front&apos; and &apos;back&apos; properties for raw JSON cards
                      </span>
                    </div>
                    <Toggle checked={validateJson} onChange={onValidateJsonChange} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sheet Bottom Footer (Fixed at bottom) */}
        <div className="p-3.5 sm:p-4 border-t border-zinc-200/80 bg-zinc-50/70 flex items-center justify-between shrink-0">
          {activeTab === "parser" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFormatInstructions}
              className="text-xs font-medium gap-1.5 shadow-2xs border-zinc-200 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 cursor-pointer"
              title="Copy LLM Format Instructions prompt to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-700 font-semibold">Format Copied!</span>
                </>
              ) : (
                <>
                  <FileCode2 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Copy Format Prompt</span>
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Settings apply immediately</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold px-4 h-8 bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg shadow-xs cursor-pointer"
          >
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
