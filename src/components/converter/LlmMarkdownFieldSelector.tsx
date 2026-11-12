import { AlertCircle, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  LlmMarkdownField,
  LlmMarkdownFieldSelection,
  LlmMergeCapability,
} from "@/services/llmMarkdown";

interface FieldOptionMeta {
  key: LlmMarkdownField;
  label: string;
  token: string;
  description: string;
}

const FIELD_OPTIONS: readonly FieldOptionMeta[] = [
  {
    key: "id",
    label: "ID",
    token: "### ID",
    description: "Anki Note ID header (### DeckId:NoteId). Required to match edited cards back during Merge.",
  },
  {
    key: "question",
    label: "Question",
    token: "Q:",
    description: "Front side of the flashcard (Question or Prompt).",
  },
  {
    key: "answer",
    label: "Answer",
    token: "A:",
    description: "Back side of the flashcard (Answer or Solution).",
  },
];

const CAPABILITY_BADGE_MAP = {
  full: {
    label: "Full Merge",
    className: "text-emerald-800 bg-emerald-50 border-emerald-200",
  },
  partial: {
    label: "Partial Merge",
    className: "text-amber-800 bg-amber-50 border-amber-200",
  },
  impossible: {
    label: "Merge Unavailable",
    className: "text-destructive bg-destructive/10 border-destructive/30",
  },
} as const;

interface LlmMarkdownFieldSelectorProps {
  selection: LlmMarkdownFieldSelection;
  capability: LlmMergeCapability;
  onToggleField: (field: LlmMarkdownField) => void;
  onSelectAll: () => void;
}

export function LlmMarkdownFieldSelector({
  selection,
  capability,
  onToggleField,
  onSelectAll,
}: LlmMarkdownFieldSelectorProps) {
  const allSelected = selection.id && selection.question && selection.answer;
  const badgeConfig = CAPABILITY_BADGE_MAP[capability.status];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 transition-all">
      <div className="flex items-center justify-between gap-2 border-b pb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            LLM-MD Export Fields
          </label>
          <Badge variant="outline" className={`text-[10px] py-0.5 ${badgeConfig.className}`}>
            {capability.status === "full" && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {capability.status === "partial" && <AlertTriangle className="w-3 h-3 mr-1" />}
            {capability.status === "impossible" && <AlertCircle className="w-3 h-3 mr-1" />}
            {badgeConfig.label}
          </Badge>
        </div>

        {!allSelected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Select All
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Choose which card fields are exported to Markdown. Deselecting fields restricts or disables merging edits back into your .apkg.
      </p>

      <div className="flex flex-wrap gap-2 pt-0.5" role="group" aria-label="LLM-MD Export Fields">
        {FIELD_OPTIONS.map((field) => {
          const isSelected = selection[field.key];
          return (
            <Tooltip key={field.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onToggleField(field.key)}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    isSelected
                      ? "bg-zinc-900 text-zinc-50 border-zinc-900 shadow-xs"
                      : "bg-background hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <span>{field.label}</span>
                  <code
                    className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                      isSelected ? "bg-zinc-800 text-zinc-200" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {field.token}
                  </code>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-xs">
                {field.description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {capability.status !== "full" && (
        <div
          role="alert"
          className={`rounded-md border px-3 py-2.5 text-xs leading-relaxed flex items-start gap-2.5 ${
            capability.status === "partial"
              ? "border-amber-300 bg-amber-50/80 text-amber-900"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {capability.status === "partial" ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
          )}
          <div className="space-y-0.5">
            <strong className="font-semibold block">{capability.title}</strong>
            <p className="opacity-95">{capability.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
