import fs from "node:fs";
import path from "node:path";
import { normalizeUsageAnalysis } from "@/src/lib/analysis-schema";
import { ensureDir, writeJson } from "@/src/lib/fs";
import type { UsageAnalysis } from "@/src/lib/types";

const projectRoot = process.cwd();
const analysisDir = path.join(projectRoot, "data", "analysis", "tweet-usages");

function parseUsageAnalysisFile(filePath: string): UsageAnalysis | null {
  try {
    return normalizeUsageAnalysis(JSON.parse(fs.readFileSync(filePath, "utf8")) as UsageAnalysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[analysis-store] Skipping unreadable usage analysis at ${filePath}: ${message}`);
    return null;
  }
}

export function getAnalysisPath(usageId: string): string {
  return path.join(analysisDir, `${usageId}.json`);
}

export function writeUsageAnalysis(analysis: UsageAnalysis): string {
  const normalized = normalizeUsageAnalysis(analysis);
  const filePath = getAnalysisPath(normalized.usageId);
  ensureDir(path.dirname(filePath));
  writeJson(filePath, normalized);
  return filePath;
}

export function readUsageAnalysis(usageId: string): UsageAnalysis | null {
  const filePath = getAnalysisPath(usageId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return parseUsageAnalysisFile(filePath);
}

export function readAllUsageAnalyses(): UsageAnalysis[] {
  if (!fs.existsSync(analysisDir)) {
    return [];
  }

  return fs
    .readdirSync(analysisDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => parseUsageAnalysisFile(path.join(analysisDir, fileName)))
    .filter((analysis): analysis is UsageAnalysis => Boolean(analysis))
    .sort((a, b) => a.usageId.localeCompare(b.usageId));
}
