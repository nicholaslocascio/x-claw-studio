function normalizeAsciiPunctuation(text: string): string {
  return text
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2015/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "");
}

const ANALYTICAL_TELL_PATTERNS = [
  /\bframing\b/i,
  /\bnarrative\b/i,
  /\bdiscourse\b/i,
  /\bworkflow\b/i,
  /\bparadigm\b/i,
  /\becosystem\b/i,
  /\bdownstream\b/i,
  /\bimplication\b/i,
  /\baccountability\b/i,
  /\barchitecture\b/i,
  /\bsemantics?\b/i
];

const GENERIC_REPLY_TELL_PATTERNS = [
  /\bq[1-4]\b/i,
  /\bdeliverables\b/i,
  /\bstakeholders\b/i,
  /\balignment\b/i,
  /\bbandwidth\b/i,
  /\broadmap\b/i,
  /\bsynergy\b/i
];

const CONCRETE_REPLY_ANCHOR_PATTERNS = [
  /\bslack\b/i,
  /\boutlook\b/i,
  /\bokta\b/i,
  /\byubikey\b/i,
  /\bconfluence\b/i,
  /\bsharepoint\b/i,
  /\bworkday\b/i,
  /\blinear\b/i,
  /\bterminal\b/i,
  /\bdirect deposit\b/i,
  /\bbank app\b/i,
  /\bpayday\b/i,
  /\breceipt\b/i,
  /\bbadge swipe\b/i,
  /\biphone calculator\b/i
];

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "almost",
  "also",
  "because",
  "before",
  "being",
  "bro",
  "check",
  "could",
  "every",
  "feels",
  "from",
  "have",
  "into",
  "just",
  "like",
  "make",
  "more",
  "only",
  "over",
  "said",
  "same",
  "should",
  "sound",
  "still",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "until",
  "very",
  "with",
  "your"
]);

function normalizeTokenStream(text: string): string[] {
  return normalizeAsciiPunctuation(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function normalizeValue<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeAsciiPunctuation(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value).map(([key, entryValue]) => [key, normalizeValue(entryValue)]);
  return Object.fromEntries(entries) as T;
}

export function normalizeDraftStrings<T>(value: T): T {
  return normalizeValue(value);
}

export function looksTooAnalyticalForPost(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const normalized = normalizeAsciiPunctuation(text).trim();
  if (!normalized) {
    return false;
  }

  const sentenceCount = normalized.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const looksLikeDialogueOrCaption =
    /['"]/.test(normalized) ||
    /^(when|every time|how|guy who|me\b|nobody:|ok|imagine)\b/i.test(normalized) ||
    normalized.includes("?") ||
    normalized.includes(":");

  if (ANALYTICAL_TELL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (looksLikeDialogueOrCaption && wordCount <= 28) {
    return false;
  }

  if (sentenceCount >= 3) {
    return true;
  }

  return sentenceCount >= 2 && wordCount >= 32;
}

export function looksTooGenericForReply(
  replyText: string | null | undefined,
  subjectText: string | null | undefined
): boolean {
  if (!replyText) {
    return false;
  }

  const normalizedReply = normalizeAsciiPunctuation(replyText).trim();
  if (!normalizedReply) {
    return false;
  }

  if (CONCRETE_REPLY_ANCHOR_PATTERNS.some((pattern) => pattern.test(normalizedReply))) {
    return false;
  }

  if (GENERIC_REPLY_TELL_PATTERNS.some((pattern) => pattern.test(normalizedReply))) {
    return true;
  }

  if (!subjectText) {
    return false;
  }

  const subjectTokens = new Set(normalizeTokenStream(subjectText));
  if (subjectTokens.size === 0) {
    return false;
  }

  const replyTokens = normalizeTokenStream(normalizedReply);
  const overlappingTokens = replyTokens.filter((token) => subjectTokens.has(token));
  const subjectWordCount = normalizeAsciiPunctuation(subjectText).split(/\s+/).filter(Boolean).length;
  const replyWordCount = normalizedReply.split(/\s+/).filter(Boolean).length;

  if (subjectWordCount <= 12 && replyWordCount <= 12 && overlappingTokens.length === 0) {
    return true;
  }

  return false;
}
