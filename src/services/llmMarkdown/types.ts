export type LlmMarkdownField = "id" | "question" | "answer";

export interface LlmMarkdownFieldSelection {
  id: boolean;
  question: boolean;
  answer: boolean;
}

export const DEFAULT_LLM_MARKDOWN_FIELDS: LlmMarkdownFieldSelection = {
  id: true,
  question: true,
  answer: true,
};

export type LlmMergeCapabilityStatus = "full" | "partial" | "impossible";

export type LlmMergeSupportedOperation = "question" | "answer" | "delete";

export interface LlmMergeCapability {
  status: LlmMergeCapabilityStatus;
  canMerge: boolean;
  canOpenMergeAssistant: boolean;
  title: string;
  message: string;
  missingFields: LlmMarkdownField[];
  supportedOperations: LlmMergeSupportedOperation[];
}

export interface LlmNoteInput {
  id?: string | number;
  front?: string;
  back?: string;
  flds?: string;
  [key: string]: unknown;
}

export interface LlmDeckInput {
  notes?: LlmNoteInput[];
  [key: string]: unknown;
}

export interface LlmRawDeckPayload {
  notes?: LlmNoteInput[];
  decks?: {
    byId?: Record<string, LlmDeckInput>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface LlmMarkdownUpdate {
  action: "update" | "delete";
  front?: string;
  back?: string;
}

export interface LlmMarkdownParseResult {
  updates: Map<string, LlmMarkdownUpdate>;
  blocksTotal: number;
  blocksMissingId: number;
  blocksInvalid: number;
}

export interface LlmMergeStats {
  updated: number;
  partialUpdated: number;
  deleted: number;
  unmodified: number;
  blocksMissingId: number;
}

export interface LlmMergeResult<T = unknown> {
  mergedJson: T;
  stats: LlmMergeStats;
}
