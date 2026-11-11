import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DeckTransformerService,
  defaultDeckTransformerService,
} from "../deckTransformerService";
import { MathEnvironmentTransformer } from "../transformers/mathEnvironmentTransformer";
import { HtmlToMarkdownTransformer } from "../transformers/htmlToMarkdownTransformer";
import { FieldLabelTransformer } from "../transformers/fieldLabelTransformer";
import { ListBulletTransformer } from "../transformers/listBulletTransformer";
import { WhitespaceTransformer } from "../transformers/whitespaceTransformer";
import { formatMarkdownForAnki } from "@/converters/jsonToApkg";

describe("DeckTransformer Pipeline & Orchestrator", () => {
  describe("Orchestrator canTransform checks & conditional execution", () => {
    test("does not modify content when no transformer canTransform matches", () => {
      const cleanMarkdown = "# What is Osmosis?\n\nOsmosis is the net movement of water molecules.";
      const report = defaultDeckTransformerService.transformFieldWithReport(cleanMarkdown);

      assert.equal(report.hasChanged, false);
      assert.deepEqual(report.appliedTransformers, []);
      assert.equal(report.result, cleanMarkdown);
    });

    test("skips disabled transformers even if canTransform returns true", () => {
      const input = "<b>Bold text</b> with **Front:** label";
      // Disable htmlToMarkdown and stripFieldLabels
      const result = defaultDeckTransformerService.transformField(input, {
        cleanListBullets: true,
        normalizeMath: true,
        htmlToMarkdown: false,
        stripFieldLabels: false,
        normalizeWhitespace: true,
        targetTemplate: "markdown_basic",
      });

      // The HTML and field label must remain untouched because their transformers were disabled
      assert.ok(result.includes("<b>Bold text</b>"));
      assert.ok(result.includes("**Front:**"));
    });

    test("allows registering custom transformer adhering to ContentTransformer interface", () => {
      const service = new DeckTransformerService();
      const customTransformer = {
        id: "custom-censor",
        name: "Custom Censor",
        description: "Replaces forbidden words",
        canTransform(content: string) {
          return content.includes("SECRET");
        },
        transform(content: string) {
          return content.replace(/SECRET/g, "[REDACTED]");
        },
      };

      service.registerTransformer(customTransformer);
      const output = service.transformField("This card has SECRET knowledge.");
      assert.equal(output, "This card has [REDACTED] knowledge.");
    });
  });

  describe("MathEnvironmentTransformer", () => {
    const mathTransformer = new MathEnvironmentTransformer();

    test("canTransform returns true only for content needing math transformation", () => {
      assert.equal(mathTransformer.canTransform("Plain text question"), false);
      assert.equal(mathTransformer.canTransform("* bullet point 1\n* bullet point 2"), false);

      assert.equal(mathTransformer.canTransform("<anki-mathjax>x^2</anki-mathjax>"), true);
      assert.equal(mathTransformer.canTransform("LaTeX display \\[ x = 1 \\]"), true);
      assert.equal(mathTransformer.canTransform("LaTeX inline \\( x = 1 \\)"), true);
      assert.equal(mathTransformer.canTransform("\\begin{align*} a &= b \\end{align*}"), true);
      assert.equal(mathTransformer.canTransform("\\begin{align\\*} a &= b \\end{align\\*}"), true);
      assert.equal(mathTransformer.canTransform("Formula with \\_{escaped} subscript"), true);
    });

    test("normalizes Anki MathJax tags to KaTeX standard delimiters", () => {
      const ankiBlock = "<anki-mathjax block=\"1\">\\sum_{i=1}^n i = \\frac{n(n+1)}{2}</anki-mathjax>";
      const normalizedBlock = mathTransformer.transform(ankiBlock);
      assert.ok(normalizedBlock.includes("$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$"));

      const ankiInline = "Calculate <anki-mathjax>E = mc^2</anki-mathjax> accurately.";
      const normalizedInline = mathTransformer.transform(ankiInline);
      assert.equal(normalizedInline, "Calculate $E = mc^2$ accurately.");
    });

    test("wraps bare LaTeX environments in display math without double-wrapping existing $$", () => {
      const bareAlign = "\\begin{align*}\n  f(x) &= x^2 \\\\\n  f'(x) &= 2x\n\\end{align*}";
      const transformedBare = mathTransformer.transform(bareAlign);
      assert.ok(transformedBare.startsWith("\n\n$$\n\\begin{align*}"));
      assert.ok(transformedBare.endsWith("\\end{align*}\n$$\n\n"));

      const alreadyWrapped = "$$\\begin{align*}\n  f(x) &= x^2\n\\end{align*}$$";
      const transformedWrapped = mathTransformer.transform(alreadyWrapped);
      // Must not be wrapped again into $$$$...$$$$
      assert.equal(transformedWrapped.includes("$$$$"), false);
      assert.equal(transformedWrapped, alreadyWrapped);
    });

    test("repairs corrupted escaped environment asterisks and subscripts", () => {
      const corrupted = "\\begin{align\\*} a &= b \\end{align\\*} and \\sum\\_{k=0}^n";
      const repaired = mathTransformer.transform(corrupted);
      assert.ok(repaired.includes("\\begin{align*}"));
      assert.ok(repaired.includes("\\end{align*}"));
      assert.ok(repaired.includes("\\sum_{k=0}^n"));
    });

    test("supports block='true' anki-mathjax, adjacent $$ blocks, double-escaped commands in \\[...\\], and code protection", () => {
      const input =
        "\\<anki-mathjax block=\"true\">\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}\\</anki-mathjax>\n" +
        "Adjacent: $$a$$ + $$b$$\n" +
        "Double cmd: \\\\[ \\\\frac{1}{2} \\\\]\n" +
        "Code: `const x = \\(1\\)`";
      const result = mathTransformer.transform(input);
      assert.ok(result.includes("$$\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}$$"));
      assert.ok(result.includes("$$a$$") && result.includes("$$b$$"));
      assert.ok(!result.includes("$$ + $$"));
      assert.ok(result.includes("$$\\frac{1}{2}$$"));
      assert.ok(result.includes("`const x = \\(1\\)`"));
    });
  });

  describe("HtmlToMarkdownTransformer", () => {
    const htmlTransformer = new HtmlToMarkdownTransformer();

    test("canTransform returns false for clean markdown and true for legacy HTML", () => {
      assert.equal(htmlTransformer.canTransform("# Clean Header\n\n* List item"), false);
      assert.equal(htmlTransformer.canTransform("<div><p>HTML paragraph</p></div>"), true);
      assert.equal(htmlTransformer.canTransform("Text with <b>bold</b> element"), true);
    });

    test("safeguards math expressions from Turndown escaping (underscores & asterisks)", () => {
      const htmlWithMath =
        "<div><b>Formula:</b> $$f(x) = \\sum_{k=0}^n \\frac{f^{(k)}(a)}{k!} (x - a)^k + R_n(x)$$</div>";
      const markdown = htmlTransformer.transform(htmlWithMath);

      // Underscores inside math MUST NOT be escaped into \_
      assert.ok(
        markdown.includes("$$f(x) = \\sum_{k=0}^n \\frac{f^{(k)}(a)}{k!} (x - a)^k + R_n(x)$$"),
        "Math formula must preserve unescaped subscripts"
      );
      assert.ok(!markdown.includes("\\sum\\_"), "Math should not contain escaped subscripts");
      assert.ok(!markdown.includes("R\\_n"), "Math should not contain escaped R\\_n");
      // Bold markup outside math was converted to markdown
      assert.ok(markdown.includes("**Formula:**"));
    });

    test("safeguards LaTeX environments from Turndown escaping", () => {
      const htmlWithAlign =
        "<p>Equation:</p>$$\\begin{align*} x &= 1 \\\\ y &= 2 \\end{align*}$$";
      const markdown = htmlTransformer.transform(htmlWithAlign);

      // Asterisk in align* must NOT become align\*
      assert.ok(markdown.includes("\\begin{align*}"));
      assert.ok(markdown.includes("\\end{align*}"));
      assert.ok(!markdown.includes("align\\*"));
    });
  });

  describe("formatMarkdownForAnki math protection", () => {
    test("does not insert <br> inside multi-line LaTeX math blocks", () => {
      const content =
        "Hier ist die Taylor-Entwicklung:\n" +
        "$$\n" +
        "\\begin{aligned}\n" +
        "f(x) &= f(a) + f'(a)(x - a) \\\\\n" +
        "g(x) &= g(a)\n" +
        "\\end{aligned}\n" +
        "$$\n" +
        "* Punkt 1\n" +
        "* Punkt 2";

      const formatted = formatMarkdownForAnki(content);

      // Outside math, newlines become <br>
      assert.ok(formatted.includes("* Punkt 1<br>* Punkt 2"));

      // Inside math, newlines must remain \n so KaTeX does not crash on <br>
      assert.ok(
        formatted.includes(
          "$$\n\\begin{aligned}\nf(x) &= f(a) + f'(a)(x - a) \\\\\ng(x) &= g(a)\n\\end{aligned}\n$$"
        ),
        "Multi-line math block must not contain <br> tags"
      );
      assert.ok(!formatted.includes("\\begin{aligned}<br>"));
    });
  });

  describe("Indentation and List Sub-bullet Preservation", () => {
    test("preserves 2-space, 4-space, and tab indentations while cleaning accidental single spaces", () => {
      const indentedContent =
        "* Top-level item 1\n" +
        "  * Sub-item with 2 spaces\n" +
        "    * Sub-sub-item with 4 spaces\n" +
        "* Top-level item 2\n" +
        "\t* Sub-item with tab\n" +
        "\t\t* Sub-sub-item with 2 tabs\n" +
        " * Accidental single space item";

      const transformed = defaultDeckTransformerService.transformField(indentedContent);

      assert.equal(
        transformed,
        "* Top-level item 1\n" +
          "  * Sub-item with 2 spaces\n" +
          "    * Sub-sub-item with 4 spaces\n" +
          "* Top-level item 2\n" +
          "\t* Sub-item with tab\n" +
          "\t\t* Sub-sub-item with 2 tabs\n" +
          "* Accidental single space item"
      );
    });

    test("preserves code block indentations (spaces and tabs)", () => {
      const codeBlockContent =
        "```python\n" +
        "def compute(data):\n" +
        "    for x in data:\n" +
        "        if x > 0:\n" +
        "            yield x * 2\n" +
        "```";

      const transformed = defaultDeckTransformerService.transformField(codeBlockContent);
      assert.equal(transformed, codeBlockContent);
    });
  });

  describe("Real-world Corrupted Flashcards Dataset Verification", () => {
    // Exact corrupted card provided by user screenshot
    test("fixes user screenshot card: restores escaped bullets, bold text, unescapes dollars & double backslashes", () => {
      const inputFront =
        "Welches mathematische Unterscheidungskriterium trennt Regressions- von Klassifikationsaufgaben?";
      const inputBack =
        "\\* \\*\\*Regression:\\*\\* Der Zielraum ist kontinuierlich und reellwertig (\\\\$Y \\\\subseteq \\\\mathbb{R}^d\\\\$).<br>\\* \\*\\*Klassifikation:\\*\\* Der Zielraum ist diskret und kategorial (\\\\$Y \\\\in \\\\{1, \\\\dots, K\\\\}\\\\$).";
      const inputField3 =
        "Note: *KI Grundlagen: Konzepte & Definitionen* (Thema 4) | Goodfellow et al., Kapitel 5.1.1 (S. 99–100) | Prince, Kapitel 1.1.1 (S. 3)";

      const fixedFront = defaultDeckTransformerService.transformField(inputFront);
      const fixedBack = defaultDeckTransformerService.transformField(inputBack);
      const fixedField3 = defaultDeckTransformerService.transformField(inputField3);

      // Front: unchanged
      assert.equal(fixedFront, inputFront);

      // Back: escaped bullets and bold become clean markdown, escaped dollars become math, double backslashes fixed
      assert.equal(
        fixedBack,
        "* **Regression:** Der Zielraum ist kontinuierlich und reellwertig ($Y \\subseteq \\mathbb{R}^d$).\n" +
          "* **Klassifikation:** Der Zielraum ist diskret und kategorial ($Y \\in \\{1, \\dots, K\\}$)."
      );

      // Field 3: stripped 'Note:' label while preserving italic title
      assert.equal(
        fixedField3,
        "*KI Grundlagen: Konzepte & Definitionen* (Thema 4) | Goodfellow et al., Kapitel 5.1.1 (S. 99–100) | Prince, Kapitel 1.1.1 (S. 3)"
      );
    });

    test("fixes user screenshot card #2: removes stray backslashes, repairs escaped closing delimiter \\$$, and unescapes math subscripts", () => {
      const inputBack =
        "Ein Ansatz, bei dem ein einziges tiefes Modell die gesamte Abbildung von den unstrukturierten Rohdaten (z. B. Audiosignal) direkt bis zur Zielvorhersage (z. B. Text) erlernt:<br>\\\\\\<br><br>$$f\\_\\theta: X\\_{\\text{raw}} \\to Y\\_{\\text{target}}\\$$<br><br>ohne manuelle Zwischenverarbeitungsschritte oder getrennte Teilmodelle.";

      const fixedBack = defaultDeckTransformerService.transformField(inputBack);

      assert.equal(
        fixedBack,
        "Ein Ansatz, bei dem ein einziges tiefes Modell die gesamte Abbildung von den unstrukturierten Rohdaten (z. B. Audiosignal) direkt bis zur Zielvorhersage (z. B. Text) erlernt:\n\n" +
          "$$f_\\theta: X_{\\text{raw}} \\to Y_{\\text{target}}$$\n\n" +
          "ohne manuelle Zwischenverarbeitungsschritte oder getrennte Teilmodelle."
      );
    });

    test("all entries in corruptedFlashcards.json dataset transform to clean expected representations", async () => {
      const fs = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const datasetPath = fileURLToPath(new URL("./data/corruptedFlashcards.json", import.meta.url));
      const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));

      for (const entry of dataset) {
        const actualFront = defaultDeckTransformerService.transformField(entry.input.front);
        const actualBack = defaultDeckTransformerService.transformField(entry.input.back);

        assert.equal(
          actualFront,
          entry.expected.front,
          `Card #${entry.id} front transformation mismatch`
        );
        assert.equal(
          actualBack,
          entry.expected.back,
          `Card #${entry.id} back transformation mismatch`
        );

        if (entry.input.extra && entry.expected.extra) {
          const actualExtra = defaultDeckTransformerService.transformField(entry.input.extra);
          assert.equal(
            actualExtra,
            entry.expected.extra,
            `Card #${entry.id} extra transformation mismatch`
          );
        }
      }
    });
  });
});
