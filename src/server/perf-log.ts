function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isPerfLoggingEnabled(): boolean {
  return isTruthyEnvFlag(process.env.PERF_LOGS);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) {
    return "";
  }

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return ` ${entries
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")}`;
}

function logPerfLine(label: string, fields?: Record<string, unknown>): void {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  console.info(`[perf] ${label}${formatFields(fields)}`);
}

export function createPerfTrace(label: string, baseFields?: Record<string, unknown>) {
  const startedAt = Date.now();
  let lastMarkAt = startedAt;

  return {
    mark(stage: string, fields?: Record<string, unknown>) {
      const now = Date.now();
      logPerfLine(label, {
        ...baseFields,
        stage,
        elapsedMs: now - startedAt,
        sinceLastMs: now - lastMarkAt,
        elapsed: formatDuration(now - startedAt),
        sinceLast: formatDuration(now - lastMarkAt),
        ...fields
      });
      lastMarkAt = now;
    },
    end(fields?: Record<string, unknown>) {
      const now = Date.now();
      logPerfLine(label, {
        ...baseFields,
        stage: "completed",
        elapsedMs: now - startedAt,
        sinceLastMs: now - lastMarkAt,
        elapsed: formatDuration(now - startedAt),
        sinceLast: formatDuration(now - lastMarkAt),
        ...fields
      });
    },
    fail(error: unknown, fields?: Record<string, unknown>) {
      const now = Date.now();
      logPerfLine(label, {
        ...baseFields,
        stage: "failed",
        elapsedMs: now - startedAt,
        sinceLastMs: now - lastMarkAt,
        elapsed: formatDuration(now - startedAt),
        sinceLast: formatDuration(now - lastMarkAt),
        error: error instanceof Error ? error.message : String(error),
        ...fields
      });
    }
  };
}

export async function measurePerf<T>(
  label: string,
  fields: Record<string, unknown> | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const trace = createPerfTrace(label, fields);

  try {
    const result = await fn();
    trace.end();
    return result;
  } catch (error) {
    trace.fail(error);
    throw error;
  }
}
