import { cn } from "@/lib/utils";
import { Sparkles, SlidersHorizontal } from "lucide-react";

/**
 * ParserModeToggle - Edge-to-edge Segmented Mode Switch between
 * deterministic rules/patterns and contextual AI extraction.
 * Aligned with Schedae's clean neutral zinc aesthetic.
 */
export function ParserModeToggle({
  mode,
  onModeChange,
  disabled,
}: {
  mode: "regex" | "heuristic";
  onModeChange: (mode: "regex" | "heuristic") => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full space-y-2">
      {/* Edge-to-edge Segmented Mode Switch */}
      <div className="relative w-full p-1 rounded-xl bg-zinc-100 border border-zinc-200/80 flex items-center shadow-2xs gap-1">
        <button
          type="button"
          onClick={() => onModeChange("regex")}
          disabled={disabled}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
            mode === "regex"
              ? "bg-white text-zinc-950 shadow-xs"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-700" />
          <span>Rules & Patterns</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange("heuristic")}
          disabled={disabled}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
            mode === "heuristic"
              ? "bg-white text-zinc-950 shadow-xs"
              : "text-zinc-600 hover:text-zinc-950 hover:bg-white/40",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Sparkles className="w-3.5 h-3.5 text-zinc-700" />
          <span>AI Extraction</span>
        </button>
      </div>

      {/* Contextual Subtitle bridging the mode switch to the content pane */}
      <div className="flex items-center gap-2 px-1 text-xs text-zinc-500 leading-relaxed">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
            mode === "regex" ? "bg-zinc-800" : "bg-emerald-500"
          )}
        />
        <p className="flex-1">
          {mode === "regex" ? (
            <>
              <strong className="text-zinc-900 font-semibold">Rules:</strong> Fast, offline parsing based on delimiters and Markdown patterns.
            </>
          ) : (
            <>
              <strong className="text-zinc-900 font-semibold">AI:</strong> Contextual parsing for unstructured notes using local or cloud LLMs.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
