import { useRef, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ParserRuleId } from "@/hooks/useDeckWorkspace";
import { computeMarkdownHighlights, isJsonInput, PASTEL_PALETTES } from "./markdownHighlighter";

export interface MarkerPattern {
  regex: RegExp;
  className: string;
}

/* ─────────────────────────────────────────────────────────
 *  Fitting, lighter pastel palette for Markdown + Flashcard + KaTeX:
 *  - Questions/Front: Sky pastel (clean focal indicator)
 *  - Answers/Back: Emerald pastel (clear resolution indicator)
 *  - Card Separators: Slate pastel (distinct section division)
 *  - Custom Fields & Headings: Amber / Purple / Rose pastels
 *  - LaTeX Math (inline/display): Teal pastel (classic mathematical syntax)
 *  - Code: Rose / Slate pastels
 * ───────────────────────────────────────────────────────── */

const JSON_PATTERNS: MarkerPattern[] = [
  // JSON key "front" / "question"
  {
    regex: /"(\b(?:front|question|frage|vorderseite)\b)"\s*:/gi,
    className: "text-sky-700 dark:text-sky-300 font-semibold bg-sky-100/50 dark:bg-sky-950/40 rounded-xs",
  },
  // JSON key "back" / "answer"
  {
    regex: /"(\b(?:back|answer|antwort|rückseite)\b)"\s*:/gi,
    className: "text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-100/50 dark:bg-emerald-950/40 rounded-xs",
  },
  // Other JSON string keys
  {
    regex: /"([a-zA-Z0-9_\s-]+)"\s*:/g,
    className: "text-amber-700 dark:text-amber-300 font-semibold bg-amber-100/50 dark:bg-amber-950/40 rounded-xs",
  },
];

const LATEX_PATTERNS: MarkerPattern[] = [
  // Display math $$…$$
  { regex: /\$\$[\s\S]*?\$\$/g, className: "opacity-80" },
  // Display math \[…\]
  { regex: /\\\[[\s\S]*?\\\]/g, className: "opacity-80" },
  // Inline math \(…\)
  { regex: /\\\([^\n]*?\\\)/g, className: "opacity-80" },
  // Inline math $…$ (excluding empty $$ or escaped \$)
  { regex: /(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, className: "opacity-80" },
];

const MARKDOWN_PATTERNS: MarkerPattern[] = [
  // inline code
  { regex: /`([^`\n]+)`/g, className: "bg-black/5 dark:bg-white/10 rounded-xs font-mono" },
  // block code
  { regex: /```[\s\S]*?```/g, className: "bg-black/5 dark:bg-white/10 rounded-xs font-mono" },
  // bold
  { regex: /\*\*(.+?)\*\*/g, className: "text-foreground font-bold" },
  // italic
  { regex: /\*(.+?)\*/g, className: "text-foreground italic" },
];

/* ─────────────────────────────────────────────────────────
 *  Component
 * ───────────────────────────────────────────────────────── */

export interface SyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  markerPatterns?: MarkerPattern[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  parserRule?: ParserRuleId;
  shortcuts?: {
    onCompile?: () => void;
    onExport?: () => void;
  };
  onPasteFromClipboard?: () => void;
  onLoadSample?: () => void;
  onCopyFormatPrompt?: () => void;
  onImagePaste?: (files: File[], selectionStart: number, selectionEnd: number) => void;
  cursorRequest?: { pos: number; seq: number } | null;
  onSelectionChange?: (selectionStart: number, selectionEnd: number) => void;
}

export default function SyntaxEditor({
  value,
  onChange,
  markerPatterns = [],
  placeholder,
  disabled,
  className,
  parserRule,
  shortcuts,
  onPasteFromClipboard,
  onLoadSample,
  onCopyFormatPrompt,
  onImagePaste,
  cursorRequest,
  onSelectionChange,
}: SyntaxEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cursorRequest || !textareaRef.current) return;
    const tx = textareaRef.current;
    tx.focus();
    tx.setSelectionRange(cursorRequest.pos, cursorRequest.pos);
  }, [cursorRequest]);

  // Determine line count: when value is empty, display line numbers for the placeholder lines (minimum 8 lines)
  const placeholderLineCount = useMemo(() => {
    if (!placeholder) return 1;
    return placeholder.split("\n").length;
  }, [placeholder]);

  const lineCount = useMemo(() => {
    if (value.length === 0) return Math.max(placeholderLineCount, 8);
    return value.includes("\n") ? value.split("\n").length : 1;
  }, [value, placeholderLineCount]);

  // Check whether the input should be treated as Markdown vs JSON
  const isMd = useMemo(() => {
    if (parserRule && parserRule !== "auto") return true;
    return !isJsonInput(value);
  }, [parserRule, value]);

  // Fallback patterns for JSON documents
  const jsonAllPatterns = useMemo(
    () => [...markerPatterns, ...JSON_PATTERNS, ...LATEX_PATTERNS, ...MARKDOWN_PATTERNS],
    [markerPatterns],
  );

  const getJsonHighlights = useCallback(
    (text: string) => {
      const runs: Array<{ offset: number; end: number; className: string }> = [];
      for (const p of jsonAllPatterns) {
        const disposable = new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g");
        const matches = [...text.matchAll(disposable)];
        for (const m of matches) {
          if (m[0].length === 0) continue;
          runs.push({ offset: m.index, end: m.index + m[0].length, className: p.className });
        }
      }
      runs.sort((a, b) => a.offset - b.offset || b.end - a.end);
      const kept: typeof runs = [];
      let lastEnd = 0;
      for (const r of runs) {
        if (r.offset >= lastEnd) {
          kept.push(r);
          lastEnd = r.end;
        }
      }
      return kept;
    },
    [jsonAllPatterns],
  );

  // Compute highlight runs: full pastel field segmentation for Markdown,
  // or structural syntax runs for JSON.
  const highlights = useMemo(() => {
    if (!value) return [];
    if (isMd) {
      return computeMarkdownHighlights(value, markerPatterns);
    }
    return getJsonHighlights(value);
  }, [value, isMd, markerPatterns, getJsonHighlights]);

  // Render placeholder with syntax highlighting
  const placeholderNodes = useMemo(() => {
    if (!placeholder) return null;
    const pHighlights = isMd
      ? computeMarkdownHighlights(placeholder, markerPatterns)
      : getJsonHighlights(placeholder);

    if (pHighlights.length === 0) {
      return <span className="opacity-70 select-none">{placeholder}</span>;
    }

    const nodes: React.ReactNode[] = [];
    let last = 0;
    for (const h of pHighlights) {
      if (h.offset > last) {
        nodes.push(
          <span key={`pn-${last}`} className="opacity-70">
            {placeholder.slice(last, h.offset)}
          </span>,
        );
      }
      nodes.push(
        <span key={`ph-${h.offset}`} className={cn(h.className, "opacity-75")}>
          {placeholder.slice(h.offset, h.end)}
        </span>,
      );
      last = h.end;
    }
    if (last < placeholder.length) {
      nodes.push(
        <span key={`pn-${last}`} className="opacity-70">
          {placeholder.slice(last)}
        </span>,
      );
    }
    return <span className="select-none">{nodes}</span>;
  }, [placeholder, isMd, markerPatterns, getJsonHighlights]);

  // scroll sync
  const handleScroll = useCallback(() => {
    const tx = textareaRef.current;
    if (!tx) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = tx.scrollTop;
      overlayRef.current.scrollLeft = tx.scrollLeft;
    }
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = tx.scrollTop;
  }, []);

  // keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        shortcuts?.onCompile?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        shortcuts?.onExport?.();
      }
    },
    [shortcuts],
  );

  // intercept image clipboard pastes cleanly while keeping text paste default
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onImagePaste || !e.clipboardData) return;

      const imageFiles: File[] = [];
      if (e.clipboardData.items && e.clipboardData.items.length > 0) {
        for (const item of Array.from(e.clipboardData.items)) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }
      } else if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        for (const file of Array.from(e.clipboardData.files)) {
          if (file.type.startsWith("image/")) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length === 0) return;

      const plainText = e.clipboardData.getData("text/plain").trim();
      const firstImageName = imageFiles[0]?.name?.trim() ?? "";
      if (!plainText || (firstImageName && plainText === firstImageName)) {
        e.preventDefault();
        const tx = textareaRef.current;
        const start = tx?.selectionStart ?? value.length;
        const end = tx?.selectionEnd ?? value.length;
        onImagePaste(imageFiles, start, end);
      }
    },
    [onImagePaste, value.length],
  );

  const reportSelection = useCallback(() => {
    const tx = textareaRef.current;
    if (!tx || !onSelectionChange) return;
    onSelectionChange(tx.selectionStart ?? value.length, tx.selectionEnd ?? value.length);
  }, [onSelectionChange, value.length]);

  // render overlay with highlighted segments
  const overlayContent = useMemo(() => {
    if (value.length === 0 && placeholder) {
      return placeholderNodes;
    }
    if (highlights.length === 0) return <>{value}</>;

    const nodes: React.ReactNode[] = [];
    let last = 0;
    for (const h of highlights) {
      if (h.offset > last) nodes.push(<span key={`n-${last}`}>{value.slice(last, h.offset)}</span>);
      nodes.push(<span key={`h-${h.offset}`} className={h.className}>{value.slice(h.offset, h.end)}</span>);
      last = h.end;
    }
    if (last < value.length) nodes.push(<span key={`n-${last}`}>{value.slice(last)}</span>);
    return <>{nodes}</>;
  }, [value, highlights, placeholder, placeholderNodes]);

  const handleContainerClick = () => {
    textareaRef.current?.focus();
  };

  return (
    <div
      onClick={handleContainerClick}
      className={cn(
        "flex flex-1 min-h-0 overflow-hidden font-mono text-[13px] bg-white cursor-text relative group",
        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:ring-inset transition-all",
        className,
      )}
    >
      {/* Line numbers gutter: always active, starting at line 1 */}
      <div
        ref={lineNumbersRef}
        className="w-11 shrink-0 overflow-hidden bg-muted/20 border-r border-border/40 select-none text-right pr-2 pt-[11px] font-mono text-[11px]"
      >
        {Array.from({ length: Math.min(lineCount, 500) }, (_, i) => (
          <div
            key={i}
            className={cn(
              "leading-[21px] tabular-nums",
              value.length === 0 ? "text-muted-foreground/25" : "text-muted-foreground/45",
            )}
          >
            {i + 1}
          </div>
        ))}
        {lineCount > 500 && <div className="text-muted-foreground/30 leading-[21px]">…</div>}
      </div>

      {/* Editor area */}
      <div className="flex-1 min-w-0 relative">
        {/* Highlight & Syntax Overlay */}
        <div ref={overlayRef} className="absolute inset-0 overflow-hidden pointer-events-none px-3 py-[11px]">
          <pre className="m-0 whitespace-pre-wrap leading-[21px] w-full overflow-wrap-anywhere">{overlayContent}</pre>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onSelectionChange?.(e.target.selectionStart ?? e.target.value.length, e.target.selectionEnd ?? e.target.value.length);
          }}
          onSelect={reportSelection}
          onClick={reportSelection}
          onKeyUp={reportSelection}
          onPaste={handlePaste}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          spellCheck={false}
          className={cn(
            "absolute inset-0 w-full h-full p-3 bg-transparent resize-none outline-none border-0 leading-[21px]",
            "text-transparent caret-primary selection:bg-blue-500/30 dark:selection:bg-blue-400/40 selection:text-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "overflow-auto scrollbar-thin",
          )}
          style={{ fontSize: 13, fontFamily: "inherit" }}
        />
      </div>
    </div>
  );
}
