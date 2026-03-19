import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCliCommand } from "@/src/server/cli-process";
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";

export type ComposeModelProvider = "codex-exec" | "gemini-cli";

interface RunComposePromptInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

const cliFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(cliFilePath), "..", "..");
const geminiCliPath = process.env.GEMINI_CLI_PATH || "gemini";
const geminiCliModel = process.env.GEMINI_CLI_MODEL || "gemini-2.5-flash";
const geminiTimeoutMs = Number(process.env.GEMINI_CLI_TIMEOUT_MS || 120_000);
const codexCliPath = process.env.CODEX_CLI_PATH || "codex";
const codexCliModel = process.env.CODEX_CLI_MODEL?.trim() || null;
const codexTimeoutMs = Number(process.env.CODEX_CLI_TIMEOUT_MS || 240_000);

function stripMarkdownFences(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Compose model returned empty output");
  }

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const objectIndex = trimmed.indexOf("{");
  if (objectIndex === -1) {
    throw new Error(`Compose model did not return JSON. Output was: ${trimmed.slice(0, 200)}`);
  }

  return trimmed.slice(objectIndex);
}

export function parseComposeJsonResponse<T>(stdout: string, parse: (value: unknown) => T): T {
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

function normalizeComposeProvider(value: string | null | undefined): ComposeModelProvider {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (!normalized || normalized === "codex" || normalized === "codex-exec") {
    return "codex-exec";
  }
  if (normalized === "gemini" || normalized === "gemini-cli") {
    return "gemini-cli";
  }

  throw new Error(`Unsupported compose model provider: ${value}`);
}

export function getComposeModelProvider(): ComposeModelProvider {
  return normalizeComposeProvider(process.env.COMPOSE_MODEL_PROVIDER);
}

function isImageAttachmentPath(filePath: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(path.extname(filePath).toLowerCase());
}

async function runGeminiComposePrompt(input: RunComposePromptInput): Promise<string> {
  const result = await runCliCommand({
    command: geminiCliPath,
    args: ["--output-format", "json", "-m", geminiCliModel, "-p", input.prompt],
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

async function runCodexComposePrompt(input: RunComposePromptInput): Promise<string> {
  const imagePaths = Array.from(new Set((input.imagePaths ?? []).filter(isImageAttachmentPath)));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "twitter-trend-codex-exec-"));
  const outputPath = path.join(tempDir, "last-message.txt");

  try {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--cd",
      repoRoot,
      "--full-auto",
      "--output-last-message",
      outputPath
    ];

    if (codexCliModel) {
      args.push("-m", codexCliModel);
    }

    for (const imagePath of imagePaths) {
      args.push("--image", imagePath);
    }

    args.push("-");

    const result = await runCliCommand({
      command: codexCliPath,
      args,
      cwd: repoRoot,
      env: {
        ...process.env,
        DOTENV_CONFIG_QUIET: "true"
      },
      stdin: input.prompt,
      timeoutMs: codexTimeoutMs
    });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `Codex exec exited with code ${result.exitCode}`);
    }

    const output = await fs.readFile(outputPath, "utf8");
    if (!output.trim()) {
      throw new Error("Codex exec returned empty output");
    }

    return output;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function runComposePromptWithProvider(
  provider: ComposeModelProvider,
  input: RunComposePromptInput
): Promise<string> {
  const logger = getCurrentComposeRunLog();
  const startedAt = Date.now();
  const stepLabel = input.label ?? "compose";

  logger?.appendEvent({
    type: "model_call_started",
    provider,
    label: stepLabel,
    imageCount: input.imagePaths?.length ?? 0
  });
  logger?.writeTextArtifact(`model-${stepLabel}-${provider}-prompt`, input.prompt, "md");
  if (input.imagePaths && input.imagePaths.length > 0) {
    logger?.writeJsonArtifact(`model-${stepLabel}-${provider}-images`, input.imagePaths);
  }

  try {
    const stdout = provider === "gemini-cli"
      ? await runGeminiComposePrompt(input)
      : await runCodexComposePrompt(input);

    logger?.writeTextArtifact(`model-${stepLabel}-${provider}-response`, stdout);
    logger?.appendEvent({
      type: "model_call_completed",
      provider,
      label: stepLabel,
      durationMs: Date.now() - startedAt
    });
    return stdout;
  } catch (error) {
    logger?.recordError(`model-${stepLabel}-${provider}`, error, {
      provider,
      label: stepLabel,
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

export async function runComposePrompt(input: RunComposePromptInput): Promise<string> {
  return runComposePromptWithProvider(getComposeModelProvider(), input);
}
