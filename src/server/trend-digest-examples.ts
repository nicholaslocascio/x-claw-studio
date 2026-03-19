import fs from "node:fs";
import path from "node:path";

export interface TrendDigestExample {
  id: string;
  title: string;
  tweetText: string;
  whyItWorks: string;
  signals: string[];
}

interface TrendDigestExampleFile {
  version: 1;
  examples: TrendDigestExample[];
}

const examplesPath = path.join(process.cwd(), "data", "analysis", "trend-digest-examples.json");

let cache:
  | {
      mtimeMs: number;
      examples: TrendDigestExample[];
    }
  | null = null;

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeExample(value: unknown): TrendDigestExample | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const tweetText = typeof record.tweetText === "string" ? record.tweetText.trim() : "";
  const whyItWorks = typeof record.whyItWorks === "string" ? record.whyItWorks.trim() : "";

  if (!id || !title || !tweetText || !whyItWorks) {
    return null;
  }

  return {
    id,
    title,
    tweetText,
    whyItWorks,
    signals: normalizeStringList(record.signals)
  };
}

export function loadTrendDigestExamples(): TrendDigestExample[] {
  try {
    const stats = fs.statSync(examplesPath);
    if (cache && cache.mtimeMs === stats.mtimeMs) {
      return cache.examples;
    }

    const raw = JSON.parse(fs.readFileSync(examplesPath, "utf8")) as TrendDigestExampleFile;
    if (raw.version !== 1 || !Array.isArray(raw.examples)) {
      return [];
    }

    const examples = raw.examples.map(normalizeExample).filter((value): value is TrendDigestExample => Boolean(value));
    cache = {
      mtimeMs: stats.mtimeMs,
      examples
    };
    return examples;
  } catch {
    return [];
  }
}

export function formatTrendDigestExamplesForPrompt(limit = 2): string {
  const examples = loadTrendDigestExamples().slice(0, Math.max(0, limit));
  if (examples.length === 0) {
    return "- none";
  }

  return examples
    .map((example, index) =>
      [
        `Example ${index + 1}: ${example.title}`,
        example.tweetText,
        `Why it works: ${example.whyItWorks}`,
        `Signals: ${example.signals.join(", ") || "none"}`
      ].join("\n")
    )
    .join("\n\n");
}
