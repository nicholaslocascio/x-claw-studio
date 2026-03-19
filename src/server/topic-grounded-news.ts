import fs from "node:fs";
import path from "node:path";
import { Type, GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, loadEnv } from "@/src/lib/env";
import { writeJson } from "@/src/lib/fs";
import type {
  GroundedNewsSource,
  GroundedTopicNews,
  GroundedTopicNewsCache,
  TopicClusterRecord
} from "@/src/lib/types";

loadEnv();

const projectRoot = process.cwd();
const groundedNewsCachePath = path.join(projectRoot, "data", "analysis", "topics", "news.json");
const groundedNewsModel = process.env.TOPIC_GROUNDED_NEWS_MODEL || "gemini-2.5-flash";
const groundedNewsTtlHours = Number(process.env.TOPIC_GROUNDED_NEWS_TTL_HOURS || 6);
const groundedNewsMaxTopics = Number(process.env.TOPIC_GROUNDED_NEWS_MAX_TOPICS || 3);

const groundedNewsSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    whyNow: { type: Type.STRING },
    suggestedAngles: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["summary", "whyNow", "suggestedAngles"]
} as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isGroundedTopicNewsEnabled(): boolean {
  return process.env.TOPIC_GROUNDED_NEWS_ENABLED === "1";
}

function getTimestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function addGroundingCitations(response: {
  text?: string | null;
  candidates?: Array<{
    groundingMetadata?: {
      groundingSupports?: Array<{
        segment?: { endIndex?: number | null };
        groundingChunkIndices?: number[];
      }>;
      groundingChunks?: Array<{ web?: { uri?: string | null } }>;
    };
  }>;
}): string {
  let text = response.text ?? "";
  const supports = response.candidates?.[0]?.groundingMetadata?.groundingSupports ?? [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sortedSupports = [...supports].sort(
    (left, right) => (right.segment?.endIndex ?? 0) - (left.segment?.endIndex ?? 0)
  );

  for (const support of sortedSupports) {
    const endIndex = support.segment?.endIndex;
    if (!Number.isFinite(endIndex) || !support.groundingChunkIndices?.length) {
      continue;
    }

    const citationLinks = support.groundingChunkIndices
      .map((index) => {
        const uri = chunks[index]?.web?.uri;
        return uri ? `[${index + 1}](${uri})` : null;
      })
      .filter((value): value is string => Boolean(value));

    if (citationLinks.length === 0) {
      continue;
    }

    const safeEndIndex = endIndex ?? 0;
    text = `${text.slice(0, safeEndIndex)} ${citationLinks.join(", ")}${text.slice(safeEndIndex)}`;
  }

  return text.trim();
}

function readGroundedNewsCache(): GroundedTopicNewsCache {
  if (!fs.existsSync(groundedNewsCachePath)) {
    return {
      generatedAt: new Date(0).toISOString(),
      items: []
    };
  }

  return JSON.parse(fs.readFileSync(groundedNewsCachePath, "utf8")) as GroundedTopicNewsCache;
}

function writeGroundedNewsCache(items: GroundedTopicNews[]): void {
  writeJson(groundedNewsCachePath, {
    generatedAt: new Date().toISOString(),
    items
  } satisfies GroundedTopicNewsCache);
}

function isCacheFresh(item: GroundedTopicNews | undefined, nowMs: number): boolean {
  if (!item) {
    return false;
  }

  const fetchedAtMs = getTimestampMs(item.fetchedAt);
  if (fetchedAtMs === 0) {
    return false;
  }

  return nowMs - fetchedAtMs < groundedNewsTtlHours * 60 * 60 * 1000;
}

function selectTargetTopics(topics: TopicClusterRecord[]): TopicClusterRecord[] {
  return topics.filter((topic) => !topic.isStale).slice(0, groundedNewsMaxTopics);
}

function extractGroundedSources(response: {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string | null; title?: string | null } }>;
    };
  }>;
}): GroundedNewsSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundedNewsSource[] = [];

  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    const title = chunk.web?.title?.trim();
    if (!uri || !title || seen.has(uri)) {
      continue;
    }

    seen.add(uri);
    sources.push({ uri, title });
  }

  return sources.slice(0, 6);
}

async function fetchGroundedTopicNews(topic: TopicClusterRecord): Promise<GroundedTopicNews> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const representativeText = topic.representativeTweets
    .map((tweet) => tweet.text)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .join("\n- ");
  const prompt = [
    "You are helping plan new X/Twitter posts.",
    "Use Google Search grounding to find the most current news or developments connected to this topic.",
    "Return only JSON that matches the schema.",
    "Keep the summary factual and concise.",
    "Suggested angles must be useful tweet directions, not article summaries.",
    "",
    `Topic: ${topic.label}`,
    `Topic kind: ${topic.kind}`,
    `Current cluster stats: ${topic.tweetCount} tweets, ${topic.uniqueAuthorCount} authors, ${topic.totalLikes} likes, ${topic.recentTweetCount24h} tweets in the last 24h.`,
    topic.representativeTweets.length > 0 ? `Representative tweets:\n- ${representativeText}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const response = await ai.models.generateContent({
    model: groundedNewsModel,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: groundedNewsSchema
    }
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    summary?: unknown;
    whyNow?: unknown;
    suggestedAngles?: unknown;
  };

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const whyNow = typeof parsed.whyNow === "string" ? parsed.whyNow.trim() : "";
  const suggestedAngles = Array.isArray(parsed.suggestedAngles)
    ? parsed.suggestedAngles.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  const searchQueriesRaw = (
    response.candidates as Array<{ groundingMetadata?: { webSearchQueries?: unknown } }> | undefined
  )?.[0]?.groundingMetadata?.webSearchQueries;
  const searchQueries = Array.isArray(searchQueriesRaw)
    ? searchQueriesRaw.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];

  return {
    topicId: topic.topicId,
    fetchedAt: new Date().toISOString(),
    model: groundedNewsModel,
    summary,
    summaryWithCitations: addGroundingCitations({
      text: summary,
      candidates: response.candidates
    }),
    whyNow,
    suggestedAngles: suggestedAngles.slice(0, 3),
    searchQueries,
    sources: extractGroundedSources(response)
  };
}

export async function getGroundedTopicNews(
  topics: TopicClusterRecord[],
  options?: {
    refreshIfStale?: boolean;
  }
): Promise<Map<string, GroundedTopicNews>> {
  const cache = readGroundedNewsCache();
  const byTopicId = new Map(cache.items.map((item) => [item.topicId, item]));
  if (!isGroundedTopicNewsEnabled()) {
    return byTopicId;
  }

  if (options?.refreshIfStale === false) {
    return byTopicId;
  }

  const nowMs = Date.now();
  const targets = selectTargetTopics(topics);
  let changed = false;

  for (const topic of targets) {
    const existing = byTopicId.get(topic.topicId);
    if (isCacheFresh(existing, nowMs)) {
      continue;
    }

    try {
      const groundedNews = await fetchGroundedTopicNews(topic);
      byTopicId.set(topic.topicId, groundedNews);
      changed = true;
    } catch (error) {
      console.warn(`Grounded topic news failed for ${topic.topicId}: ${getErrorMessage(error)}`);
    }
  }

  if (changed) {
    writeGroundedNewsCache(Array.from(byTopicId.values()).sort((left, right) => left.topicId.localeCompare(right.topicId)));
  }

  return byTopicId;
}
