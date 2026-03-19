import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import type { GeneratedDraftKind } from "@/src/lib/generated-drafts";
import { ensureDir, slugify, writeJson } from "@/src/lib/fs";

const projectRoot = process.cwd();
const composeRunsDir = path.join(projectRoot, "data", "analysis", "compose-runs");
const composeRunStorage = new AsyncLocalStorage<ComposeRunLogContext>();

export interface ComposeRunLogDescriptor {
  runId: string;
  logDir: string;
  relativeLogDir: string;
}

export interface ComposeRunLogHandle {
  runId: string;
  logDir: string;
  relativeLogDir: string;
  appendEvent(event: Record<string, unknown>): void;
  writeTextArtifact(label: string, value: string, extension?: string): string;
  writeJsonArtifact(label: string, value: unknown): string;
  recordProgress(event: unknown): void;
  recordError(label: string, error: unknown, extra?: Record<string, unknown>): void;
  finalize(status: "completed" | "failed", extra?: Record<string, unknown>): void;
}

interface ComposeRunLogContext extends ComposeRunLogDescriptor {
  sequence: number;
}

function isoNow(): string {
  return new Date().toISOString();
}

function sanitizeLabel(value: string): string {
  const normalized = slugify(value);
  return normalized || "artifact";
}

function appendNdjson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`);
}

function formatError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null
    };
  }

  return {
    message: String(error),
    stack: null
  };
}

function createArtifactPath(context: ComposeRunLogContext, label: string, extension: string): string {
  context.sequence += 1;
  const prefix = String(context.sequence).padStart(3, "0");
  return path.join(context.logDir, `${prefix}-${sanitizeLabel(label)}.${extension.replace(/^\./, "")}`);
}

function writeTextArtifact(context: ComposeRunLogContext, label: string, value: string, extension = "txt"): string {
  const filePath = createArtifactPath(context, label, extension);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
  return filePath;
}

function writeJsonArtifact(context: ComposeRunLogContext, label: string, value: unknown): string {
  const filePath = createArtifactPath(context, label, "json");
  writeJson(filePath, value);
  return filePath;
}

function appendEvent(context: ComposeRunLogContext, event: Record<string, unknown>): void {
  appendNdjson(path.join(context.logDir, "events.ndjson"), {
    timestamp: isoNow(),
    ...event
  });
}

export function createComposeRunLog(input: {
  kind: GeneratedDraftKind;
  draftId: string;
  route: string;
  request: unknown;
}): ComposeRunLogDescriptor {
  const startedAt = isoNow();
  const runId = `${input.kind}-${startedAt.replace(/[:.]/g, "-")}-${sanitizeLabel(input.draftId).slice(0, 48)}`;
  const logDir = path.join(composeRunsDir, runId);
  const relativeLogDir = path.relative(projectRoot, logDir);

  ensureDir(logDir);
  writeJson(path.join(logDir, "metadata.json"), {
    runId,
    draftId: input.draftId,
    kind: input.kind,
    route: input.route,
    startedAt
  });
  writeJson(path.join(logDir, "request.json"), input.request);
  appendNdjson(path.join(logDir, "events.ndjson"), {
    timestamp: startedAt,
    type: "run_started",
    kind: input.kind,
    route: input.route,
    draftId: input.draftId
  });

  return {
    runId,
    logDir,
    relativeLogDir
  };
}

export async function runWithComposeRunLog<T>(
  descriptor: ComposeRunLogDescriptor,
  fn: () => Promise<T>
): Promise<T> {
  const context: ComposeRunLogContext = {
    ...descriptor,
    sequence: 0
  };

  return composeRunStorage.run(context, fn);
}

export function writeComposeRunJson(descriptor: ComposeRunLogDescriptor, fileName: string, value: unknown): void {
  writeJson(path.join(descriptor.logDir, fileName), value);
}

export function finalizeComposeRun(
  descriptor: ComposeRunLogDescriptor,
  status: "completed" | "failed",
  extra?: Record<string, unknown>
): void {
  writeJson(path.join(descriptor.logDir, "status.json"), {
    status,
    finishedAt: isoNow(),
    ...extra
  });
  appendNdjson(path.join(descriptor.logDir, "events.ndjson"), {
    timestamp: isoNow(),
    type: "run_finished",
    status,
    ...extra
  });
}

export function recordComposeRunError(
  descriptor: ComposeRunLogDescriptor,
  label: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const formatted = formatError(error);
  writeJson(path.join(descriptor.logDir, `${sanitizeLabel(label)}-error.json`), {
    ...formatted,
    ...extra
  });
  appendNdjson(path.join(descriptor.logDir, "events.ndjson"), {
    timestamp: isoNow(),
    type: "error",
    label,
    ...formatted,
    ...extra
  });
}

export function getCurrentComposeRunLog(): ComposeRunLogHandle | null {
  const context = composeRunStorage.getStore();
  if (!context) {
    return null;
  }

  return {
    runId: context.runId,
    logDir: context.logDir,
    relativeLogDir: context.relativeLogDir,
    appendEvent(event: Record<string, unknown>) {
      appendEvent(context, event);
    },
    writeTextArtifact(label: string, value: string, extension?: string) {
      return writeTextArtifact(context, label, value, extension);
    },
    writeJsonArtifact(label: string, value: unknown) {
      return writeJsonArtifact(context, label, value);
    },
    recordProgress(event: unknown) {
      appendNdjson(path.join(context.logDir, "progress.ndjson"), {
        timestamp: isoNow(),
        event
      });
      appendEvent(context, {
        type: "progress",
        event
      });
    },
    recordError(label: string, error: unknown, extra?: Record<string, unknown>) {
      const formatted = formatError(error);
      writeJsonArtifact(context, `${label}-error`, {
        ...formatted,
        ...extra
      });
      appendEvent(context, {
        type: "error",
        label,
        ...formatted,
        ...extra
      });
    },
    finalize(status: "completed" | "failed", extra?: Record<string, unknown>) {
      writeJson(path.join(context.logDir, "status.json"), {
        status,
        finishedAt: isoNow(),
        ...extra
      });
      appendEvent(context, {
        type: "run_finished",
        status,
        ...extra
      });
    }
  };
}
