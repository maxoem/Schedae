import type { ContentTransformer, TransformationContext } from "../types";

export class MathEnvironmentTransformer implements ContentTransformer {
  readonly id = "math-environments";
  readonly name = "Math & LaTeX Normalizer";
  readonly description = "Normalizes Anki MathJax tags, LaTeX delimiters, bare math environments, repairs escaped environment syntax, and unescapes corrupted math delimiters.";
  readonly order = 30;

  private static readonly BARE_ENV_REGEX =
    /\\begin\{(align\*?|alignat\*?|equation\*?|gather\*?|multline\*?|flalign\*?|split|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|cases|dcases|rcases|drcases|aligned|alignedat\*?|gathered|array|CD)\}([\s\S]*?)\\end\{\1\}/gi;

  private static readonly ANKI_MATHJAX_BLOCK_REGEX =
    /\\?<anki-mathjax\b[^>]*?\bblock(?:\s*=\s*["']?(?:1|true)["']?)?(?=[\s>])[^>]*>([\s\S]*?)\\?<\/anki-mathjax>/gi;

  private static readonly ANKI_MATHJAX_INLINE_REGEX =
    /\\?<anki-mathjax\b[^>]*>([\s\S]*?)\\?<\/anki-mathjax>/gi;

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

  private static formatBlockMath(math: string): string {
    const trimmed = math.trim();
    if (!trimmed) return "";
    return math.includes("\n") ? `\n\n$$\n${trimmed}\n$$\n\n` : `\n\n$$${trimmed}$$\n\n`;
  }

  private static stripCodeSpans(content: string): string {
    return content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]+`/g, "");
  }

  private static repairMathBody(math: string): string {
    return math
      .replace(/\\\\([a-zA-Z{}|\\^_])/g, "\\$1")
      .replace(/\\+_/g, "_");
  }

  canTransform(content: string, _context?: TransformationContext): boolean {
    if (!content || typeof content !== "string") return false;
    const inspectable = MathEnvironmentTransformer.stripCodeSpans(content);

    // Check for escaped math dollar delimiters, e.g. \\$ or \$ or \$$
    if (MathEnvironmentTransformer.ESCAPED_DOLLAR_REGEX.test(inspectable)) return true;

    // Check if the content has Anki native MathJax tags
    if (MathEnvironmentTransformer.ANKI_MATHJAX_REGEX.test(inspectable)) return true;

    // Check for LaTeX inline \( or display \[ delimiters
    if (MathEnvironmentTransformer.LATEX_DELIM_REGEX.test(inspectable)) return true;

    // Check for corrupted escaped environment asterisks (e.g. \begin{align\*})
    if (MathEnvironmentTransformer.ESCAPED_ENV_STAR_REGEX.test(inspectable)) return true;

    // Check for bare LaTeX environments not yet wrapped in display math delimiters
    MathEnvironmentTransformer.BARE_ENV_REGEX.lastIndex = 0;
    if (MathEnvironmentTransformer.BARE_ENV_REGEX.test(inspectable)) return true;

    // Check for double escaped LaTeX commands, e.g. \\subseteq, \\mathbb
    if (MathEnvironmentTransformer.DOUBLE_ESCAPED_CMD_REGEX.test(inspectable)) return true;

    // Check for escaped subscripts inside formulas: e.g. \_{ or \_\theta or \_1
    if (MathEnvironmentTransformer.ESCAPED_SUBSCRIPT_REGEX.test(inspectable)) return true;

    // Check for double escaped delimiters: e.g. \\( or \\[
    if (/\\\\[()[\]]/.test(inspectable)) return true;

    return false;
  }

  transform(content: string, _context?: TransformationContext): string {
    if (!content) return "";
    let s = content;

    // 0. Protect fenced code blocks and inline code so code snippets are never altered
    const codePlaceholders: string[] = [];
    const protectCode = (match: string) => {
      const idx = codePlaceholders.length;
      codePlaceholders.push(match);
      return `XPROTECTEDCODECHUNK${idx}X`;
    };
    s = s.replace(/```[\s\S]*?```/g, protectCode);
    s = s.replace(/`[^`\n]+`/g, protectCode);

    // 1. Repair corrupted escaped environment asterisks (e.g. \begin{align\*})
    s = s.replace(/\\begin\{(align|alignat|gather|multline|flalign)\\\*\}/gi, "\\begin{$1*}");
    s = s.replace(/\\end\{(align|alignat|gather|multline|flalign)\\\*\}/gi, "\\end{$1*}");

    // 2. Repair accidentally escaped dollar math delimiters (e.g. \\$Y ... \\$ or \$Y ... \$ or \$$)
    s = s.replace(/\\+(\$\$?)/g, "$1");

    // 3. Normalize Anki native mathjax tags (supports block="1", block="true", bare block, and stray \)
    s = s.replace(
      MathEnvironmentTransformer.ANKI_MATHJAX_BLOCK_REGEX,
      (_, math) => MathEnvironmentTransformer.formatBlockMath(math)
    );
    s = s.replace(
      MathEnvironmentTransformer.ANKI_MATHJAX_INLINE_REGEX,
      (_, math) => `$${math.trim()}$`
    );

    // 4. Protect existing $...$ / $$...$$ before normalizing \[...\] and \(...\)
    const existingMathPlaceholders: string[] = [];
    const protectExistingMath = (match: string) => {
      const idx = existingMathPlaceholders.length;
      existingMathPlaceholders.push(match);
      return `XPROTECTEDDOLLARMATH${idx}X`;
    };
    s = s.replace(/\$\$[\s\S]*?\$\$/g, protectExistingMath);
    s = s.replace(/\$[^$\n]+?\$/g, protectExistingMath);

    // 5. Normalize LaTeX display math \[...\] and double-escaped \\[...\\]
    s = s.replace(
      /\\\\?\[([\s\S]*?)\\\\?\]/g,
      (_, math) => MathEnvironmentTransformer.formatBlockMath(math)
    );

    // 6. Normalize LaTeX inline math \(...\) and double-escaped \\(...\\)
    s = s.replace(/\\\\?\(([^\n]*?)\\\\?\)/g, (_, math) => `$${math.trim()}$`);

    // Restore previously protected dollar-delimited math
    s = s.replace(/XPROTECTEDDOLLARMATH(\d+)X/g, (_, idx) => {
      return existingMathPlaceholders[Number(idx)] ?? "";
    });

    // 7. Wrap any remaining bare LaTeX display environments in display math ($$...$$)
    const bareEnvPlaceholders: string[] = [];
    const protectMath = (match: string) => {
      const idx = bareEnvPlaceholders.length;
      bareEnvPlaceholders.push(match);
      return `XPROTECTEDMATHCHUNK${idx}X`;
    };

    s = s.replace(/\$\$[\s\S]*?\$\$/g, protectMath);
    s = s.replace(/\$[^$\n]+?\$/g, protectMath);

    MathEnvironmentTransformer.BARE_ENV_REGEX.lastIndex = 0;
    s = s.replace(
      MathEnvironmentTransformer.BARE_ENV_REGEX,
      (match) => `\n\n$$\n${match.trim()}\n$$\n\n`
    );

    s = s.replace(/XPROTECTEDMATHCHUNK(\d+)X/g, (_, idx) => {
      return bareEnvPlaceholders[Number(idx)] ?? "";
    });

    // 8. Repair double-escaped LaTeX commands and escaped underscores inside all math blocks
    // Match $$...$$ before $...$ in a single pass so adjacent $$a$$ + $$b$$ never cross-matches.
    s = s.replace(/\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$/g, (_, blockMath, inlineMath) => {
      if (blockMath !== undefined) {
        return `$$${MathEnvironmentTransformer.repairMathBody(blockMath)}$$`;
      }
      return `$${MathEnvironmentTransformer.repairMathBody(inlineMath)}$`;
    });

    // 9. Repair escaped subscript underscores inside remaining bare formulas (e.g. \sum\_{k=0}, f\_\theta)
    s = s.replace(/\\_([a-zA-Z0-9\\{])/g, "_$1");

    // 10. Fix stray unescaped backslashes in math blocks
    s = s.replace(/\\\\([()[\]])/g, "\\$1");

    // 11. Ensure display math blocks ($$...$$) are cleanly isolated by blank lines from surrounding text.
    // Protect $$...$$ atomically first so regexes can never match across closing-to-opening $$ boundaries.
    const displayMathChunks: string[] = [];
    s = s.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
      const idx = displayMathChunks.length;
      displayMathChunks.push(match);
      return `XDISPLAYMATHCHUNK${idx}X`;
    });
    s = s.replace(/([^\n])[ \t]*(XDISPLAYMATHCHUNK\d+X)/g, "$1\n\n$2");
    s = s.replace(/(XDISPLAYMATHCHUNK\d+X)[ \t]*([^\n])/g, "$1\n\n$2");
    s = s.replace(/([^\n])\n(XDISPLAYMATHCHUNK\d+X)/g, "$1\n\n$2");
    s = s.replace(/(XDISPLAYMATHCHUNK\d+X)\n([^\n])/g, "$1\n\n$2");
    s = s.replace(/XDISPLAYMATHCHUNK(\d+)X/g, (_, idx) => {
      return displayMathChunks[Number(idx)] ?? "";
    });

    // Restore protected code blocks & inline code
    s = s.replace(/XPROTECTEDCODECHUNK(\d+)X/g, (_, idx) => {
      return codePlaceholders[Number(idx)] ?? "";
    });

    return s;
  }
}
