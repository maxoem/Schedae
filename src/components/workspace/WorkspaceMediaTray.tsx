import React, { useState } from "react";
import {
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  CornerDownLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildMarkdownImageSnippet,
  formatBytes,
  formatImageAltLabel,
  type WorkspaceMediaItem,
} from "@/services/mediaStore";

interface WorkspaceMediaTrayProps {
  items: WorkspaceMediaItem[];
  draftFilenames: Set<string>;
  batchFilenames: Set<string>;
  missingFilenames?: string[];
  onInsertReference?: (snippet: string) => void;
  onRemoveItem: (filename: string) => void;
}

export function WorkspaceMediaTray({
  items,
  draftFilenames,
  batchFilenames,
  missingFilenames = [],
  onInsertReference,
  onRemoveItem,
}: WorkspaceMediaTrayProps) {
  const [expanded, setExpanded] = useState(true);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);

  if (items.length === 0 && missingFilenames.length === 0) {
    return null;
  }

  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);

  const handleCopySnippet = async (item: WorkspaceMediaItem) => {
    const snippet = buildMarkdownImageSnippet(
      item.localRef,
      formatImageAltLabel(item.originalName),
    );
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedFilename(item.filename);
      setTimeout(() => setCopiedFilename(null), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="border-t border-[#E5E7EB] bg-zinc-50/80 shrink-0">
      {/* Collapsible Subsection Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-zinc-100/70 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon className="w-3.5 h-3.5 text-primary/80 shrink-0" />
          <span className="text-[11px] font-semibold text-foreground/90">
            Attached Media
          </span>
          <Badge
            variant="secondary"
            className="text-[10px] py-0 px-1.5 bg-white text-zinc-700 border border-zinc-200/80 font-mono"
          >
            {items.length}
          </Badge>
          {totalBytes > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono hidden xs:inline">
              {formatBytes(totalBytes)}
            </span>
          )}
          {missingFilenames.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-800 border border-amber-200/80 gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>{missingFilenames.length} missing</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
          <span className="hidden sm:inline">{expanded ? "Hide" : "Show"}</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {/* Media Items List */}
      {expanded && (
        <div className="border-t border-[#E5E7EB]/80 max-h-40 overflow-y-auto divide-y divide-zinc-200/60 bg-white/70">
          {items.map((item) => {
            const inDraft = draftFilenames.has(item.filename);
            const inBatch = batchFilenames.has(item.filename);
            const snippet = buildMarkdownImageSnippet(
              item.localRef,
              formatImageAltLabel(item.originalName),
            );

            return (
              <div
                key={item.filename}
                className="px-3 py-1.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-md border border-zinc-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={item.objectUrl}
                      alt={item.originalName ?? item.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <code
                        className="text-[11px] font-mono font-medium text-zinc-900 truncate bg-zinc-100 px-1.5 py-0.2 rounded border border-zinc-200/70"
                        title={item.localRef}
                      >
                        {item.localRef}
                      </code>
                      {inDraft && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] py-0 px-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0"
                        >
                          Draft
                        </Badge>
                      )}
                      {inBatch && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] py-0 px-1.5 bg-sky-50 text-sky-700 border border-sky-200/80 shrink-0"
                        >
                          Saved Batch
                        </Badge>
                      )}
                      {!inDraft && !inBatch && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] py-0 px-1.5 bg-zinc-100 text-zinc-500 border border-zinc-200/80 shrink-0"
                        >
                          Unused
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 truncate">
                      {item.originalName && (
                        <span className="truncate max-w-[160px]" title={item.originalName}>
                          {item.originalName}
                        </span>
                      )}
                      {item.originalName && <span>•</span>}
                      <span className="font-mono shrink-0">{formatBytes(item.size)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {onInsertReference && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onInsertReference(snippet)}
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      title="Insert markdown image link at cursor"
                    >
                      <CornerDownLeft className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopySnippet(item)}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Copy markdown image link"
                  >
                    {copiedFilename === item.filename ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveItem(item.filename)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title={
                      inBatch
                        ? "Referenced in a saved batch — remove anyway"
                        : "Remove image from workspace"
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {missingFilenames.length > 0 && (
            <div className="px-3 py-1.5 bg-amber-50/70 text-amber-800 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span className="truncate">
                Referenced media not found in storage: {missingFilenames.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
