import fs from "node:fs";
import path from "node:path";
import { slugify, writeJson } from "@/src/lib/fs";
import type {
  DesiredReplyMediaWishlistEntry,
} from "@/src/lib/reply-composer";

function getWishlistPath(): string {
  return path.join(process.cwd(), "data", "analysis", "reply-media-wishlist.json");
}

function readWishlist(): DesiredReplyMediaWishlistEntry[] {
  const wishlistPath = getWishlistPath();
  if (!fs.existsSync(wishlistPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(wishlistPath, "utf8")) as DesiredReplyMediaWishlistEntry[];
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())))).slice(0, limit);
}

function tokenizeLabel(value: string): string[] {
  const stopWords = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "on", "in", "meme"]);
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));
}

function labelsLookRelated(left: string, right: string): boolean {
  const leftTokens = tokenizeLabel(left);
  const rightTokens = tokenizeLabel(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const rightSet = new Set(rightTokens);
  const overlapCount = leftTokens.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
  const smallerCount = Math.min(leftTokens.length, rightTokens.length);
  return overlapCount >= 2 && overlapCount / smallerCount >= 0.6;
}

export function recordAssetWishlist(input: {
  usageId: string | null;
  goal: string;
  source: DesiredReplyMediaWishlistEntry["source"];
  queryLabels: string[];
  angle: string;
  tweetText: string | null;
}): DesiredReplyMediaWishlistEntry[] {
  const wishlistPath = getWishlistPath();
  const current = readWishlist();
  const byKey = new Map(current.map((entry) => [entry.key, entry]));
  const now = new Date().toISOString();
  const updated: DesiredReplyMediaWishlistEntry[] = [];

  for (const label of input.queryLabels) {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      continue;
    }

    const key = slugify(normalizedLabel);
    const existing = byKey.get(key);
    const next: DesiredReplyMediaWishlistEntry = existing
      ? {
          ...existing,
          label: existing.label.length >= normalizedLabel.length ? existing.label : normalizedLabel,
          occurrenceCount: existing.occurrenceCount + 1,
          lastSeenAt: now,
          usageIds: uniqueStrings([...existing.usageIds, input.usageId], 50),
          goals: Array.from(new Set([...existing.goals, input.goal])),
          exampleTweetTexts: uniqueStrings([...existing.exampleTweetTexts, input.tweetText], 10),
          angles: uniqueStrings([...existing.angles, input.angle], 20)
        }
      : {
          key,
          label: normalizedLabel,
          status: "pending",
          source: input.source,
          occurrenceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          usageIds: uniqueStrings([input.usageId], 50),
          goals: [input.goal],
          exampleTweetTexts: uniqueStrings([input.tweetText], 10),
          angles: uniqueStrings([input.angle], 20)
        };

    byKey.set(key, next);
    updated.push(next);
  }

  const nextWishlist = Array.from(byKey.values()).sort((left, right) => {
    if (right.occurrenceCount !== left.occurrenceCount) {
      return right.occurrenceCount - left.occurrenceCount;
    }

    return right.lastSeenAt.localeCompare(left.lastSeenAt);
  });

  writeJson(wishlistPath, nextWishlist);
  return updated;
}

export function recordReplyMediaWishlist(input: {
  usageId: string | null;
  goal: string;
  queryLabels: string[];
  angle: string;
  tweetText: string | null;
}): DesiredReplyMediaWishlistEntry[] {
  return recordAssetWishlist({
    ...input,
    source: "reply_composer"
  });
}

export function readReplyMediaWishlist(): DesiredReplyMediaWishlistEntry[] {
  return readWishlist();
}

export function setReplyMediaWishlistStatus(
  key: string,
  status: DesiredReplyMediaWishlistEntry["status"]
): DesiredReplyMediaWishlistEntry | null {
  const wishlistPath = getWishlistPath();
  const current = readWishlist();
  const index = current.findIndex((entry) => entry.key === key);
  if (index === -1) {
    return null;
  }

  const next = {
    ...current[index],
    status,
    lastSeenAt: new Date().toISOString()
  };
  current[index] = next;
  writeJson(wishlistPath, current);
  return next;
}

export function setReplyMediaWishlistStatuses(
  keys: string[],
  status: DesiredReplyMediaWishlistEntry["status"]
): DesiredReplyMediaWishlistEntry[] {
  if (keys.length === 0) {
    return [];
  }

  const wishlistPath = getWishlistPath();
  const keySet = new Set(keys);
  const current = readWishlist();
  const now = new Date().toISOString();
  const updated: DesiredReplyMediaWishlistEntry[] = [];

  for (let index = 0; index < current.length; index += 1) {
    if (!keySet.has(current[index].key)) {
      continue;
    }

    current[index] = {
      ...current[index],
      status,
      lastSeenAt: now
    };
    updated.push(current[index]);
  }

  writeJson(wishlistPath, current);
  return updated;
}

export function findRelatedReplyMediaWishlistKeys(input: {
  key: string;
  label: string;
  relatedLabels?: string[];
}): string[] {
  const current = readWishlist();
  const labels = [input.label, ...(input.relatedLabels ?? [])].filter(Boolean);

  return current
    .filter((entry) => {
      if (entry.key === input.key) {
        return true;
      }

      return labels.some((label) => labelsLookRelated(entry.label, label));
    })
    .map((entry) => entry.key);
}
