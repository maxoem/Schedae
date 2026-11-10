/**
 * Multilingual keyword registry for flashcard parsing.
 * Supports English, German, French, Spanish, and Italian.
 */
export interface KeywordDictionary {
  card: string[];
  front: string[];
  back: string[];
  metadata: string[];
}

export const PARSER_KEYWORDS: KeywordDictionary = {
  card: [
    // English & German
    "card",
    "karte",
    // French & Spanish & Italian
    "carte",
    "tarjeta",
    "ficha",
    "carta",
  ],
  front: [
    // English & German
    "front",
    "question",
    "prompt",
    "q",
    "frage",
    "vorderseite",
    // Spanish
    "pregunta",
    "anverso",
    // Italian
    "domanda",
  ],
  back: [
    // English & German
    "back",
    "answer",
    "solution",
    "a",
    "antwort",
    "rückseite",
    "lösung",
    // French
    "réponse",
    // Spanish
    "respuesta",
    "solución",
    "reverso",
    // Italian
    "risposta",
    "soluzione",
  ],
  metadata: [
    // English & German
    "source",
    "sources",
    "tags",
    "category",
    "notes",
    "extra",
    "hint",
    "reference",
    "references",
    "quelle",
    "quellen",
    "kategorie",
    "notizen",
    "hinweis",
    "referenz",
    "referenzen",
    // French
    "catégorie",
    "remarques",
    "référence",
    "références",
    // Spanish
    "fuente",
    "fuentes",
    "categoría",
    "notas",
    // Italian
    "categoria",
    "note",
  ],
};

/**
 * Builds a regex alternation string from a list of words,
 * normalized to canonical NFC and sorted by length descending
 * to ensure longest-prefix matching.
 */
export function buildAlternation(words: string[]): string {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  return sorted
    .map((w) => w.normalize("NFC").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

export const CARD_KEYWORDS_PATTERN = buildAlternation(PARSER_KEYWORDS.card);
export const FRONT_KEYWORDS_PATTERN = buildAlternation(PARSER_KEYWORDS.front);
export const BACK_KEYWORDS_PATTERN = buildAlternation(PARSER_KEYWORDS.back);
export const METADATA_KEYWORDS_PATTERN = buildAlternation(PARSER_KEYWORDS.metadata);

/**
 * Pre-compiled regexes for single-word / alias matching (trimmed, normalized strings).
 */
export const CARD_HEADER_REGEX = new RegExp(`^(?:${CARD_KEYWORDS_PATTERN})\\s*[\\d.:]`, "i");
export const CARD_ALIASES_REGEX = new RegExp(`^(?:${CARD_KEYWORDS_PATTERN})$`, "i");
export const FRONT_ALIASES_REGEX = new RegExp(`^(?:${FRONT_KEYWORDS_PATTERN})$`, "i");
export const BACK_ALIASES_REGEX = new RegExp(`^(?:${BACK_KEYWORDS_PATTERN})$`, "i");
export const KNOWN_METADATA_REGEX = new RegExp(`^(?:${METADATA_KEYWORDS_PATTERN})\\b`, "i");

/**
 * Helper predicates.
 */
export function isFrontKeyword(str: string): boolean {
  return FRONT_ALIASES_REGEX.test(str.normalize("NFC").trim());
}

export function isBackKeyword(str: string): boolean {
  return BACK_ALIASES_REGEX.test(str.normalize("NFC").trim());
}

export function isCardKeyword(str: string): boolean {
  return CARD_ALIASES_REGEX.test(str.normalize("NFC").trim());
}

/**
 * Returns true if the input consists solely of a bare front/back label marker
 * (e.g., "**Vorderseite:**", "Front:", "### Question") with no actual content.
 */
export function isBareFieldLabel(str: string): boolean {
  const cleaned = str
    .normalize("NFC")
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_~`:\s]+/g, " ")
    .trim();
  if (!cleaned) return false;
  return isFrontKeyword(cleaned) || isBackKeyword(cleaned);
}

export function isMetadataKeyword(str: string): boolean {
  return KNOWN_METADATA_REGEX.test(str.normalize("NFC").trim());
}

export function isCardHeader(str: string): boolean {
  return CARD_HEADER_REGEX.test(str.normalize("NFC").trim());
}

/**
 * Structural detection patterns for Markdown headings.
 */
export const HEADING_FRONT_REGEX = new RegExp(`^#{1,4}\\s+[*_~]*(?:${FRONT_KEYWORDS_PATTERN})\\b`, "im");
export const HEADING_BACK_REGEX = new RegExp(`^#{1,4}\\s+[*_~]*(?:${BACK_KEYWORDS_PATTERN})\\b`, "im");
export const HEADING_CARD_REGEX = new RegExp(`^#{1,4}\\s+[*_~]*(?:${CARD_KEYWORDS_PATTERN})\\b`, "im");
export const HEADING_CARD_HEADER_REGEX = new RegExp(
  `^#{1,6}\\s+[*_~]*(?:${CARD_KEYWORDS_PATTERN})(?:\\s*[\\d.:#]|\\s*[*_~]*$)`,
  "i"
);

/**
 * Structural detection patterns for Bullet-list key-value pairs (- Front: / * Question:).
 */
export const BULLET_FRONT_REGEX = new RegExp(
  `(?:^|\\n)[ \\t]*[-*+][ \\t]+(?:\\*\\*|__)?(?:${FRONT_KEYWORDS_PATTERN})(?:\\*\\*|__)?(?:\\s*\\([^)]*\\))?[ \\t]*:`,
  "im"
);
export const BULLET_BACK_REGEX = new RegExp(
  `(?:^|\\n)[ \\t]*[-*+][ \\t]+(?:\\*\\*|__)?(?:${BACK_KEYWORDS_PATTERN})(?:\\*\\*|__)?(?:\\s*\\([^)]*\\))?[ \\t]*:`,
  "im"
);

/**
 * Structural detection patterns for Plain key-value pairs without bullets (Front: / Back:).
 */
export const PLAIN_FRONT_REGEX = new RegExp(
  `(?:^|\\n)[ \\t]*(?:${FRONT_KEYWORDS_PATTERN})(?:\\s*\\([^)]*\\))?[ \\t]*:`,
  "im"
);
export const PLAIN_BACK_REGEX = new RegExp(
  `(?:^|\\n)[ \\t]*(?:${BACK_KEYWORDS_PATTERN})(?:\\s*\\([^)]*\\))?[ \\t]*:`,
  "im"
);

/**
 * Structural detection patterns for Bold / Italic delimiters (**Front:** / **Back:** / **Karte**).
 */
export const BOLD_FRONT_REGEX = new RegExp(
  `(?:\b|\\*\\*|__)(?:${FRONT_KEYWORDS_PATTERN}):?(?:\\*\\*|__):?\\s*`,
  "i"
);
export const BOLD_BACK_REGEX = new RegExp(
  `(?:\b|\\*\\*|__)(?:${BACK_KEYWORDS_PATTERN}):?(?:\\*\\*|__):?\\s*`,
  "i"
);
export const BOLD_CARD_REGEX = new RegExp(
  `(?:\b|\\*\\*|__)(?:${CARD_KEYWORDS_PATTERN})(?:\\*\\*|__)\\b`,
  "i"
);
