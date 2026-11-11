import { MathEnvironmentTransformer } from "@/services/deckTransformer/transformers/mathEnvironmentTransformer";

export type ExportMathFormat = "katex" | "anki_mathjax";
export type MathFormatMode = ExportMathFormat | "preserve";

const mathTransformer = new MathEnvironmentTransformer();

/**
 * Normalizes math syntax across various formats (Anki-MathJax tags,
 * LaTeX \(...\) inline and \[...\] display math, bare display environments) to standard remark-math ($...$ and $$...$$).
 * If the content does not contain math syntax requiring normalization, it is returned untouched.
 */
export function normalizeMathMarkdown(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  if (mathTransformer.canTransform(raw)) {
    return mathTransformer.transform(raw);
  }
  return raw;
}

/**
 * Converts math expressions into clean, native Anki MathJax delimiters (`\(...\)` and `\[...\]`).
 * Normalizes messy/double-escaped input first so Anki never emits stray backslash prefixes.
 * Protects fenced code blocks and inline code spans from modification.
 */
export function convertKatexToAnkiMathJax(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let s = normalizeMathMarkdown(raw);

  const codePlaceholders: string[] = [];
  const protectCode = (match: string) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(match);
    return `XPROTECTEDCODECHUNK${idx}X`;
  };

  s = s.replace(/```[\s\S]*?```/g, protectCode);
  s = s.replace(/`[^`\n]+`/g, protectCode);

  // Convert display math $$...$$ -> \[...\] (preserving multi-line structure cleanly)
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (full, math: string) => {
    const trimmed = math.trim();
    if (!trimmed) return full;
    return math.includes("\n") ? `\\[\n${trimmed}\n\\]` : `\\[${trimmed}\\]`;
  });

  // Convert inline math $...$ -> \(...\) (avoid currency pairs like $5 and $10)
  s = s.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\d)/g, (full, math: string) => {
    const trimmed = math.trim();
    if (!trimmed) return full;
    return `\\(${trimmed}\\)`;
  });

  s = s.replace(/XPROTECTEDCODECHUNK(\d+)X/g, (_, idx) => {
    return codePlaceholders[Number(idx)] ?? "";
  });

  return s;
}

/**
 * Formats math expressions for the requested export target.
 */
export function formatMathForTarget(raw: string, format: MathFormatMode = "katex"): string {
  if (!raw || typeof raw !== "string") return "";
  if (format === "preserve") return raw;
  if (format === "anki_mathjax") return convertKatexToAnkiMathJax(raw);
  return normalizeMathMarkdown(raw);
}
