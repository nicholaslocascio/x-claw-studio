import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ensureDir, writeJson } from "@/src/lib/fs";
import type { RunHistoryEntry, RunTask, SchedulerConfig } from "@/src/lib/types";

const projectRoot = process.cwd();
const controlDir = path.join(projectRoot, "data", "control");
const logsDir = path.join(controlDir, "logs");
const schedulerConfigPath = path.join(controlDir, "scheduler.json");
const runHistoryPath = path.join(controlDir, "run-history.json");
const schedulerEventsPath = path.join(logsDir, "scheduler.log");
const DEFAULT_STALE_RUN_AFTER_MS = Number(process.env.RUN_CONTROL_STALE_AFTER_MS || 6 * 60 * 60 * 1000);

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: false,
  frequency: "daily",
  hour: 9,
  minute: 0,
  times: ["09:00"],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
  updatedAt: new Date().toISOString(),
  lastEvaluatedAt: null,
  lastTriggeredAt: null,
  lastProcessedSlotAt: null,
  lastSkippedAt: null,
  lastSkipReason: null
};

const TASK_TO_COMMAND: Record<RunTask, { command: string; args: string[] }> = {
  crawl_timeline: { command: "npm", args: ["run", "crawl:timeline"] },
  crawl_x_api: { command: "npm", args: ["run", "crawl:x-api"] },
  capture_x_api_timeline: { command: "npm", args: ["run", "capture:x-api-timeline"] },
  capture_x_api_tweet: { command: "npm", args: ["run", "capture:x-api-tweet"] },
  capture_x_api_tweet_and_compose_replies: {
    command: "npm",
    args: ["run", "capture:x-api-tweet-and-compose-replies"]
  },
  analyze_missing: { command: "npm", args: ["run", "analyze:missing"] },
  analyze_topics: { command: "npm", args: ["run", "analyze:topics"] },
  rebuild_media_assets: { command: "npm", args: ["run", "media:rebuild"] },
  backfill_media_native_types: { command: "npm", args: ["run", "media:backfill-native-types"] }
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDir(path.dirname(filePath));
  writeJson(filePath, data);
}

function isoNow(): string {
  return new Date().toISOString();
}

function toDateParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute")
  };
}

function sameLocalDay(a: Date, b: Date, timezone: string): boolean {
  const aParts = toDateParts(a, timezone);
  const bParts = toDateParts(b, timezone);

  return (
    aParts.year === bParts.year &&
    aParts.month === bParts.month &&
    aParts.day === bParts.day
  );
}

function sameLocalMinute(a: Date, b: Date, timezone: string): boolean {
  const aParts = toDateParts(a, timezone);
  const bParts = toDateParts(b, timezone);

  return (
    aParts.year === bParts.year &&
    aParts.month === bParts.month &&
    aParts.day === bParts.day &&
    aParts.hour === bParts.hour &&
    aParts.minute === bParts.minute
  );
}

function truncateToMinute(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  );
}

function formatLocalDayKey(date: Date, timezone: string): string {
  const parts = toDateParts(date, timezone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatLocalTimeKey(date: Date, timezone: string): string {
  const parts = toDateParts(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function getStartAnchorForCurrentLocalDay(now: Date, timezone: string): Date {
  const nowMinute = truncateToMinute(now);
  const currentDayKey = formatLocalDayKey(nowMinute, timezone);
  let cursor = nowMinute;

  while (formatLocalDayKey(new Date(cursor.getTime() - 60_000), timezone) === currentDayKey) {
    cursor = new Date(cursor.getTime() - 60_000);
  }

  return new Date(cursor.getTime() - 60_000);
}

export function findLatestDueScheduleSlot(
  now: Date,
  timezone: string,
  times: string[],
  lastProcessedSlotAt: string | null
): string | null {
  const normalizedTimes = normalizeScheduleTimes(times, DEFAULT_SCHEDULER_CONFIG.hour, DEFAULT_SCHEDULER_CONFIG.minute);
  const scheduledTimes = new Set(normalizedTimes);
  const end = truncateToMinute(now);
  const start = lastProcessedSlotAt
    ? truncateToMinute(new Date(lastProcessedSlotAt))
    : getStartAnchorForCurrentLocalDay(end, timezone);

  if (Number.isNaN(start.getTime()) || start.getTime() >= end.getTime()) {
    return scheduledTimes.has(formatLocalTimeKey(end, timezone)) && start.getTime() < end.getTime()
      ? end.toISOString()
      : null;
  }

  const seenSlots = new Set<string>();
  let latestDueSlot: string | null = null;

  for (let cursor = new Date(start.getTime() + 60_000); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 60_000)) {
    const timeKey = formatLocalTimeKey(cursor, timezone);
    if (!scheduledTimes.has(timeKey)) {
      continue;
    }

    const slotKey = `${formatLocalDayKey(cursor, timezone)} ${timeKey}`;
    if (seenSlots.has(slotKey)) {
      continue;
    }

    seenSlots.add(slotKey);
    latestDueSlot = cursor.toISOString();
  }

  return latestDueSlot;
}

function normalizeScheduleTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeScheduleTimes(values: string[] | undefined, fallbackHour: number, fallbackMinute: number): string[] {
  const fromValues = (values ?? [])
    .map((value) => normalizeScheduleTime(value))
    .filter((value): value is string => value !== null);

  const unique = Array.from(
    new Set(
      (fromValues.length > 0
        ? fromValues
        : [`${String(fallbackHour).padStart(2, "0")}:${String(fallbackMinute).padStart(2, "0")}`]
      ).sort()
    )
  );

  return unique.length > 0 ? unique : DEFAULT_SCHEDULER_CONFIG.times;
}

function normalizeSchedulerConfig(config: SchedulerConfig): SchedulerConfig {
  const times = normalizeScheduleTimes(config.times, config.hour, config.minute);
  const [firstHour, firstMinute] = times[0].split(":").map(Number);

  return {
    ...config,
    hour: firstHour,
    minute: firstMinute,
    times,
    lastProcessedSlotAt: config.lastProcessedSlotAt ?? null,
    lastSkippedAt: config.lastSkippedAt ?? null,
    lastSkipReason: config.lastSkipReason ?? null
  };
}

export function readSchedulerConfig(): SchedulerConfig {
  const config = readJsonFile<SchedulerConfig>(schedulerConfigPath, DEFAULT_SCHEDULER_CONFIG);
  return normalizeSchedulerConfig(config);
}

export function writeSchedulerConfig(
  partial: Partial<Pick<SchedulerConfig, "enabled" | "hour" | "minute" | "timezone" | "times">>
): SchedulerConfig {
  const current = readSchedulerConfig();
  const fallbackHour = partial.hour ?? current.hour ?? DEFAULT_SCHEDULER_CONFIG.hour;
  const fallbackMinute = partial.minute ?? current.minute ?? DEFAULT_SCHEDULER_CONFIG.minute;
  const times = normalizeScheduleTimes(partial.times ?? current.times, fallbackHour, fallbackMinute);
  const [hour, minute] = times[0].split(":").map(Number);
  const next: SchedulerConfig = {
    ...current,
    ...partial,
    frequency: "daily",
    hour,
    minute,
    times,
    timezone: partial.timezone ?? current.timezone ?? DEFAULT_SCHEDULER_CONFIG.timezone,
    updatedAt: isoNow()
  };

  writeJsonFile(schedulerConfigPath, next);
  return next;
}

export function readRunHistory(): RunHistoryEntry[] {
  return readJsonFile<RunHistoryEntry[]>(runHistoryPath, []).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
}

function writeRunHistory(entries: RunHistoryEntry[]): void {
  writeJsonFile(runHistoryPath, entries);
}

function updateRunHistoryEntry(runControlId: string, updater: (entry: RunHistoryEntry) => RunHistoryEntry) {
  const entries = readRunHistory();
  const nextEntries = entries.map((entry) =>
    entry.runControlId === runControlId ? updater(entry) : entry
  );
  writeRunHistory(nextEntries);
}

function appendLog(logPath: string, message: string): void {
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, message);
}

function appendSchedulerEvent(message: string): void {
  appendLog(schedulerEventsPath, `[${isoNow()}] ${message}\n`);
}

function discoverLatestManifestRunId(): string | null {
  const rawDir = path.join(projectRoot, "data", "raw");
  if (!fs.existsSync(rawDir)) {
    return null;
  }

  const runIds = fs
    .readdirSync(rawDir)
    .filter((entry) => fs.existsSync(path.join(rawDir, entry, "manifest.json")))
    .sort();

  return runIds.at(-1) ?? null;
}

function reconcileStaleRunningEntries(
  entries: RunHistoryEntry[],
  now: Date,
  staleAfterMs = DEFAULT_STALE_RUN_AFTER_MS
): { entries: RunHistoryEntry[]; changed: boolean; staleRunIds: string[] } {
  const nowMs = now.getTime();
  const staleRunIds: string[] = [];

  const nextEntries = entries.map((entry) => {
    if (entry.status !== "running") {
      return entry;
    }

    const startedAtMs = new Date(entry.startedAt).getTime();
    if (Number.isNaN(startedAtMs) || nowMs - startedAtMs < staleAfterMs) {
      return entry;
    }

    staleRunIds.push(entry.runControlId);
    return {
      ...entry,
      status: "failed" as const,
      completedAt: now.toISOString(),
      errorMessage: `Marked failed after exceeding stale run threshold of ${Math.round(staleAfterMs / 60_000)} minutes without a completion update.`
    };
  });

  return {
    entries: nextEntries,
    changed: staleRunIds.length > 0,
    staleRunIds
  };
}

function findActiveRun(entries: RunHistoryEntry[], task: RunTask): RunHistoryEntry | null {
  return entries.find((entry) => entry.task === task && entry.status === "running") ?? null;
}

export function triggerTask(
  task: RunTask,
  trigger: "manual" | "scheduled",
  options?: {
    xStatusUrl?: string | null;
    topicBatchLimit?: number | null;
  }
): RunHistoryEntry {
  ensureDir(logsDir);

  const startedAt = isoNow();
  const runControlId = `${task}-${startedAt.replace(/[:.]/g, "-")}`;
  const logPath = path.join(logsDir, `${runControlId}.log`);
  const historyEntry: RunHistoryEntry = {
    runControlId,
    task,
    trigger,
    status: "running",
    startedAt,
    completedAt: null,
    exitCode: null,
    errorMessage: null,
    logPath: path.relative(projectRoot, logPath),
    manifestRunId: null
  };

  const entries = readRunHistory();
  writeRunHistory([historyEntry, ...entries]);
  appendLog(logPath, `[${startedAt}] started ${task} (${trigger})\n`);
  if (options?.xStatusUrl) {
    appendLog(logPath, `[${startedAt}] X_STATUS_URL=${options.xStatusUrl}\n`);
  }
  if (typeof options?.topicBatchLimit === "number") {
    appendLog(logPath, `[${startedAt}] ANALYZE_TOPICS_DEFAULT_LIMIT=${options.topicBatchLimit}\n`);
  }

  const { command, args } = TASK_TO_COMMAND[task];
  const child = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(options?.xStatusUrl ? { OPENCLAW_START_URL: options.xStatusUrl } : {}),
      ...(typeof options?.topicBatchLimit === "number"
        ? { ANALYZE_TOPICS_DEFAULT_LIMIT: String(options.topicBatchLimit) }
        : {})
    }
  });

  child.stdout?.on("data", (chunk: Buffer | string) => {
    appendLog(logPath, chunk.toString());
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    appendLog(logPath, chunk.toString());
  });

  child.on("error", (error) => {
    updateRunHistoryEntry(runControlId, (entry) => ({
      ...entry,
      status: "failed",
      completedAt: isoNow(),
      errorMessage: error.message
    }));
    appendLog(logPath, `\n[${isoNow()}] spawn error: ${error.message}\n`);
  });

  child.on("close", (code) => {
    const manifestRunId =
      task === "crawl_timeline" ||
      task === "crawl_x_api" ||
      task === "capture_x_api_timeline" ||
      task === "capture_x_api_tweet" ||
      task === "capture_x_api_tweet_and_compose_replies"
        ? discoverLatestManifestRunId()
        : null;
    updateRunHistoryEntry(runControlId, (entry) => ({
      ...entry,
      status: code === 0 ? "completed" : "failed",
      completedAt: isoNow(),
      exitCode: code,
      errorMessage: code === 0 ? null : `Process exited with code ${code}`,
      manifestRunId
    }));
    appendLog(logPath, `\n[${isoNow()}] completed with code ${code}\n`);
  });

  child.unref();
  return historyEntry;
}

export function evaluateSchedule(now = new Date()): {
  triggered: boolean;
  config: SchedulerConfig;
  entry: RunHistoryEntry | null;
} {
  const config = readSchedulerConfig();
  const nowIso = now.toISOString();
  const history = readRunHistory();
  const reconciledHistory = reconcileStaleRunningEntries(history, now);

  if (reconciledHistory.changed) {
    writeRunHistory(reconciledHistory.entries);
    for (const runControlId of reconciledHistory.staleRunIds) {
      appendSchedulerEvent(`reconciled stale run history entry ${runControlId}`);
    }
  }

  const nextConfig: SchedulerConfig = {
    ...config,
    lastEvaluatedAt: nowIso
  };

  if (!config.enabled) {
    writeJsonFile(schedulerConfigPath, nextConfig);
    return { triggered: false, config: nextConfig, entry: null };
  }

  const lastProcessedSlotAt = config.lastProcessedSlotAt ?? config.lastTriggeredAt;
  const dueSlotAt = findLatestDueScheduleSlot(now, config.timezone, config.times, lastProcessedSlotAt);

  if (!dueSlotAt) {
    writeJsonFile(schedulerConfigPath, nextConfig);
    return { triggered: false, config: nextConfig, entry: null };
  }

  const activeRun = findActiveRun(reconciledHistory.entries, "crawl_x_api");
  if (activeRun) {
    const skippedConfig: SchedulerConfig = {
      ...nextConfig,
      lastProcessedSlotAt: dueSlotAt,
      lastSkippedAt: nowIso,
      lastSkipReason: `Skipped scheduled crawl for slot ${dueSlotAt} because ${activeRun.runControlId} is still running.`
    };
    writeJsonFile(schedulerConfigPath, skippedConfig);
    appendSchedulerEvent(`skipped slot ${dueSlotAt}; active crawl ${activeRun.runControlId} is still running`);
    return { triggered: false, config: skippedConfig, entry: null };
  }

  const entry = triggerTask("crawl_x_api", "scheduled");
  const updatedConfig: SchedulerConfig = {
    ...nextConfig,
    lastTriggeredAt: entry.startedAt,
    lastProcessedSlotAt: dueSlotAt,
    lastSkippedAt: null,
    lastSkipReason: null
  };
  writeJsonFile(schedulerConfigPath, updatedConfig);
  appendSchedulerEvent(`triggered scheduled crawl ${entry.runControlId} for slot ${dueSlotAt}`);
  appendLog(path.join(projectRoot, entry.logPath), `[${nowIso}] scheduled slot ${dueSlotAt}\n`);
  return { triggered: true, config: updatedConfig, entry };
}

export function getRunLog(logRelativePath: string): string {
  const absolutePath = path.join(projectRoot, logRelativePath);
  if (!fs.existsSync(absolutePath)) {
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}
