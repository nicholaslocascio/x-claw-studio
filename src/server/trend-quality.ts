import { looksTooAnalyticalForPost } from "@/src/server/prose-cleaner";

export interface TrendQualitySignals {
  openerQuestion: boolean;
  stackedLines: boolean;
  sufficientLines: boolean;
  escalatingClose: boolean;
  namedEntities: boolean;
  concreteNumbers: boolean;
  conciseLines: boolean;
  analyticalPenalty: boolean;
}

export interface TrendQualitySummary {
  score: number;
  maxScore: number;
  passed: boolean;
  signals: TrendQualitySignals;
  notes: string[];
  metrics: {
    lineCount: number;
    stackedLineCount: number;
    wordCount: number;
  };
}

const ENTITY_PATTERN =
  /\b(OpenAI|Anthropic|Meta|Microsoft|Amazon|Google|YouTube|Apple|xAI|DeepSeek|Nvidia|Bloomberg|Fed|UK|X)\b/;
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?(?:%|k|K|m|M|b|B| trillion| billion| million)?\b/;
const CLOSE_PATTERN = /\b(see you tomorrow|it gets worse|it'll get worse|it gets uglier|dead wrong|already started|not ready)\b/i;

function getStackedLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">"));
}

export function scoreTrendDigestText(text: string): TrendQualitySummary {
  const normalized = text.trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const stackedLines = getStackedLines(normalized);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const openerQuestion = /^(.+\?)$/m.test(lines[0] ?? "");
  const sufficientLines = stackedLines.length >= 4;
  const stackedStructure = stackedLines.length >= 3;
  const namedEntities = ENTITY_PATTERN.test(normalized);
  const concreteNumbers = NUMBER_PATTERN.test(normalized);
  const escalatingClose = CLOSE_PATTERN.test(lines.at(-1) ?? "") || /(worse|uglier|tomorrow|panic|warning)/i.test(lines.at(-1) ?? "");
  const conciseLines = stackedLines.every((line) => line.split(/\s+/).filter(Boolean).length <= 28);
  const analyticalPenalty = looksTooAnalyticalForPost(normalized.replace(/\n>/g, " "));

  let score = 0;
  if (openerQuestion) score += 2;
  if (stackedStructure) score += 2;
  if (sufficientLines) score += 2;
  if (escalatingClose) score += 2;
  if (namedEntities) score += 1;
  if (concreteNumbers) score += 1;
  if (conciseLines) score += 1;
  if (analyticalPenalty) score -= 3;

  const notes: string[] = [];
  if (openerQuestion) notes.push("opens with urgency");
  else notes.push("missing an urgent opener");
  if (stackedStructure) notes.push("uses stacked digest lines");
  else notes.push("missing stacked digest structure");
  if (sufficientLines) notes.push("covers enough distinct developments");
  else notes.push("needs more distinct stacked lines");
  if (escalatingClose) notes.push("lands with a kicker");
  else notes.push("closing line is too soft");
  if (namedEntities) notes.push("uses named entities");
  else notes.push("needs more specific company or institution nouns");
  if (concreteNumbers) notes.push("uses concrete numbers");
  else notes.push("needs harder numeric detail");
  if (conciseLines) notes.push("keeps the stacked lines compact");
  else notes.push("some stacked lines are too long");
  if (analyticalPenalty) notes.push("still reads too analytical");

  return {
    score,
    maxScore: 11,
    passed: score >= 7 && sufficientLines && stackedStructure && !analyticalPenalty,
    signals: {
      openerQuestion,
      stackedLines: stackedStructure,
      sufficientLines,
      escalatingClose,
      namedEntities,
      concreteNumbers,
      conciseLines,
      analyticalPenalty
    },
    notes,
    metrics: {
      lineCount: lines.length,
      stackedLineCount: stackedLines.length,
      wordCount
    }
  };
}
