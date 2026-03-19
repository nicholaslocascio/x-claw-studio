import fs from "node:fs";
import path from "node:path";
import { slugify, writeJson } from "@/src/lib/fs";
import type { PriorityAccountEntry, PriorityAccountsConfig } from "@/src/lib/types";

const priorityAccountsPath = path.join(process.cwd(), "data", "control", "priority-accounts.json");

const DEFAULT_PRIORITY_ACCOUNTS_CONFIG: PriorityAccountsConfig = {
  enabled: true,
  updatedAt: new Date(0).toISOString(),
  lastScheduledRunAt: null,
  accounts: []
};

function normalizeUsername(value: string): string | null {
  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_]{1,15}$/i.test(normalized) ? normalized : null;
}

function normalizeEntry(entry: PriorityAccountEntry): PriorityAccountEntry {
  return {
    key: slugify(entry.username) || entry.username,
    username: entry.username.toLowerCase(),
    label: entry.label?.trim() || null,
    userId: entry.userId?.trim() || null,
    lastSeenTweetId: entry.lastSeenTweetId?.trim() || null,
    lastCheckedAt: entry.lastCheckedAt ?? null,
    lastCapturedAt: entry.lastCapturedAt ?? null,
    lastCaptureCount: Number.isFinite(entry.lastCaptureCount) ? Math.max(0, Math.floor(entry.lastCaptureCount)) : 0,
    lastError: entry.lastError?.trim() || null
  };
}

function normalizeConfig(config: PriorityAccountsConfig): PriorityAccountsConfig {
  const seen = new Set<string>();
  const accounts = config.accounts
    .map((entry) => {
      const username = normalizeUsername(entry.username);
      if (!username || seen.has(username)) {
        return null;
      }

      seen.add(username);
      return normalizeEntry({
        ...entry,
        username,
        key: slugify(username) || username
      });
    })
    .filter((value): value is PriorityAccountEntry => Boolean(value))
    .sort((left, right) => left.username.localeCompare(right.username));

  return {
    enabled: config.enabled !== false,
    updatedAt: config.updatedAt ?? new Date().toISOString(),
    lastScheduledRunAt: config.lastScheduledRunAt ?? null,
    accounts
  };
}

export function readPriorityAccountsConfig(): PriorityAccountsConfig {
  if (!fs.existsSync(priorityAccountsPath)) {
    return DEFAULT_PRIORITY_ACCOUNTS_CONFIG;
  }

  return normalizeConfig(JSON.parse(fs.readFileSync(priorityAccountsPath, "utf8")) as PriorityAccountsConfig);
}

export function writePriorityAccountsConfig(input: {
  enabled: boolean;
  handles: string;
}): PriorityAccountsConfig {
  const current = readPriorityAccountsConfig();
  const parsedUsernames = Array.from(
    new Set(
      input.handles
        .split(/[\n,]+/)
        .map((value) => normalizeUsername(value))
        .filter((value): value is string => Boolean(value))
    )
  ).sort();
  const currentByUsername = new Map(current.accounts.map((entry) => [entry.username, entry]));
  const accounts = parsedUsernames.map((username) => {
    const existing = currentByUsername.get(username);
    return normalizeEntry(
      existing ?? {
        key: slugify(username) || username,
        username,
        label: null,
        userId: null,
        lastSeenTweetId: null,
        lastCheckedAt: null,
        lastCapturedAt: null,
        lastCaptureCount: 0,
        lastError: null
      }
    );
  });

  const next = normalizeConfig({
    enabled: input.enabled,
    updatedAt: new Date().toISOString(),
    lastScheduledRunAt: current.lastScheduledRunAt,
    accounts
  });
  writeJson(priorityAccountsPath, next);
  return next;
}

export function updatePriorityAccount(entry: PriorityAccountEntry): PriorityAccountsConfig {
  const current = readPriorityAccountsConfig();
  const accounts = current.accounts.map((existing) => (existing.username === entry.username ? normalizeEntry(entry) : existing));
  const next = normalizeConfig({
    ...current,
    updatedAt: new Date().toISOString(),
    accounts
  });
  writeJson(priorityAccountsPath, next);
  return next;
}

export function markPriorityAccountsRunCompleted(updatedAccounts: PriorityAccountEntry[]): PriorityAccountsConfig {
  const current = readPriorityAccountsConfig();
  const updatedByUsername = new Map(updatedAccounts.map((entry) => [entry.username, normalizeEntry(entry)]));
  const accounts = current.accounts.map((entry) => updatedByUsername.get(entry.username) ?? entry);
  const next = normalizeConfig({
    ...current,
    updatedAt: new Date().toISOString(),
    lastScheduledRunAt: new Date().toISOString(),
    accounts
  });
  writeJson(priorityAccountsPath, next);
  return next;
}

export function listPriorityAccountUsernames(): Set<string> {
  return new Set(readPriorityAccountsConfig().accounts.map((entry) => entry.username));
}

export function formatPriorityAccountHandles(config = readPriorityAccountsConfig()): string {
  return config.accounts.map((entry) => `@${entry.username}`).join("\n");
}
