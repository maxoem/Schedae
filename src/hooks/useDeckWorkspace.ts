import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { FlashCard } from "@/converters/types";
import { type CardTemplateId } from "@/converters/templates";
import {
  type SplitSettings,
  PREDEFINED_EXTRACTION_SETS,
  DEFAULT_SPLIT_SETTINGS,
  buildHighlightPatterns,
  type HighlightMarkerPattern,
} from "@/components/flashcard/SplitSettingsDialog";
import { DeckParserService } from "@/services/deckParser/deckParserService";
import type { DeckParseResult } from "@/services/deckParser/types";
import { WORKSPACE_SAMPLES } from "@/services/deckParser/sampleData";
import type { Stencil } from "@/lib/extraction/types";
import { createApkg } from "@/converters/jsonToApkg";

export type AiModelPresetId = "auto" | "gemini" | "chatgpt" | "claude";
export type ParserRuleId = "auto" | "generic" | "headings" | "bold-italic" | "custom";

export interface BuilderBatch {
  id: string;
  timestamp: number;
  name: string;
  cards: FlashCard[];
  sourceSnippet?: string;
  formatLabel?: string;
}

const STORAGE_KEYS = {
  SOURCE_TEXT: "schedae-workspace-source-text",
  DECK_NAME: "schedae-workspace-deck-name",
  SPLIT_SETTINGS: "schedae-workspace-split-settings",
  TEMPLATE: "schedae-workspace-template",
  MODEL: "schedae-workspace-model",
  VIEW_MODE: "schedae-workspace-view-mode",
  BUILDER_BATCHES: "schedae-workspace-builder-batches",
  PARSER_RULE: "schedae-workspace-parser-rule",
} as const;

export function useDeckWorkspace(aiStencil?: Stencil | null) {
  // Source Notes raw text (persists in localStorage)
  const [sourceText, setSourceText] = useState<string>(() => {
    return (
      localStorage.getItem(STORAGE_KEYS.SOURCE_TEXT) ||
      localStorage.getItem("json-apkg-builder-input") ||
      ""
    );
  });

  // Batches accumulated in the deck (persists in localStorage)
  const [batches, setBatches] = useState<BuilderBatch[]>(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEYS.BUILDER_BATCHES) ||
        localStorage.getItem("json-apkg-builder-batches");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [deckName, setDeckName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DECK_NAME) || "My Study Deck";
  });

  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplateId>(() => {
    return (localStorage.getItem(STORAGE_KEYS.TEMPLATE) as CardTemplateId) || "markdown_basic";
  });

  const [selectedModel, setSelectedModel] = useState<AiModelPresetId>(() => {
    return (localStorage.getItem(STORAGE_KEYS.MODEL) as AiModelPresetId) || "auto";
  });

  // Explicit parser format rule
  const [parserRule, setParserRuleState] = useState<ParserRuleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PARSER_RULE);
    if (saved === "auto" || saved === "headings" || saved === "bold-italic" || saved === "generic" || saved === "custom") {
      return saved;
    }
    return "auto";
  });

  const [parserMode, setParserMode] = useState<"regex" | "heuristic">("regex");
  const [validateJson, setValidateJson] = useState(true);
  const [extractTopicBadges, setExtractTopicBadgesState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("schedae_extract_topic_badges");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const setExtractTopicBadges = useCallback((enabled: boolean) => {
    setExtractTopicBadgesState(enabled);
    try {
      localStorage.setItem("schedae_extract_topic_badges", JSON.stringify(enabled));
    } catch {
      // ignore
    }
  }, []);

  const [deckCss, setDeckCss] = useState<string>("");

  const [splitSettings, setSplitSettingsState] = useState<SplitSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SPLIT_SETTINGS);
      if (saved) return JSON.parse(saved);
      const rule = localStorage.getItem(STORAGE_KEYS.PARSER_RULE);
      if (rule === "headings") return PREDEFINED_EXTRACTION_SETS[0];
      if (rule === "bold-italic") return PREDEFINED_EXTRACTION_SETS[1];
      return PREDEFINED_EXTRACTION_SETS[2];
    } catch {
      return DEFAULT_SPLIT_SETTINGS;
    }
  });

  const [previewViewMode, setPreviewViewMode] = useState<"list" | "flip">(() => {
    return (localStorage.getItem(STORAGE_KEYS.VIEW_MODE) as "list" | "flip") || "list";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Parse result for the current sourceText draft
  const [draftParseResult, setDraftParseResult] = useState<DeckParseResult>(() =>
    DeckParserService.parse(sourceText, {
      strictJson: validateJson,
      splitSettings,
      aiStencil,
      normalizeModel: selectedModel,
      parserMode,
      extractTopicBadges,
    })
  );

  const [draftCards, setDraftCards] = useState<FlashCard[]>(draftParseResult.cards);

  // Debounced auto-parsing of draft sourceText
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const res = DeckParserService.parse(sourceText, {
        strictJson: validateJson,
        splitSettings,
        aiStencil,
        normalizeModel: selectedModel,
        parserMode,
        extractTopicBadges,
      });

      setDraftParseResult(res);
      setDraftCards(res.cards);

      if (res.deckTitle && deckName === "My Study Deck") {
        setDeckName(res.deckTitle);
      }
      if (res.deckStyle) {
        setDeckCss(res.deckStyle);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [sourceText, validateJson, splitSettings, aiStencil, selectedModel, parserMode, deckName, extractTopicBadges]);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SOURCE_TEXT, sourceText);
  }, [sourceText]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BUILDER_BATCHES, JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DECK_NAME, deckName);
  }, [deckName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SPLIT_SETTINGS, JSON.stringify(splitSettings));
  }, [splitSettings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEMPLATE, selectedTemplate);
  }, [selectedTemplate]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MODEL, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, previewViewMode);
  }, [previewViewMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PARSER_RULE, parserRule);
  }, [parserRule]);

  // Explicit parser format selection
  const setParserRule = useCallback((rule: ParserRuleId) => {
    setParserRuleState(rule);
    if (rule === "headings") {
      setSplitSettingsState(PREDEFINED_EXTRACTION_SETS[0]);
    } else if (rule === "bold-italic") {
      setSplitSettingsState(PREDEFINED_EXTRACTION_SETS[1]);
    } else if (rule === "generic") {
      setSplitSettingsState(PREDEFINED_EXTRACTION_SETS[2]);
    } else if (rule === "custom") {
      setSplitSettingsState((prev) => ({ ...prev, id: "custom", name: "Custom" }));
    }
  }, []);

  const setSplitSettings = useCallback((settings: SplitSettings) => {
    setSplitSettingsState(settings);
    const match = PREDEFINED_EXTRACTION_SETS.find((s) => s.id === settings.id);
    if (match) {
      setParserRuleState(match.id as ParserRuleId);
    } else {
      setParserRuleState("custom");
    }
  }, []);

  // Accumulated cards from all batches
  const deckCards = useMemo(() => {
    return batches.flatMap((b) => b.cards);
  }, [batches]);

  // Active cards: includes both saved deck batches and any uncommitted draft cards
  const activeCards = useMemo(() => {
    return batches.length > 0 ? [...deckCards, ...draftCards] : draftCards;
  }, [batches.length, deckCards, draftCards]);

  const totalCardCount = deckCards.length + draftCards.length;

  // Filtered cards based on search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return activeCards;
    const q = searchQuery.toLowerCase();
    return activeCards.filter(
      (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
    );
  }, [activeCards, searchQuery]);

  // Custom field names dynamically collected from draft cards for syntax highlighting
  const customFieldNames = useMemo(() => {
    const fields = new Set<string>();
    draftCards.forEach((c) => {
      if (c.customFields) {
        Object.keys(c.customFields).forEach((k) => fields.add(k));
      }
    });
    return Array.from(fields);
  }, [draftCards]);

  // Highlights for SyntaxEditor (including custom fields)
  const highlightPatterns = useMemo<HighlightMarkerPattern[]>(
    () => buildHighlightPatterns(splitSettings, customFieldNames),
    [splitSettings, customFieldNames]
  );

  // Batch management: Add current sourceText as a new batch and clear editor
  const addCurrentAsBatch = useCallback(() => {
    if (draftCards.length === 0) return null;
    const newBatch: BuilderBatch = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      name: `Batch ${batches.length + 1}`,
      cards: [...draftCards],
      sourceSnippet: sourceText.trim().slice(0, 80),
      formatLabel: draftParseResult.detectedFormatLabel,
    };
    setBatches((prev) => [...prev, newBatch]);
    setSourceText(""); // Clears editor so workspace is clean for the next batch
    return newBatch;
  }, [draftCards, batches.length, sourceText, draftParseResult.detectedFormatLabel]);

  // Delete an entire batch
  const deleteBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.id !== batchId));
  }, []);

  // Delete a specific card from a batch
  const deleteCardFromBatch = useCallback((batchId: string, cardIndex: number) => {
    setBatches((prev) =>
      prev
        .map((b) => {
          if (b.id !== batchId) return b;
          return {
            ...b,
            cards: b.cards.filter((_, idx) => idx !== cardIndex),
          };
        })
        .filter((b) => b.cards.length > 0)
    );
  }, []);

  // Rename a batch
  const updateBatchName = useCallback((batchId: string, name: string) => {
    setBatches((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, name } : b))
    );
  }, []);

  // Delete a draft card when no batches yet
  const deleteDraftCard = useCallback((cardIndex: number) => {
    setDraftCards((prev) => prev.filter((_, idx) => idx !== cardIndex));
  }, []);

  // Clear all batches in deck
  const clearDeck = useCallback(() => {
    setBatches([]);
  }, []);

  // Clear source editor text
  const clearSource = useCallback(() => {
    setSourceText("");
    setDraftCards([]);
  }, []);

  // Load sample data into editor
  const loadSample = useCallback((sampleId: string) => {
    const sample = WORKSPACE_SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    setSourceText(sample.content);
    setDeckName(sample.deckTitle);
  }, []);

  // APKG export (exports all saved batch cards plus any active draft cards)
  const exportApkg = useCallback(async () => {
    const cardsToExport = [...deckCards, ...draftCards];
    if (cardsToExport.length === 0) return;
    setIsProcessing(true);
    setExportError(null);
    try {
      const resolvedDeckName = deckName.trim() || "Exported_Deck";
      const blob = await createApkg(cardsToExport, resolvedDeckName, selectedTemplate, deckCss);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resolvedDeckName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.apkg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [deckCards, draftCards, deckName, selectedTemplate, deckCss]);

  return {
    sourceText,
    setSourceText,
    batches,
    draftCards,
    deckCards,
    activeCards,
    totalCardCount,
    deckName,
    setDeckName,
    selectedTemplate,
    setSelectedTemplate,
    selectedModel,
    setSelectedModel,
    parserRule,
    setParserRule,
    parserMode,
    setParserMode,
    validateJson,
    setValidateJson,
    extractTopicBadges,
    setExtractTopicBadges,
    splitSettings,
    setSplitSettings,
    previewViewMode,
    setPreviewViewMode,
    searchQuery,
    setSearchQuery,
    isProcessing,
    exportError,
    setExportError,
    isSheetOpen,
    setIsSheetOpen,
    filteredCards,
    parseResult: draftParseResult,
    highlightPatterns,
    addCurrentAsBatch,
    deleteBatch,
    deleteCardFromBatch,
    updateBatchName,
    deleteDraftCard,
    clearDeck,
    clearSource,
    loadSample,
    exportApkg,
  };
}
