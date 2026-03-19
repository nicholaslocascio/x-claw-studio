import type { ExtractedTweet, RelativeEngagementBand } from "@/src/lib/types";

const REPLY_WEIGHT = 4;
const REPOST_WEIGHT = 3;
const BOOKMARK_WEIGHT = 5;
const LIKE_WEIGHT = 1;
const VIEW_SCALE = 0.02;
const FRESHNESS_HALF_LIFE_HOURS = 36;

function parseCompactNumber(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) {
    const fallback = Number(normalized);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  const amount = Number(match[1]);
  const suffix = match[2];
  if (!Number.isFinite(amount)) {
    return 0;
  }

  switch (suffix) {
    case "k":
      return Math.round(amount * 1_000);
    case "m":
      return Math.round(amount * 1_000_000);
    case "b":
      return Math.round(amount * 1_000_000_000);
    default:
      return Math.round(amount);
  }
}

function getTimestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeRelativeEngagementScore(input: {
  tweet: Pick<ExtractedTweet, "authorFollowerCount" | "createdAt" | "extraction" | "metrics">;
  nowMs?: number;
}): number | null {
  const followerCount = input.tweet.authorFollowerCount;
  if (!Number.isFinite(followerCount) || followerCount === null || followerCount <= 0) {
    return null;
  }

  const metrics = input.tweet.metrics;
  const replies = parseCompactNumber(metrics.replies);
  const reposts = parseCompactNumber(metrics.reposts);
  const likes = parseCompactNumber(metrics.likes);
  const bookmarks = parseCompactNumber(metrics.bookmarks);
  const views = parseCompactNumber(metrics.views);
  const rawEngagement =
    replies * REPLY_WEIGHT +
    reposts * REPOST_WEIGHT +
    bookmarks * BOOKMARK_WEIGHT +
    likes * LIKE_WEIGHT +
    views * VIEW_SCALE;

  if (rawEngagement <= 0) {
    return 0;
  }

  const nowMs = input.nowMs ?? Date.now();
  const timestampMs = getTimestampMs(input.tweet.createdAt) || getTimestampMs(input.tweet.extraction.extractedAt);
  const ageHours = timestampMs > 0 ? Math.max(0, (nowMs - timestampMs) / (1000 * 60 * 60)) : 0;
  const freshness = Math.exp((-Math.log(2) * ageHours) / FRESHNESS_HALF_LIFE_HOURS);
  const score = (rawEngagement / followerCount) * 1000 * freshness;

  return Number.isFinite(score) ? Number(score.toFixed(4)) : null;
}

export function classifyRelativeEngagementBand(score: number | null): RelativeEngagementBand | null {
  if (score === null || !Number.isFinite(score)) {
    return null;
  }

  if (score >= 8) {
    return "breakout";
  }

  if (score >= 3) {
    return "strong";
  }

  return "baseline";
}
