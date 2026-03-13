import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCliCommand } from "@/src/server/cli-process";

const cliFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(cliFilePath), "..", "..");
const geminiCliPath = process.env.GEMINI_CLI_PATH || "gemini";
const geminiCliModel = process.env.GEMINI_CLI_MODEL || "gemini-2.5-flash";
const geminiTimeoutMs = Number(process.env.GEMINI_CLI_TIMEOUT_MS || 120_000);

function stripMarkdownFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Gemini CLI returned empty output");
  }

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const objectIndex = trimmed.indexOf("{");
  if (objectIndex === -1) {
    throw new Error(`Gemini CLI did not return JSON. Output was: ${trimmed.slice(0, 200)}`);
  }

  return trimmed.slice(objectIndex);
}

export function parseGeminiJsonResponse<T>(stdout: string, parse: (value: unknown) => T): T {
  const raw = extractJsonPayload(stdout);

  let parsedEnvelope: unknown = raw;
  try {
    parsedEnvelope = JSON.parse(raw);
  } catch {
    return parse(JSON.parse(stripMarkdownFences(raw)));
  }

  if (
    parsedEnvelope &&
    typeof parsedEnvelope === "object" &&
    "response" in parsedEnvelope &&
    typeof parsedEnvelope.response === "string"
  ) {
    return parse(JSON.parse(stripMarkdownFences(parsedEnvelope.response)));
  }

  return parse(parsedEnvelope);
}

export async function runGeminiPrompt(prompt: string): Promise<string> {
  const result = await runCliCommand({
    command: geminiCliPath,
    args: ["--output-format", "json", "-m", geminiCliModel, "-p", prompt],
    cwd: repoRoot,
    env: {
      ...process.env,
      DOTENV_CONFIG_QUIET: "true"
    },
    timeoutMs: geminiTimeoutMs
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Gemini CLI exited with code ${result.exitCode}`);
  }

  return result.stdout;
}
