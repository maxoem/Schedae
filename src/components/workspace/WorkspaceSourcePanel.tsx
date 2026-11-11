import React, { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, Trash2, Wand2, Plus, SlidersHorizontal, FileCode2, Check, BookOpen, ChevronDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SyntaxEditor from "@/components/flashcard/SyntaxEditor";
import type { HighlightMarkerPattern } from "@/components/flashcard/SplitSettingsDialog";
import { WORKSPACE_SAMPLES } from "@/services/deckParser/sampleData";
import type { ParserRuleId } from "@/hooks/useDeckWorkspace";
import { LLM_FORMAT_INSTRUCTIONS } from "@/data/formatInstructions";
import { WorkspaceMediaTray } from "@/components/workspace/WorkspaceMediaTray";
import {
  SUPPORTED_IMAGE_ACCEPT,
  isSupportedImageFile,
  type WorkspaceMediaItem,
} from "@/services/mediaStore";

interface WorkspaceSourcePanelProps {
  value: string;
  onChange: (val: string) => void;
  markerPatterns: HighlightMarkerPattern[];
  detectedFormatLabel: string;
  detectedCardCount: number;
  parserRule: ParserRuleId;
  onParserRuleChange: (rule: ParserRuleId) => void;
  hasCustomRules: boolean;
  onLoadSample: (sampleId: string) => void;
  onClear: () => void;
  onOpenParserSettings: () => void;
  onAddToDeck?: () => void;
  onViewPreview?: () => void;
  isProcessing?: boolean;
  onFileLoaded?: (text: string, filename?: string) => void;
  mediaItems?: WorkspaceMediaItem[];
  draftMediaFilenames?: Set<string>;
  batchMediaFilenames?: Set<string>;
  missingMediaFilenames?: string[];
  onAttachMedia?: (files: File[], selectionStart?: number, selectionEnd?: number) => Promise<number | null> | number | null;
  onInsertMediaSnippet?: (snippet: string, selectionStart?: number, selectionEnd?: number) => number | null;
  onRemoveMedia?: (filename: string) => void;
}

export function WorkspaceSourcePanel({
  value,
  onChange,
  markerPatterns,
  detectedFormatLabel,
  detectedCardCount,
  parserRule,
  onParserRuleChange,
  hasCustomRules,
  onLoadSample,
  onClear,
  onOpenParserSettings,
  onAddToDeck,
  onViewPreview,
  isProcessing,
  onFileLoaded,
  mediaItems = [],
  draftMediaFilenames = new Set<string>(),
  batchMediaFilenames = new Set<string>(),
  missingMediaFilenames = [],
  onAttachMedia,
  onInsertMediaSnippet,
  onRemoveMedia,
}: WorkspaceSourcePanelProps) {
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [cursorRequest, setCursorRequest] = useState<{ pos: number; seq: number } | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  const scheduleCursorMove = useCallback((pos: number | null | undefined) => {
    if (typeof pos !== "number") return;
    setCursorRequest((prev) => ({ pos, seq: (prev?.seq ?? 0) + 1 }));
    selectionRef.current = { start: pos, end: pos };
  }, []);

  const handleCopyFormatPrompt = useCallback(() => {
    navigator.clipboard.writeText(LLM_FORMAT_INSTRUCTIONS);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, []);

  const handleAttachImages = useCallback(
    async (files: File[], start?: number, end?: number) => {
      if (!onAttachMedia || files.length === 0) return;
      const s = start ?? selectionRef.current?.start;
      const e = end ?? selectionRef.current?.end;
      const nextPos = await onAttachMedia(files, s, e);
      scheduleCursorMove(nextPos);
    },
    [onAttachMedia, scheduleCursorMove],
  );

  const handleInsertSnippet = useCallback(
    (snippet: string) => {
      if (!onInsertMediaSnippet) return;
      const nextPos = onInsertMediaSnippet(snippet, selectionRef.current?.start, selectionRef.current?.end);
      scheduleCursorMove(nextPos);
    },
    [onInsertMediaSnippet, scheduleCursorMove],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const imageFiles = acceptedFiles.filter((f) => isSupportedImageFile(f));
      const textFiles = acceptedFiles.filter((f) => !isSupportedImageFile(f));

      if (imageFiles.length > 0) {
        void handleAttachImages(imageFiles);
      }

      if (textFiles.length > 0) {
        const file = textFiles[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          if (text) {
            onChange(text);
            if (onFileLoaded) onFileLoaded(text, file.name);
          }
        };
        reader.readAsText(file);
      }
    },
    [onChange, onFileLoaded, handleAttachImages]
  );

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      "application/json": [".json"],
      "text/plain": [".txt", ".md"],
      ...SUPPORTED_IMAGE_ACCEPT,
    },
  });

  const charCount = value.length;
  const lineCount = value.includes("\n") ? value.split("\n").length : value.trim() ? 1 : 0;

  return (
    <div
      className="flex flex-col rounded-lg border border-[#E5E7EB] bg-white shadow-xs min-h-0 relative overflow-hidden h-full"
      {...getRootProps()}
    >
      <input {...getInputProps()} className="hidden" />

      {/* Drag & Drop Overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/90 backdrop-blur-xs border-2 border-primary border-dashed m-2 rounded-lg">
          <Upload className="w-10 h-10 text-primary mb-2 animate-bounce" />
          <p className="text-base font-semibold text-primary">Drop Markdown, JSON, or images</p>
          <p className="text-xs text-muted-foreground mt-1">Accepts .md, .txt, .json, or .png / .jpg / .webp / .gif</p>
        </div>
      )}

      {/* Panel Header - Exact h-11 (44px) matching Deck Preview */}
      <div className="bg-muted/40 px-2.5 sm:px-3.5 h-11 border-b border-[#E5E7EB] flex items-center justify-between shrink-0 gap-2">
        {/* Left: Source Notes label + Format dropdown with docked Rules button */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <FileText className="w-4 h-4 text-primary/80 shrink-0" />
            <span className="text-xs font-semibold text-foreground/90 hidden xs:inline">
              Source Notes
            </span>
          </div>

          {/* Docked Format Selector + Rules Action Group with divider */}
          <div className="flex items-center bg-background/90 border border-border/80 rounded-md shadow-2xs h-7 overflow-hidden">
            <div className="flex items-center gap-1 px-1.5 sm:px-2 border-r border-border/60 text-xs h-full">
              <span className="text-muted-foreground font-medium text-[11px] mr-1 hidden md:inline">Format:</span>
              <select
                value={parserRule}
                onChange={(e) => {
                  const val = e.target.value as ParserRuleId;
                  onParserRuleChange(val);
                  if (val === "custom") {
                    onOpenParserSettings();
                  }
                }}
                className="bg-transparent font-medium text-foreground focus:outline-hidden cursor-pointer py-0.5 text-xs max-w-[100px] xs:max-w-none"
                title="Select markdown / flashcard input format"
              >
                <option value="auto" className="bg-popover text-popover-foreground">
                  Auto-Detect
                </option>
                <option value="generic" className="bg-popover text-popover-foreground">
                  Generic (Q: / A:)
                </option>
                <option value="headings" className="bg-popover text-popover-foreground">
                  Headings (###)
                </option>
                <option value="bold-italic" className="bg-popover text-popover-foreground">
                  Bold (**)
                </option>
                <option value="custom" className="bg-popover text-popover-foreground">
                  Custom...
                </option>
              </select>
            </div>

            {/* Rules Button docked directly to Format */}
            <button
              type="button"
              onClick={onOpenParserSettings}
              className="px-1.5 sm:px-2 h-full flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-muted/80 transition-colors cursor-pointer"
              title="Open Parser & Delimiter Settings (Ctrl+M)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] hidden md:inline">Rules</span>
              {hasCustomRules && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Custom rules active" />
              )}
            </button>
          </div>
        </div>

        {/* Right: Secondary file actions Prompt, Sample, Import, and Clear */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 relative">
          {/* Format Instructions Button for LLM */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyFormatPrompt}
            className="h-7 text-xs px-1.5 sm:px-2 gap-1 text-muted-foreground hover:text-foreground font-medium"
            title="Copy LLM Format Instructions to clipboard (includes Q&A and Custom Fields)"
          >
            {copiedPrompt ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden lg:inline text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <FileCode2 className="w-3.5 h-3.5 text-primary/70" />
                <span className="hidden lg:inline">Format Prompt</span>
              </>
            )}
          </Button>

          {/* Sample Preset Dropdown */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSampleMenuOpen((prev) => !prev)}
              className="h-7 text-xs px-1.5 sm:px-2 gap-1 text-muted-foreground hover:text-foreground font-medium"
              title="Load sample flashcard template"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Sample</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>

            {sampleMenuOpen && (
              <div
                className="absolute right-0 mt-1 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-lg ring-1 ring-black/5 z-40 animate-in fade-in-50 zoom-in-95"
                onMouseLeave={() => setSampleMenuOpen(false)}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Preset Templates
                </div>
                {WORKSPACE_SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      onLoadSample(sample.id);
                      setSampleMenuOpen(false);
                    }}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted transition-colors flex flex-col gap-0.5 cursor-pointer"
                  >
                    <span className="font-medium text-foreground">{sample.label}</span>
                    <span className="text-[10px] text-muted-foreground">{sample.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={openFileDialog}
            className="h-7 text-xs px-1.5 sm:px-2 gap-1 text-muted-foreground hover:text-foreground font-medium"
            title="Import file from disk (.md, .txt, .json)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Import</span>
          </Button>

          {/* Clear Button */}
          {value.trim().length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-7 text-xs px-1.5 text-destructive/80 hover:text-destructive hover:bg-destructive/10 font-medium"
              title="Clear text"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Textarea Editor with KaTeX / Syntax Highlighting */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        <SyntaxEditor
          value={value}
          onChange={onChange}
          markerPatterns={markerPatterns}
          parserRule={parserRule}
          onImagePaste={(files, start, end) => {
            void handleAttachImages(files, start, end);
          }}
          cursorRequest={cursorRequest}
          onSelectionChange={(start, end) => {
            selectionRef.current = { start, end };
          }}
          placeholder={`Paste notes, textbook markdown, or JSON cards here...

Example:
### Question
What is the halting problem?
### Answer
It is the problem of determining whether a program will finish running or run forever.
### Custom Field
This will be its own field in anki.

Tip: Paste screenshots directly (Ctrl/Cmd+V) or drop .md, .json, or image files here.`}
          disabled={isProcessing}
          className="flex-1 min-h-0 !rounded-none"
        />
      </div>

      {/* Collapsible Attached Media Subsection (auto-opens when media exists) */}
      {(mediaItems.length > 0 || missingMediaFilenames.length > 0) && onRemoveMedia && (
        <WorkspaceMediaTray
          items={mediaItems}
          draftFilenames={draftMediaFilenames}
          batchFilenames={batchMediaFilenames}
          missingFilenames={missingMediaFilenames}
          onInsertReference={onInsertMediaSnippet ? handleInsertSnippet : undefined}
          onRemoveItem={onRemoveMedia}
        />
      )}

      {/* Editor Footer Status & Save-to-Deck CTA */}
      <div className="p-2 sm:p-2.5 border-t border-[#E5E7EB] bg-muted/20 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground font-mono">
          <span>{charCount} chars</span>
          <span>•</span>
          <span>{lineCount} lines</span>
        </div>

        <div className="flex items-center gap-2">
          {detectedCardCount > 0 ? (
            <>
              {onViewPreview ? (
                <button
                  type="button"
                  onClick={onViewPreview}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium pr-1 cursor-pointer group transition-colors"
                  title="Click to view parsed cards in Deck Preview"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="group-hover:underline">
                    {detectedCardCount} {detectedCardCount === 1 ? "card" : "cards"} parsed
                  </span>
                  <span className="lg:hidden text-[10px] text-primary font-bold ml-0.5">→</span>
                </button>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium pr-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{detectedCardCount} {detectedCardCount === 1 ? "card" : "cards"} parsed</span>
                </span>
              )}

              {onViewPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewPreview}
                  className="lg:hidden h-8 gap-1 px-2 text-xs font-medium border-border/80 text-foreground shadow-2xs hover:bg-muted"
                  title="Switch to Deck Preview tab"
                >
                  <span>Preview</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              )}

              <Button
                size="sm"
                onClick={onAddToDeck}
                className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                title="Save parsed cards as a batch to your deck (Ctrl+Enter)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save to Deck</span>
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-primary-foreground/20 text-[10px] font-mono leading-none">
                  Ctrl+Enter
                </kbd>
              </Button>
            </>
          ) : value.trim() ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenParserSettings}
              className="h-8 gap-1.5 text-xs font-medium border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>0 cards detected • Adjust Rules</span>
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Paste notes or drop .md/.json above</span>
              <span className="text-muted-foreground/30 hidden sm:inline">•</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) onChange(text);
                  } catch {
                    // fallback if permission denied
                  }
                }}
                className="hidden sm:inline font-medium text-zinc-600 hover:text-zinc-950 underline underline-offset-2 transition-colors cursor-pointer"
                title="Paste from clipboard"
              >
                Paste from clipboard
              </button>
              <span className="text-muted-foreground/30 hidden sm:inline">•</span>
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => setSampleMenuOpen((prev) => !prev)}
                  className="hidden sm:inline font-medium text-zinc-600 hover:text-zinc-950 underline underline-offset-2 transition-colors cursor-pointer"
                  title="Choose sample template"
                >
                  Load sample
                </button>
                {sampleMenuOpen && (
                  <div
                    className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-0 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-lg ring-1 ring-black/5 z-40 animate-in fade-in-50 zoom-in-95"
                    onMouseLeave={() => setSampleMenuOpen(false)}
                  >
                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Preset Templates
                    </div>
                    {WORKSPACE_SAMPLES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          onLoadSample(sample.id);
                          setSampleMenuOpen(false);
                        }}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted transition-colors flex flex-col gap-0.5 cursor-pointer"
                      >
                        <span className="font-medium text-foreground">{sample.label}</span>
                        <span className="text-[10px] text-muted-foreground">{sample.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
