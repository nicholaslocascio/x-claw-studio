import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface CliCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCliCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
}): Promise<CliCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | null = null;

    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Command timed out after ${input.timeoutMs}ms: ${input.command}`));
      }, input.timeoutMs);
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    if (typeof input.stdin === "string") {
      child.stdin.setDefaultEncoding("utf8");
      child.stdin.end(input.stdin);
    } else {
      child.stdin.end();
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      reject(error);
    });
    child.on("close", (exitCode) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1
      });
    });
  });
}

export function spawnDetachedNodeScript(input: {
  cwd: string;
  scriptPath: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const tsxCliPath = path.join(input.cwd, "node_modules", "tsx", "dist", "cli.mjs");

  if (!fs.existsSync(tsxCliPath)) {
    throw new Error(`Missing tsx CLI at ${tsxCliPath}`);
  }

  if (!fs.existsSync(input.scriptPath)) {
    throw new Error(`Missing script at ${input.scriptPath}`);
  }

  const child = spawn(process.execPath, [tsxCliPath, input.scriptPath], {
    cwd: input.cwd,
    env: input.env ?? process.env,
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  return true;
}
