import React, { useState } from "react";
import {
  Layers,
  LayoutList,
  FlipHorizontal,
  Search,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KaTeXRenderer } from "@/components/flashcard/KaTeXPreview";
import FlashcardItem from "@/components/flashcard/FlashcardItem";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { FlashCard } from "@/converters/types";
import type { Flashcard } from "@/data/decks";
import type { DiagnosticIssue } from "@/services/deckParser/types";
import type { BuilderBatch } from "@/hooks/useDeckWorkspace";
import { CARD_TEMPLATES, type CardTemplateId } from "@/converters/templates";
import { WorkspaceMediaProvider } from "@/components/workspace/WorkspaceMediaContext";

interface WorkspacePreviewPanelProps {
  batches: BuilderBatch[];
  draftCards: FlashCard[];
  selectedTemplate: CardTemplateId;
  onTemplateChange: (t: CardTemplateId) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: "list" | "flip";
  onViewModeChange: (mode: "list" | "flip") => void;
  onDeleteBatch: (batchId: string) => void;
  onDeleteCardFromBatch: (batchId: string, cardIndex: number) => void;
  onDeleteDraftCard: (cardIndex: number) => void;
  onClearDeck: () => void;
  onSaveDraftToDeck: () => void;
  onLoadSample: (sampleId: string) => void;
  onOpenParserSettings: () => void;
  onOpenCardSettings?: () => void;
  extractTopicBadges?: boolean;
  onBackToSource?: () => void;
  diagnostics: DiagnosticIssue[];
  mediaUrlMap?: Record<string, string>;
}

export function WorkspacePreviewPanel({
  batches,
  draftCards,
  selectedTemplate,
  onTemplateChange,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onDeleteBatch,
  onDeleteCardFromBatch,
  onDeleteDraftCard,
  onClearDeck,
  onSaveDraftToDeck,
  onLoadSample,
  onOpenParserSettings,
  onOpenCardSettings,
  extractTopicBadges = true,
  onBackToSource,
  diagnostics,
  mediaUrlMap = {},
}: WorkspacePreviewPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auto-collapse behavior: batches start collapsed when added (empty set)
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());

  // Auto-expand batches matching search query when actively filtering
  const isBatchExpanded = (batchId: string) => {
    if (searchQuery.trim().length > 0) return true;
    return expandedBatchIds.has(batchId);
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const allBatchesExpanded = batches.length > 0 && expandedBatchIds.size === batches.length;

  const toggleExpandAll = () => {
    if (allBatchesExpanded) {
      setExpandedBatchIds(new Set());
    } else {
      setExpandedBatchIds(new Set(batches.map((b) => b.id)));
    }
  };

  const handleCopy = (card: FlashCard, key: string) => {
    let text = `Q: ${card.front}\n\nA: ${card.back}`;
    if (card.customFields && Object.keys(card.customFields).length > 0) {
      for (const [k, v] of Object.entries(card.customFields)) {
        text += `\n\n${k}:\n${v}`;
      }
    }
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const totalDeckCards = batches.reduce((sum, b) => sum + b.cards.length, 0);
  const totalCards = batches.length > 0 ? totalDeckCards : draftCards.length;

  // Flattened cards for Flip carousel or global filtering
  const allCards: FlashCard[] =
    batches.length > 0 ? batches.flatMap((b) => b.cards) : draftCards;

  const filteredCards = searchQuery.trim()
    ? allCards.filter((c) => {
        const q = searchQuery.toLowerCase();
        const customText = c.customFields
          ? Object.values(c.customFields).join(" ").toLowerCase()
          : "";
        return (
          c.front.toLowerCase().includes(q) ||
          c.back.toLowerCase().includes(q) ||
          customText.includes(q)
        );
      })
    : allCards;

  const warnings = diagnostics.filter((d) => d.level === "warning" || d.level === "error");

  return (
    <WorkspaceMediaProvider urlMap={mediaUrlMap}>
      <div className="flex flex-col rounded-lg border border-[#E5E7EB] bg-white shadow-xs min-h-0 overflow-hidden h-full">
      {/* Panel Header - Exact h-11 (44px) matching Source Notes */}
      <div className="bg-muted/40 px-2.5 sm:px-3.5 h-11 border-b border-[#E5E7EB] flex items-center justify-between shrink-0 gap-2">
        {/* Left: Deck Preview label (plus optional Back to Notes button on narrow viewports) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onBackToSource && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToSource}
              className="lg:hidden h-7 px-1.5 sm:px-2 text-xs text-muted-foreground hover:text-foreground font-medium gap-1"
              title="Return to Source Notes editor"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Notes</span>
            </Button>
          )}
          <Layers className="w-4 h-4 text-primary/80 shrink-0" />
          <span className="text-xs font-semibold text-foreground/90 shrink-0">
            Deck Preview
          </span>
        </div>

        {/* Right: Docked Template Picker & Card Settings + Segmented View Control [List | Flip] + Isolated Clear Deck */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Docked Template Selector + Card Settings Action Group */}
          <div className="flex items-center bg-background/90 border border-border/80 rounded-md shadow-2xs h-7 overflow-hidden">
            <div className="flex items-center gap-1 px-1.5 sm:px-2 border-r border-border/60 text-xs h-full">
              <span className="text-muted-foreground font-medium text-[11px] hidden md:inline">Template:</span>
              <select
                value={selectedTemplate}
                onChange={(e) => onTemplateChange(e.target.value as CardTemplateId)}
                className="bg-transparent font-medium text-foreground focus:outline-hidden cursor-pointer py-0.5 text-xs max-w-[100px] xs:max-w-[130px] sm:max-w-[180px] md:max-w-none"
                title="Select visual card styling template"
              >
                {(Object.keys(CARD_TEMPLATES) as CardTemplateId[]).map((tId) => (
                  <option key={tId} value={tId} className="bg-popover text-popover-foreground">
                    {CARD_TEMPLATES[tId].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Card Settings Button docked directly to Template */}
            {onOpenCardSettings && (
              <button
                type="button"
                onClick={onOpenCardSettings}
                className="px-1.5 sm:px-2 h-full flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-muted/80 transition-colors cursor-pointer"
                title="Configure card fields, topic badges, and Anki display"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] hidden md:inline">Card Settings</span>
                {extractTopicBadges && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Topic badges active" />
                )}
              </button>
            )}
          </div>

          {/* Segmented Control Pill: [List | Flip] */}
          {totalCards > 0 && (
            <div className="flex items-center bg-muted/80 p-0.5 rounded-lg border border-border/70 h-7 shrink-0">
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                className={`flex items-center gap-1 px-2 sm:px-2.5 h-6 rounded-md text-xs transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-background text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="List view"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("flip")}
                className={`flex items-center gap-1 px-2 sm:px-2.5 h-6 rounded-md text-xs transition-all cursor-pointer ${
                  viewMode === "flip"
                    ? "bg-background text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Interactive flip test view"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Flip</span>
              </button>
            </div>
          )}

          {/* Isolated Destructive Action: Clear Deck Icon Button */}
          {batches.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm("Clear all batches from this deck?")) {
                  onClearDeck();
                }
              }}
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              title="Clear all batches in deck"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search / Filter Bar */}
      {totalCards > 2 && viewMode === "list" && (
        <div className="px-3 py-1.5 border-b border-border/50 bg-background/50 flex items-center gap-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter cards by question or answer..."
            className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              {filteredCards.length} of {totalCards}
            </span>
          )}
        </div>
      )}

      {/* Warnings Banner */}
      {warnings.length > 0 && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{warnings[0].message}</span>
          </div>
          <button
            onClick={onOpenParserSettings}
            className="underline text-[11px] font-semibold hover:opacity-80 shrink-0 cursor-pointer"
          >
            Fix in Rules
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative">
        {totalCards === 0 ? (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/70 flex items-center justify-center mb-4 text-muted-foreground border border-border/60">
              <Layers className="w-7 h-7 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Live Preview Awaiting Input
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
              Paste your markdown notes or JSON on the left. Your cards will render here in real-time with math formulas and syntax highlighting.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadSample("stem-latex")}
                className="text-xs gap-1.5 h-9 bg-background shadow-2xs font-medium"
              >
                <span>Try Math Sample</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLoadSample("cs-qa")}
                className="text-xs gap-1.5 h-9 bg-background shadow-2xs font-medium"
              >
                <span>Try Q&A Sample</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ) : viewMode === "flip" ? (
          /* Interactive Flip Carousel */
          <div className="h-full p-4 flex flex-col items-center justify-center">
            <Carousel className="w-full max-w-lg">
              <CarouselContent>
                {filteredCards.map((c, i) => {
                  const flashcard: Flashcard = {
                    id: String(c.id || i),
                    front: c.front,
                    back: c.back,
                    customFields: c.customFields,
                  };
                  return (
                    <CarouselItem key={c.id || i}>
                      <div className="p-2">
                        <FlashcardItem
                          card={flashcard}
                          index={i}
                          total={filteredCards.length}
                        />
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <div className="flex items-center justify-between mt-3 px-2">
                <CarouselPrevious className="static translate-y-0 h-8 w-8" />
                <span className="text-xs text-muted-foreground font-mono">
                  Use arrows to flip through cards
                </span>
                <CarouselNext className="static translate-y-0 h-8 w-8" />
              </div>
            </Carousel>
          </div>
        ) : (
          /* List Mode with Collapsed Saved Batches Stack + Active Working Draft */
          <ScrollArea className="h-full bg-zinc-50/60 dark:bg-zinc-950/40">
            <div className="p-4 space-y-4">
              {/* SECTION 1: Saved Batches Stack (Placed at top, collapsed to save space) */}
              {batches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground/90 text-[11px]">
                        Saved Deck Batches
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-medium py-0.5 px-2 bg-zinc-100 text-zinc-700 border border-zinc-200/80 rounded-full"
                      >
                        {batches.length} {batches.length === 1 ? "Batch" : "Batches"} • {totalDeckCards} {totalDeckCards === 1 ? "Card" : "Cards"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span>
                        {expandedBatchIds.size === 0
                          ? "All collapsed"
                          : `${expandedBatchIds.size} of ${batches.length} expanded`}
                      </span>
                      {batches.length > 1 && (
                        <>
                          <span className="text-zinc-300">•</span>
                          <button
                            type="button"
                            onClick={toggleExpandAll}
                            className="font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
                          >
                            {allBatchesExpanded ? "Collapse All" : "Expand All"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-b border-gray-100 divide-y divide-gray-100">
                    {batches.map((batch, batchIdx) => {
                      const isExpanded = isBatchExpanded(batch.id);
                      const batchCards = batch.cards.filter((c) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        const customText = c.customFields
                          ? Object.values(c.customFields).join(" ").toLowerCase()
                          : "";
                        return (
                          c.front.toLowerCase().includes(q) ||
                          c.back.toLowerCase().includes(q) ||
                          customText.includes(q)
                        );
                      });

                      if (searchQuery.trim() && batchCards.length === 0) return null;

                      return (
                        <div
                          key={batch.id}
                          className="bg-white transition-colors"
                        >
                          {/* Flat Batch Row */}
                          <div
                            onClick={() => toggleBatch(batch.id)}
                            className="px-2.5 py-2 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors select-none group"
                            title="Click to expand/collapse this batch"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-primary shrink-0 transition-transform" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform" />
                              )}
                              <span className="text-xs font-semibold text-foreground truncate">
                                Batch #{batchIdx + 1}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0 px-2 font-medium shrink-0 bg-muted/60 text-muted-foreground rounded-full"
                              >
                                {batch.cards.length} {batch.cards.length === 1 ? "card" : "cards"}
                              </Badge>
                              {batch.name && batch.name !== `Batch ${batchIdx + 1}` && (
                                <span className="text-xs text-muted-foreground truncate hidden md:inline">
                                  ({batch.name})
                                </span>
                              )}
                              {batch.formatLabel && (
                                <span className="hidden sm:inline text-[10px] text-muted-foreground/80 font-mono truncate">
                                  • {batch.formatLabel}
                                </span>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => onDeleteBatch(batch.id)}
                                title={`Delete Batch #${batchIdx + 1}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Cards View */}
                          {isExpanded && (
                            <div className="p-3 bg-zinc-100/40 dark:bg-zinc-900/40 border-t border-border/60 space-y-3">
                              {batchCards.map((card, cardIdx) => (
                                <div
                                  key={card.id || cardIdx}
                                  className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 shadow-2xs space-y-3 transition-all relative group"
                                >
                                {/* Floating Card Actions */}
                                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      handleCopy(card, `${batch.id}-${cardIdx}`)
                                    }
                                    title="Copy card text"
                                  >
                                    {copiedKey === `${batch.id}-${cardIdx}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() =>
                                      onDeleteCardFromBatch(batch.id, cardIdx)
                                    }
                                    title="Delete this card"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>

                                {/* Front (Question) */}
                                <div className="space-y-1.5 pr-14">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block">
                                      Front
                                    </span>
                                    {card.customFields?.Topic && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                        {card.customFields.Topic}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm font-semibold leading-relaxed text-foreground overflow-hidden">
                                    <KaTeXRenderer text={card.front} />
                                  </div>
                                </div>

                                {/* Back (Answer) */}
                                <div className="pt-2.5 border-t border-border/40 dark:border-border/40 space-y-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80 block">
                                    Back
                                  </span>
                                  <div className="text-sm leading-relaxed text-foreground font-normal overflow-hidden">
                                    <KaTeXRenderer text={card.back} />
                                  </div>
                                </div>

                                {/* Custom / Additional Fields */}
                                {card.customFields && Object.keys(card.customFields).filter((k) => k.toLowerCase() !== "topic").length > 0 && (
                                  <div className="pt-2.5 border-t border-border/40 dark:border-border/40 space-y-1.5">
                                    {Object.entries(card.customFields)
                                      .filter(([fieldName]) => fieldName.toLowerCase() !== "topic")
                                      .map(([fieldName, content]) => (
                                      <div
                                        key={fieldName}
                                        className="text-xs flex items-baseline gap-2"
                                      >
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                          {fieldName}
                                        </span>
                                        <div className="text-foreground/80 leading-relaxed overflow-hidden">
                                          <KaTeXRenderer text={content} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION 2: Active Working Draft */}
              {draftCards.length > 0 ? (
                <div className="space-y-3 pt-1">
                  {/* Clean Working Draft Section Header */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 pt-1 pb-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground/90 text-[11px]">
                        {batches.length > 0
                          ? `Working Draft (Batch #${batches.length + 1})`
                          : "Working Draft"}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-medium py-0.5 px-2 bg-zinc-100 text-zinc-700 border border-zinc-200/80 rounded-full"
                      >
                        {draftCards.length} {draftCards.length === 1 ? "card" : "cards"}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
                      Press Ctrl+Enter to save to batch
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    {draftCards
                      .filter((c) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        const customText = c.customFields
                          ? Object.values(c.customFields).join(" ").toLowerCase()
                          : "";
                        return (
                          c.front.toLowerCase().includes(q) ||
                          c.back.toLowerCase().includes(q) ||
                          customText.includes(q)
                        );
                      })
                      .map((card, idx) => (
                      <div
                        key={card.id || idx}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 shadow-2xs space-y-3 transition-all relative group"
                      >
                        {/* Floating Card Actions */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleCopy(card, `draft-${idx}`)}
                            title="Copy card text"
                          >
                            {copiedKey === `draft-${idx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDeleteDraftCard(idx)}
                            title="Delete this card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Front (Question) */}
                        <div className="space-y-1.5 pr-14">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block">
                              Front
                            </span>
                            {card.customFields?.Topic && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                {card.customFields.Topic}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold leading-relaxed text-foreground overflow-hidden">
                            <KaTeXRenderer text={card.front} />
                          </div>
                        </div>

                        {/* Back (Answer) */}
                        <div className="pt-2.5 border-t border-border/40 dark:border-border/40 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80 block">
                            Back
                          </span>
                          <div className="text-sm leading-relaxed text-foreground font-normal overflow-hidden">
                            <KaTeXRenderer text={card.back} />
                          </div>
                        </div>

                        {/* Custom / Additional Fields */}
                        {card.customFields && Object.keys(card.customFields).filter((k) => k.toLowerCase() !== "topic").length > 0 && (
                          <div className="pt-2.5 border-t border-border/40 dark:border-border/40 space-y-1.5">
                            {Object.entries(card.customFields)
                              .filter(([fieldName]) => fieldName.toLowerCase() !== "topic")
                              .map(([fieldName, content]) => (
                              <div
                                key={fieldName}
                                className="text-xs flex items-baseline gap-2"
                              >
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                                  {fieldName}
                                </span>
                                <div className="text-foreground/80 leading-relaxed overflow-hidden">
                                  <KaTeXRenderer text={content} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>
      </div>
    </WorkspaceMediaProvider>
  );
}
