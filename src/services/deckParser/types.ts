import type { FlashCard } from "@/converters/types";
import type { SplitSettings } from "@/components/flashcard/SplitSettingsDialog";
import type { Stencil } from "@/lib/extraction/types";
import type { TransformationConfig } from "@/services/deckTransformer/types";

export type DetectedFormat =
  | "json"
  | "markdown-qa"
  | "markdown-headings"
  | "markdown-sections"
  | "bullet-list"
  | "custom-delimiters"
  | "heuristic-stencil"
  | "plain-text"
  | "empty";

export interface DiagnosticIssue {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  cardIndex?: number;
}

export interface ExtractorResult {
  cards: FlashCard[];
  deckTitle?: string;
  deckStyle?: string;
  matchedStrategy: string;
  diagnostics: DiagnosticIssue[];
  usedSettings?: SplitSettings;
}

export interface ExtractorOptions {
  strictJson?: boolean;
  splitSettings?: SplitSettings;
  aiStencil?: Stencil | null;
  normalizeModel?: "auto" | "gemini" | "chatgpt" | "claude";
  parserMode?: "regex" | "heuristic";
  extractorId?: string;
  extractTopicBadges?: boolean;
  transformConfig?: TransformationConfig;
}

export interface ExtractorStrategy {
  readonly id: string;
  readonly label: string;
  canExtract(text: string): boolean;
  extract(text: string, options: ExtractorOptions): ExtractorResult;
}

export interface DeckParseResult {
  success: boolean;
  cards: FlashCard[];
  deckTitle?: string;
  deckStyle?: string;
  detectedFormat: DetectedFormat;
  detectedFormatLabel: string;
  confidence: number;
  diagnostics: DiagnosticIssue[];
  appliedSplitSettings?: SplitSettings;
  usedStrategyId: string;
}
