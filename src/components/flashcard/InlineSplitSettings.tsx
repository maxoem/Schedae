import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RefreshCw, Sparkles, Plus, Heading, MessageSquare, MessageCircle, X } from "lucide-react";

import type { SplitSettings } from "./SplitSettingsDialog";
import {
  PREDEFINED_EXTRACTION_SETS,
  DEFAULT_SPLIT_SETTINGS,
  extractFlashcardsFromText,
} from "./SplitSettingsDialog";

/* ─────────────────────────────────────────────────────────
 *  InlineSplitSettings — direct, uncollapsed parser rules panel.
 *  Displays all rules directly without dropdowns or nested accordions.
 * ───────────────────────────────────────────────────────── */

/* ── Tag type ───────────────────────────────────────────── */

interface TagItem {
  id: string;
  text: string;
}

const makeId = (): string =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ── Tag chip row ───────────────────────────────────────── */

interface TagChipRowProps {
  label: string;
  icon: React.ReactNode;
  description: string;
  tags: TagItem[];
  onTagsChange: (tags: TagItem[]) => void;
  placeholder?: string;
  action?: React.ReactNode;
}

function TagChipRow({ label, icon, description, tags, onTagsChange, placeholder, action }: TagChipRowProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addItem = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onTagsChange([...tags, { id: makeId(), text: trimmed }]);
    setDraft("");
    inputRef.current?.focus();
  }, [draft, tags, onTagsChange]);

  const removeItem = useCallback((id: string) => {
    onTagsChange(tags.filter((t) => t.id !== id));
  }, [tags, onTagsChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addItem();
      }
    },
    [addItem],
  );

  const handleDraftBlur = useCallback(() => {
    if (draft.includes(",")) {
      const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        onTagsChange([...tags, ...parts.map((t) => ({ id: makeId(), text: t }))]);
        setDraft("");
      }
    }
  }, [draft, tags, onTagsChange]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground/70">{icon}</span>
          <Label className="text-xs font-semibold text-foreground/90 cursor-default">{label}</Label>
        </div>
        {action}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5 items-center min-h-[36px] p-1.5 rounded-lg border border-zinc-200 bg-white focus-within:border-zinc-900/40 transition-colors">
        {tags.map((t) => (
          <Badge
            key={t.id}
            variant="secondary"
            className="gap-1 px-2 py-0.5 text-xs font-medium bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 cursor-default shadow-2xs"
          >
            {t.text}
            <button
              type="button"
              onClick={() => removeItem(t.id)}
              className="ml-0.5 text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer"
              aria-label={`Remove ${t.text}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleDraftBlur}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : "Add…"}
          className="h-7 min-w-24 flex-1 max-w-[220px] text-xs px-2 py-0 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center justify-center w-6 h-6 rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer"
            aria-label="Add tag"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export function InlineSplitSettings({
  settings,
  onSettingsChange,
  sampleText = "",
}: {
  settings: SplitSettings;
  onSettingsChange: (s: SplitSettings) => void;
  sampleText?: string;
  collapsed?: boolean;
}) {
  const [local, setLocal] = useState<SplitSettings>({ ...settings });

  useEffect(() => {
    setLocal({ ...settings });
  }, [settings]);

  const update = useCallback(
    (patch: Partial<SplitSettings>) => {
      const next = { ...local, ...patch, id: "custom", name: "Custom" };
      setLocal(next);
      onSettingsChange(next);
    },
    [local, onSettingsChange],
  );

  const setTagList = useCallback(
    (field: "cardSeparators" | "questionMarkers" | "answerMarkers", items: TagItem[]) => {
      const newSettings = {
        ...local,
        ...{ [field]: items.map((i) => i.text).join(", ") },
        id: "custom" as const,
        name: "Custom" as string,
      };
      setLocal(newSettings);
      onSettingsChange(newSettings);
    },
    [local, onSettingsChange],
  );

  const tagCacheRef = useRef<Map<string, TagItem[]>>(new Map());

  const stableTags = useCallback((str: string): TagItem[] => {
    const cache = tagCacheRef.current;
    const key = str.split(",").map((s) => s.trim()).filter(Boolean).join("||");
    if (cache.has(key)) return cache.get(key)!;
    const items = str.split(",").map((s) => s.trim()).filter(Boolean).map((t) => ({ id: makeId(), text: t }));
    cache.set(key, items);
    return items;
  }, []);

  const cardSeparatorsTags = stableTags(local.cardSeparators);
  const questionMarkersTags = stableTags(local.questionMarkers);
  const answerMarkersTags = stableTags(local.answerMarkers);

  const previewCards = useMemo(() => {
    if (!sampleText.trim()) return [];
    try {
      return extractFlashcardsFromText(sampleText, local);
    } catch {
      return [];
    }
  }, [sampleText, local]);

  const handlePreset = (preset: SplitSettings) => {
    const next = { ...preset, id: (preset.id || "custom") as string, name: (preset.name || "Custom") as string };
    setLocal(next);
    onSettingsChange(next);
  };

  const handleReset = () => {
    setLocal(DEFAULT_SPLIT_SETTINGS);
    onSettingsChange(DEFAULT_SPLIT_SETTINGS);
  };

  const isPreset = PREDEFINED_EXTRACTION_SETS.some((p) => p.id === local.id);
  const extractionCount = previewCards.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Format Presets bar & Live match count */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-zinc-900">Format Presets</Label>
          {sampleText.trim() && extractionCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-medium font-mono">
              <Sparkles className="w-3 h-3" />
              <span>{extractionCount} card{extractionCount !== 1 ? "s" : ""} matched</span>
            </div>
          )}
          {sampleText.trim() && extractionCount === 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 text-xs font-medium">
              <Sparkles className="w-3 h-3" />
              <span>0 cards matched</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PREDEFINED_EXTRACTION_SETS.map((preset) => {
            const isSelected = local.id === preset.id;
            return (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 text-xs font-medium rounded-md transition-all cursor-pointer",
                  isSelected
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs hover:bg-zinc-800 hover:text-white"
                    : "bg-white text-zinc-700 border-zinc-200/90 hover:bg-zinc-50 hover:text-zinc-950"
                )}
                onClick={() => handlePreset(preset)}
              >
                {preset.name}
              </Button>
            );
          })}
          {!isPreset && (
            <Badge variant="outline" className="h-7 px-2 text-xs font-medium rounded-md border-dashed border-zinc-300 text-zinc-600 bg-zinc-50">
              Custom Rules
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-zinc-500 hover:text-zinc-950 px-2 cursor-pointer"
            onClick={handleReset}
            title="Reset to default delimiters"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            <span>Reset</span>
          </Button>
        </div>
      </div>

      {/* Rules directly written out without any collapsible accordion */}
      <div className="space-y-4 pt-3 border-t border-zinc-200/60">
        {/* Card Separators */}
        <TagChipRow
          label="Card Separators"
          icon={<Heading className="w-4 h-4 text-zinc-500" />}
          description="Patterns that divide blocks into individual flashcards."
          tags={cardSeparatorsTags}
          onTagsChange={(t) => setTagList("cardSeparators", t)}
          placeholder="### Karte, ***, ---"
          action={
            <div className="flex items-center space-x-1.5">
              <Checkbox
                id="inc-card-sep"
                checked={local.includeCardSeparatorMarker}
                onCheckedChange={(v) => update({ includeCardSeparatorMarker: !!v })}
              />
              <Label htmlFor="inc-card-sep" className="text-xs text-zinc-600 cursor-pointer">
                Include in card
              </Label>
            </div>
          }
        />

        {/* Question Markers */}
        <TagChipRow
          label="Question Indicators (Front)"
          icon={<MessageSquare className="w-4 h-4 text-zinc-500" />}
          description="Labels that indicate a question or front side."
          tags={questionMarkersTags}
          onTagsChange={(t) => setTagList("questionMarkers", t)}
          placeholder="Frage:, Question:, Q:"
          action={
            <div className="flex items-center space-x-1.5">
              <Checkbox
                id="inc-q"
                checked={local.includeQuestionMarker}
                onCheckedChange={(v) => update({ includeQuestionMarker: !!v })}
              />
              <Label htmlFor="inc-q" className="text-xs text-zinc-600 cursor-pointer">
                Include in question
              </Label>
            </div>
          }
        />

        {/* Answer Markers */}
        <TagChipRow
          label="Answer Indicators (Back)"
          icon={<MessageCircle className="w-4 h-4 text-zinc-500" />}
          description="Labels that indicate the answer or back side."
          tags={answerMarkersTags}
          onTagsChange={(t) => setTagList("answerMarkers", t)}
          placeholder="Antwort:, Answer:, A:"
          action={
            <div className="flex items-center space-x-1.5">
              <Checkbox
                id="inc-a"
                checked={local.includeAnswerMarker}
                onCheckedChange={(v) => update({ includeAnswerMarker: !!v })}
              />
              <Label htmlFor="inc-a" className="text-xs text-zinc-600 cursor-pointer">
                Include in answer
              </Label>
            </div>
          }
        />

        {/* Bracket handling */}
        <div className="flex items-start gap-2.5 pt-2">
          <Checkbox
            id="ignore-brackets"
            checked={local.ignoreMarkerBrackets}
            onCheckedChange={(v) => update({ ignoreMarkerBrackets: !!v })}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="ignore-brackets" className="text-xs font-medium text-zinc-900 cursor-pointer leading-none">
              Ignore brackets in markers
            </Label>
            <span className="text-[11px] text-zinc-500 leading-relaxed">
              Allows <code className="text-[10px] bg-zinc-100 px-1 py-0.5 rounded text-zinc-800 font-mono">Frage: (Szenario)</code> to match <code className="text-[10px] bg-zinc-100 px-1 py-0.5 rounded text-zinc-800 font-mono">Frage:</code>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
