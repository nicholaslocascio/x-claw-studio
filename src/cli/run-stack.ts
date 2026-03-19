import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import { createCappedLineLogWriter } from "@/src/server/capped-line-log";

dotenv.config();

const chromaContainer = process.env.CHROMA_CONTAINER || "twitter-trend-chroma";
const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
const restartDelayMs = Number(process.env.SUPERVISOR_RESTART_DELAY_MS || 2000);
const chromaCheckIntervalMs = Number(process.env.CHROMA_CHECK_INTERVAL_MS || 5000);
const startupWaitMs = Number(process.env.SUPERVISOR_STARTUP_WAIT_MS || 1500);
const portReleaseWaitMs = Number(process.env.SUPERVISOR_PORT_RELEASE_WAIT_MS || 4000);
const stackErrorLogPath =
  process.env.STACK_ERROR_LOG_PATH || path.join(process.cwd(), "data", "control", "logs", "stack-errors.log");
const stackErrorLogMaxLines = Number(process.env.STACK_ERROR_LOG_MAX_LINES || 10_000);
const nextPort = resolveNextPort();

interface ManagedProcess {
  name: string;
  command: string;
  args: string[];
  child: ChildProcess | null;
  stopping: boolean;
  port?: number;
  prepare?: () => Promise<void>;
}

const services: ManagedProcess[] = [
  {
    name: "next",
    command: "npm",
    args: ["run", "start"],
    child: null,
    stopping: false,
    port: nextPort,
    prepare: async () => {
      log("next", "building production app before start");
      await runCommand("npm", ["run", "build"]);
    }
  },
  {
    name: "scheduler",
    command: "npm",
    args: ["run", "scheduler"],
    child: null,
    stopping: false
  }
];

let shuttingDown = false;
let chromaTimer: NodeJS.Timeout | null = null;
const stackErrorLog = createCappedLineLogWriter({
  filePath: stackErrorLogPath,
  maxLines: stackErrorLogMaxLines
});

function log(service: string, message: string): void {
  console.log(`[${new Date().toISOString()}] [${service}] ${message}`);
}

function logError(service: string, message: string): void {
  const entry = `[${new Date().toISOString()}] [${service}] ${message}`;
  console.error(entry);
  stackErrorLog.appendLine(entry);
}

function pipeOutput(
  service: string,
  stream: NodeJS.ReadableStream | null,
  target: NodeJS.WriteStream,
  options?: { persistToErrorLog?: boolean }
): void {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      const entry = `[${service}] ${line}`;
      target.write(`${entry}\n`);
      if (options?.persistToErrorLog) {
        stackErrorLog.appendLine(`[${new Date().toISOString()}] ${entry}`);
      }
    }
  });
}

async function startManagedProcess(service: ManagedProcess): Promise<void> {
  if (shuttingDown) {
    return;
  }

  if (service.port) {
    await ensurePortAvailable(service);
  }

  if (service.prepare) {
    await service.prepare();
  }

  log(service.name, `starting: ${service.command} ${service.args.join(" ")}`);
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CHROMA_URL: chromaUrl
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  service.child = child;
  service.stopping = false;

  pipeOutput(service.name, child.stdout, process.stdout);
  pipeOutput(service.name, child.stderr, process.stderr, { persistToErrorLog: true });

  child.on("exit", (code, signal) => {
    service.child = null;
    const expected = shuttingDown || service.stopping;
    log(service.name, `exited code=${code ?? "null"} signal=${signal ?? "null"}`);

    if (!expected) {
      void restartManagedProcess(service);
    }
  });

  child.on("error", (error) => {
    logError(service.name, `spawn error: ${error.message}`);
  });
}

async function restartManagedProcess(service: ManagedProcess): Promise<void> {
  if (shuttingDown) {
    return;
  }

  log(service.name, `restarting in ${restartDelayMs}ms`);
  await delay(restartDelayMs);
  if (!service.child && !shuttingDown) {
    await startManagedProcess(service);
  }
}

function resolveNextPort(): number {
  const rawBaseUrl = process.env.APP_BASE_URL?.trim();
  if (rawBaseUrl) {
    try {
      const baseUrl = new URL(rawBaseUrl);
      if (baseUrl.port) {
        return Number(baseUrl.port);
      }

      return baseUrl.protocol === "https:" ? 443 : 80;
    } catch {
      logError("supervisor", `invalid APP_BASE_URL: ${rawBaseUrl}; falling back to port 4105`);
    }
  }

  return 4105;
}

function parsePortOwnerPids(stdout: string): number[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function listPortOwnerPids(port: number): Promise<number[]> {
  const result = await runCommand("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], true);
  if (result.code !== 0 && result.stderr.trim().length > 0) {
    logError("supervisor", `failed to inspect port ${port}: ${result.stderr.trim()}`);
  }
  return parsePortOwnerPids(result.stdout);
}

async function ensurePortAvailable(service: ManagedProcess): Promise<void> {
  if (!service.port) {
    return;
  }

  const pids = await listPortOwnerPids(service.port);
  if (pids.length === 0) {
    return;
  }

  log(service.name, `port ${service.port} is busy; stopping pid${pids.length === 1 ? "" : "s"} ${pids.join(", ")}`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(service.name, `failed to SIGTERM pid ${pid} on port ${service.port}: ${message}`);
    }
  }

  const deadline = Date.now() + portReleaseWaitMs;
  while (Date.now() < deadline) {
    await delay(200);
    if ((await listPortOwnerPids(service.port)).length === 0) {
      log(service.name, `port ${service.port} released after SIGTERM`);
      return;
    }
  }

  const stubbornPids = await listPortOwnerPids(service.port);
  for (const pid of stubbornPids) {
    try {
      log(service.name, `forcing pid ${pid} off port ${service.port}`);
      process.kill(pid, "SIGKILL");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(service.name, `failed to SIGKILL pid ${pid} on port ${service.port}: ${message}`);
    }
  }

  const remainingPids = await listPortOwnerPids(service.port);
  if (remainingPids.length > 0) {
    throw new Error(`port ${service.port} is still busy after cleanup: ${remainingPids.join(", ")}`);
  }
}

function runCommand(command: string, args: string[], ignoreFailure = false): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (ignoreFailure) {
        resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      if (!ignoreFailure && exitCode !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${exitCode}: ${stderr || stdout}`));
        return;
      }
      resolve({ code: exitCode, stdout, stderr });
    });
  });
}

async function heartbeat(): Promise<boolean> {
  const url = new URL(chromaUrl);
  const base = `${url.protocol}//${url.host}`;

  for (const endpoint of ["/api/v2/heartbeat", "/api/v1/heartbeat"]) {
    try {
      const response = await fetch(`${base}${endpoint}`);
      if (response.ok) {
        return true;
      }
    } catch {
      // ignore and try next endpoint
    }
  }

  return false;
}

async function ensureChromaRunning(forceRestart = false): Promise<void> {
  const healthy = await heartbeat();
  if (healthy && !forceRestart) {
    return;
  }

  log("chroma", forceRestart ? "forcing restart" : "heartbeat failed; restarting container");
  await runCommand("docker", ["rm", "-f", chromaContainer], true);
  await runCommand("docker", ["run", "-d", "--name", chromaContainer, "-p", "8000:8000", "chromadb/chroma:latest"]);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await heartbeat()) {
      log("chroma", "healthy");
      return;
    }
    await delay(1000);
  }

  throw new Error("Chroma failed to become healthy after restart");
}

async function startChromaMonitor(): Promise<void> {
  await ensureChromaRunning();
  chromaTimer = setInterval(() => {
    void ensureChromaRunning().catch((error) => {
      logError("chroma", `monitor error: ${error.message}`);
    });
  }, chromaCheckIntervalMs);
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log("supervisor", "shutting down");

  if (chromaTimer) {
    clearInterval(chromaTimer);
    chromaTimer = null;
  }

  for (const service of services) {
    if (service.child) {
      service.stopping = true;
      service.child.kill("SIGTERM");
    }
  }

  await delay(1500);

  for (const service of services) {
    if (service.child && !service.child.killed) {
      service.child.kill("SIGKILL");
    }
  }

  process.exit(exitCode);
}

async function main(): Promise<void> {
  stackErrorLog.appendLine(`===== stack restart ${new Date().toISOString()} =====`);
  log("supervisor", `starting stack with CHROMA_URL=${chromaUrl}`);
  log("supervisor", `error log file: ${stackErrorLogPath} (max ${stackErrorLogMaxLines} lines)`);
  await startChromaMonitor();
  for (const service of services) {
    await startManagedProcess(service);
    await delay(startupWaitMs);
  }
  log("supervisor", "stack is running; press Ctrl+C to stop");
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

process.on("uncaughtException", (error) => {
  logError("supervisor", `uncaught exception: ${error.message}`);
  void shutdown(1);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logError("supervisor", `unhandled rejection: ${message}`);
  void shutdown(1);
});

void main().catch((error) => {
  logError("supervisor", `startup failed: ${error.message}`);
  void shutdown(1);
});
