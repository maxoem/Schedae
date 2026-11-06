import type { ContentTransformer, TransformationContext } from "../types";

export class MathEnvironmentTransformer implements ContentTransformer {
  readonly id = "math-environments";
  readonly name = "Math & LaTeX Normalizer";
  readonly description = "Normalizes Anki MathJax tags, LaTeX delimiters, bare math environments, repairs escaped environment syntax, and unescapes corrupted math delimiters.";
  readonly order = 30;

  private static readonly BARE_ENV_REGEX =
    /\\begin\{(align\*?|alignat\*?|equation\*?|gather\*?|multline\*?|flalign\*?|split|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|cases|dcases|rcases|drcases|aligned|alignedat\*?|gathered|array|CD)\}([\s\S]*?)\\end\{\1\}/gi;

  private static readonly ANKI_MATHJAX_REGEX =
    /\\?<anki-mathjax/i;

  private static readonly LATEX_DELIM_REGEX =
    /\\\\?[(\[]/;

  private static readonly ESCAPED_ENV_STAR_REGEX =
    /\\begin\{(align|alignat|gather|multline|flalign)\\\*\}/i;

  private static readonly ESCAPED_DOLLAR_REGEX =
    /\\+\$/;

  private static readonly ESCAPED_SUBSCRIPT_REGEX =
    /\\_[a-zA-Z0-9\\{]/;

  private static readonly DOUBLE_ESCAPED_CMD_REGEX =
    /\\\\[a-zA-Z]+/;

  canTransform(content: string, _context?: TransformationContext): boolean {
    if (!content || typeof content !== "string") return false;

    // Check for escaped math dollar delimiters, e.g. \\$ or \$ or \$$
    if (MathEnvironmentTransformer.ESCAPED_DOLLAR_REGEX.test(content)) return true;

    // Check if the content has Anki native MathJax tags
    if (MathEnvironmentTransformer.ANKI_MATHJAX_REGEX.test(content)) return true;

    // Check for LaTeX inline \( or display \[ delimiters
    if (MathEnvironmentTransformer.LATEX_DELIM_REGEX.test(content)) return true;

    // Check for corrupted escaped environment asterisks (e.g. \begin{align\*})
    if (MathEnvironmentTransformer.ESCAPED_ENV_STAR_REGEX.test(content)) return true;

    // Check for bare LaTeX environments not yet wrapped in display math delimiters
    MathEnvironmentTransformer.BARE_ENV_REGEX.lastIndex = 0;
    if (MathEnvironmentTransformer.BARE_ENV_REGEX.test(content)) return true;

    // Check for double escaped LaTeX commands, e.g. \\subseteq, \\mathbb
    if (MathEnvironmentTransformer.DOUBLE_ESCAPED_CMD_REGEX.test(content)) return true;

    // Check for escaped subscripts inside formulas: e.g. \_{ or \_\theta or \_1
    if (MathEnvironmentTransformer.ESCAPED_SUBSCRIPT_REGEX.test(content)) return true;

    // Check for double escaped delimiters: e.g. \\( or \\[
    if (/\\\\[()[\]]/.test(content)) return true;

    return false;
  }

  transform(content: string, _context?: TransformationContext): string {
    if (!content) return "";
    let s = content;

    // 1. Repair corrupted escaped environment asterisks (e.g. \begin{align\*})
    s = s.replace(/\\begin\{(align|alignat|gather|multline|flalign)\\\*\}/gi, "\\begin{$1*}");
    s = s.replace(/\\end\{(align|alignat|gather|multline|flalign)\\\*\}/gi, "\\end{$1*}");

    // 2. Repair accidentally escaped dollar math delimiters (e.g. \\$Y ... \\$ or \$Y ... \$ or \$$)
    s = s.replace(/\\+(\$\$?)/g, "$1");

    // 3. Repair double-escaped LaTeX commands and escaped underscores inside math blocks ($...$ and $$...$$)
    s = s.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      let fixed = math.replace(/\\\\([a-zA-Z{}|\\^_])/g, "\\$1");
      fixed = fixed.replace(/\\+_/g, "_");
      return `$${fixed}$`;
    });
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      let fixed = math.replace(/\\\\([a-zA-Z{}|\\^_])/g, "\\$1");
      fixed = fixed.replace(/\\+_/g, "_");
      return `$$${fixed}$$`;
    });

    // 4. Repair escaped subscript underscores inside formulas (e.g. \sum\_{k=0}, f\_\theta, X\_{raw})
    s = s.replace(/\\_([a-zA-Z0-9\\{])/g, "_$1");

    // 5. Normalize Anki native mathjax tags
    s = s.replace(
      /\\?<anki-mathjax[^>]*?block=["']?1["']?[^>]*>([\s\S]*?)\\?<\/anki-mathjax>/gi,
      (_, math) => `\n\n$$${math.trim()}$$\n\n`
    );
    s = s.replace(
      /\\?<anki-mathjax[^>]*>([\s\S]*?)\\?<\/anki-mathjax>/gi,
      (_, math) => `$${math.trim()}$`
    );

    // 6. Normalize LaTeX display math \[...\] and double-escaped \\[...\\]
    s = s.replace(/\\\\?\[([\s\S]*?)\\\\?\]/g, (_, math) => `\n\n$$${math.trim()}$$\n\n`);

    // 7. Normalize LaTeX inline math \(...\) and double-escaped \\(...\\)
    s = s.replace(/\\\\?\(([\s\S]*?)\\\\?\)/g, (_, math) => `$${math.trim()}$`);

    // 8. Wrap any remaining bare LaTeX display environments in display math ($$...$$)
    // First protect already delimited math expressions ($$ and $)
    const placeholders: string[] = [];
    const protect = (match: string) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `XPROTECTEDMATHCHUNK${idx}X`;
    };

    s = s.replace(/\$\$[\s\S]*?\$\$/g, protect);
    s = s.replace(/\$[^$\n]+?\$/g, protect);

    // Wrap bare environments that are outside any existing math delimiters
    MathEnvironmentTransformer.BARE_ENV_REGEX.lastIndex = 0;
    s = s.replace(
      MathEnvironmentTransformer.BARE_ENV_REGEX,
      (match) => `\n\n$$\n${match.trim()}\n$$\n\n`
    );

    // Restore protected chunks
    s = s.replace(/XPROTECTEDMATHCHUNK(\d+)X/g, (_, idx) => {
      return placeholders[Number(idx)] ?? "";
    });

    // 9. Fix stray unescaped backslashes in math blocks
    s = s.replace(/\\\\([()[\]])/g, "\\$1");

    // 10. Ensure display math blocks ($$...$$) are cleanly isolated by blank lines from surrounding text
    s = s.replace(/([^\n])\s*(\$\$[\s\S]*?\$\$)/g, "$1\n\n$2");
    s = s.replace(/(\$\$[\s\S]*?\$\$)\s*([^\n])/g, "$1\n\n$2");

    return s;
  }
}
