import "@/src/lib/env";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { AnalysisFacetName } from "@/src/lib/analysis-schema";
import { searchFacetIndex, type HybridSearchRow } from "@/src/server/chroma-facets";

type AllFacetsMode = "facet_concat" | "combined_blob";

interface SearchEvalFixture {
  id: string;
  query: string;
  facetName?: AnalysisFacetName | null;
  allFacetsMode?: AllFacetsMode;
  hardMatchMode?: "off" | "intent";
  highQualityOnly?: boolean;
  limit?: number;
  expectedFacetNames?: string[];
  relevantUsageIds?: string[];
  relevantAssetIds?: string[];
  negativeUsageIds?: string[];
  negativeAssetIds?: string[];
  thresholds?: {
    maxFirstRelevantRank?: number;
    minHitsAt5?: number;
    minHitsAt10?: number;
    minHitsAt20?: number;
    minExpectedFacetHitsAt5?: number;
    minExpectedFacetHitsAt10?: number;
    maxNegativeHitsAt5?: number;
    maxNegativeHitsAt10?: number;
    minVectorHitsAt5?: number;
    minVectorHitsAt10?: number;
  };
  notes?: string;
}

interface SearchEvalFixtureFile {
  version: 1;
  fixtures: SearchEvalFixture[];
}

interface SearchEvalCliOptions {
  fixtureId: string | null;
  fixturesPath: string;
  outPath: string;
  json: boolean;
  help: boolean;
}

interface SearchEvalCaseResult {
  fixtureId: string;
  query: string;
  facetName: AnalysisFacetName | null;
  allFacetsMode: AllFacetsMode;
  hardMatchMode: "off" | "intent";
  highQualityOnly: boolean;
  limit: number;
  vectorStatus: "ok" | "unavailable";
  warningMessage: string | null;
  firstRelevantRank: number | null;
  positiveRanks: number[];
  negativeRanks: number[];
  expectedFacetRanks: number[];
  hitsAt5: number;
  hitsAt10: number;
  hitsAt20: number;
  expectedFacetHitsAt5: number;
  expectedFacetHitsAt10: number;
  negativeHitsAt5: number;
  negativeHitsAt10: number;
  vectorHitsAt5: number;
  vectorHitsAt10: number;
  passed: boolean;
  failures: string[];
  notes: string | null;
  topResults: Array<{
    rank: number;
    usageId: string | null;
    assetId: string | null;
    facetName: string | null;
    facetValue: string | null;
    combinedScore: number;
    vectorScore: number;
    lexicalScore: number;
    matchedBy: Array<"vector" | "lexical">;
    tweetText: string | null;
  }>;
}

const HELP_TEXT = `Run a search relevance eval against real local media data.

Usage:
  npm run eval:search-quality
  npm run eval:search-quality -- --fixture female-person-query
  x-media-analyst eval search-quality --fixture reaction-image-broad

Flags:
  --fixture <id>     Run one fixture only.
  --fixtures <path>  Fixture file path. Default: data/analysis/search-eval-fixtures.json
  --out <path>       JSON report path. Default: tmp/search-quality-eval.json
  --json             Print the full JSON report to stdout instead of the text summary.
  -h, --help         Show this help text.
`;

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeFixture(value: unknown): SearchEvalFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Each search eval fixture must be an object.");
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const query = typeof record.query === "string" ? record.query.trim() : "";
  if (!id || !query) {
    throw new Error("Each search eval fixture needs non-empty id and query fields.");
  }

  const thresholdsRecord =
    record.thresholds && typeof record.thresholds === "object" && !Array.isArray(record.thresholds)
      ? (record.thresholds as Record<string, unknown>)
      : {};

  return {
    id,
    query,
    facetName: typeof record.facetName === "string" ? (record.facetName as AnalysisFacetName) : null,
    allFacetsMode: record.allFacetsMode === "facet_concat" ? "facet_concat" : "combined_blob",
    hardMatchMode: record.hardMatchMode === "intent" ? "intent" : "off",
    highQualityOnly: record.highQualityOnly === false ? false : true,
    limit:
      typeof record.limit === "number" && Number.isInteger(record.limit) && record.limit > 0
        ? record.limit
        : 20,
    relevantUsageIds: normalizeStringList(record.relevantUsageIds),
    relevantAssetIds: normalizeStringList(record.relevantAssetIds),
    expectedFacetNames: normalizeStringList(record.expectedFacetNames),
    negativeUsageIds: normalizeStringList(record.negativeUsageIds),
    negativeAssetIds: normalizeStringList(record.negativeAssetIds),
    thresholds: {
      maxFirstRelevantRank:
        typeof thresholdsRecord.maxFirstRelevantRank === "number" ? thresholdsRecord.maxFirstRelevantRank : undefined,
      minHitsAt5: typeof thresholdsRecord.minHitsAt5 === "number" ? thresholdsRecord.minHitsAt5 : undefined,
      minHitsAt10: typeof thresholdsRecord.minHitsAt10 === "number" ? thresholdsRecord.minHitsAt10 : undefined,
      minHitsAt20: typeof thresholdsRecord.minHitsAt20 === "number" ? thresholdsRecord.minHitsAt20 : undefined,
      minExpectedFacetHitsAt5:
        typeof thresholdsRecord.minExpectedFacetHitsAt5 === "number" ? thresholdsRecord.minExpectedFacetHitsAt5 : undefined,
      minExpectedFacetHitsAt10:
        typeof thresholdsRecord.minExpectedFacetHitsAt10 === "number" ? thresholdsRecord.minExpectedFacetHitsAt10 : undefined,
      maxNegativeHitsAt5:
        typeof thresholdsRecord.maxNegativeHitsAt5 === "number" ? thresholdsRecord.maxNegativeHitsAt5 : undefined,
      maxNegativeHitsAt10:
        typeof thresholdsRecord.maxNegativeHitsAt10 === "number" ? thresholdsRecord.maxNegativeHitsAt10 : undefined,
      minVectorHitsAt5:
        typeof thresholdsRecord.minVectorHitsAt5 === "number" ? thresholdsRecord.minVectorHitsAt5 : undefined,
      minVectorHitsAt10:
        typeof thresholdsRecord.minVectorHitsAt10 === "number" ? thresholdsRecord.minVectorHitsAt10 : undefined
    },
    notes: typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined
  };
}

function loadFixtureFile(filePath: string): SearchEvalFixtureFile {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    version?: unknown;
    fixtures?: unknown;
  };

  if (raw.version !== 1) {
    throw new Error(`Unsupported search eval fixture version "${String(raw.version)}". Expected 1.`);
  }

  if (!Array.isArray(raw.fixtures)) {
    throw new Error("Search eval fixture file must include a fixtures array.");
  }

  return {
    version: 1,
    fixtures: raw.fixtures.map(normalizeFixture)
  };
}

function getUsageId(row: HybridSearchRow): string | null {
  return typeof row.metadata.usage_id === "string" && row.metadata.usage_id.length > 0 ? row.metadata.usage_id : null;
}

function getAssetId(row: HybridSearchRow): string | null {
  if (row.media?.mediaAssetId) {
    return row.media.mediaAssetId;
  }

  return typeof row.metadata.asset_id === "string" && row.metadata.asset_id.length > 0 ? row.metadata.asset_id : null;
}

function rowMatchesFixtureTarget(
  row: HybridSearchRow,
  usageIds: Set<string>,
  assetIds: Set<string>
): boolean {
  const usageId = getUsageId(row);
  const assetId = getAssetId(row);
  return (usageId ? usageIds.has(usageId) : false) || (assetId ? assetIds.has(assetId) : false);
}

function countRanksAt(ranks: number[], limit: number): number {
  return ranks.filter((rank) => rank <= limit).length;
}

export function scoreSearchFixtureRows(
  fixture: SearchEvalFixture,
  rows: HybridSearchRow[]
): Pick<
  SearchEvalCaseResult,
  | "firstRelevantRank"
  | "positiveRanks"
  | "negativeRanks"
  | "expectedFacetRanks"
  | "hitsAt5"
  | "hitsAt10"
  | "hitsAt20"
  | "expectedFacetHitsAt5"
  | "expectedFacetHitsAt10"
  | "negativeHitsAt5"
  | "negativeHitsAt10"
  | "vectorHitsAt5"
  | "vectorHitsAt10"
  | "passed"
  | "failures"
> {
  const relevantUsageIds = new Set(fixture.relevantUsageIds ?? []);
  const relevantAssetIds = new Set(fixture.relevantAssetIds ?? []);
  const expectedFacetNames = new Set(fixture.expectedFacetNames ?? []);
  const negativeUsageIds = new Set(fixture.negativeUsageIds ?? []);
  const negativeAssetIds = new Set(fixture.negativeAssetIds ?? []);
  const positiveRanks: number[] = [];
  const negativeRanks: number[] = [];
  const expectedFacetRanks: number[] = [];

  rows.forEach((row, index) => {
    const rank = index + 1;
    const facetName = typeof row.metadata.facet_name === "string" ? row.metadata.facet_name : null;
    if (rowMatchesFixtureTarget(row, relevantUsageIds, relevantAssetIds)) {
      positiveRanks.push(rank);
    }
    if (facetName && expectedFacetNames.has(facetName)) {
      expectedFacetRanks.push(rank);
    }
    if (rowMatchesFixtureTarget(row, negativeUsageIds, negativeAssetIds)) {
      negativeRanks.push(rank);
    }
  });

  const firstRelevantRank = positiveRanks[0] ?? null;
  const hitsAt5 = countRanksAt(positiveRanks, 5);
  const hitsAt10 = countRanksAt(positiveRanks, 10);
  const hitsAt20 = countRanksAt(positiveRanks, 20);
  const expectedFacetHitsAt5 = countRanksAt(expectedFacetRanks, 5);
  const expectedFacetHitsAt10 = countRanksAt(expectedFacetRanks, 10);
  const negativeHitsAt5 = countRanksAt(negativeRanks, 5);
  const negativeHitsAt10 = countRanksAt(negativeRanks, 10);
  const vectorRanks = rows
    .map((row, index) => ((row.matchedBy.includes("vector") ? index + 1 : null)))
    .filter((rank): rank is number => rank !== null);
  const vectorHitsAt5 = countRanksAt(vectorRanks, 5);
  const vectorHitsAt10 = countRanksAt(vectorRanks, 10);
  const failures: string[] = [];
  const thresholds = fixture.thresholds ?? {};

  if (thresholds.maxFirstRelevantRank !== undefined) {
    if (firstRelevantRank === null || firstRelevantRank > thresholds.maxFirstRelevantRank) {
      failures.push(
        `first relevant rank ${firstRelevantRank ?? "missing"} > ${thresholds.maxFirstRelevantRank}`
      );
    }
  }

  if (thresholds.minHitsAt5 !== undefined && hitsAt5 < thresholds.minHitsAt5) {
    failures.push(`hits@5 ${hitsAt5} < ${thresholds.minHitsAt5}`);
  }

  if (thresholds.minHitsAt10 !== undefined && hitsAt10 < thresholds.minHitsAt10) {
    failures.push(`hits@10 ${hitsAt10} < ${thresholds.minHitsAt10}`);
  }

  if (thresholds.minHitsAt20 !== undefined && hitsAt20 < thresholds.minHitsAt20) {
    failures.push(`hits@20 ${hitsAt20} < ${thresholds.minHitsAt20}`);
  }

  if (thresholds.minExpectedFacetHitsAt5 !== undefined && expectedFacetHitsAt5 < thresholds.minExpectedFacetHitsAt5) {
    failures.push(`expected facet hits@5 ${expectedFacetHitsAt5} < ${thresholds.minExpectedFacetHitsAt5}`);
  }

  if (thresholds.minExpectedFacetHitsAt10 !== undefined && expectedFacetHitsAt10 < thresholds.minExpectedFacetHitsAt10) {
    failures.push(`expected facet hits@10 ${expectedFacetHitsAt10} < ${thresholds.minExpectedFacetHitsAt10}`);
  }

  if (thresholds.maxNegativeHitsAt5 !== undefined && negativeHitsAt5 > thresholds.maxNegativeHitsAt5) {
    failures.push(`negative hits@5 ${negativeHitsAt5} > ${thresholds.maxNegativeHitsAt5}`);
  }

  if (thresholds.maxNegativeHitsAt10 !== undefined && negativeHitsAt10 > thresholds.maxNegativeHitsAt10) {
    failures.push(`negative hits@10 ${negativeHitsAt10} > ${thresholds.maxNegativeHitsAt10}`);
  }

  if (thresholds.minVectorHitsAt5 !== undefined && vectorHitsAt5 < thresholds.minVectorHitsAt5) {
    failures.push(`vector hits@5 ${vectorHitsAt5} < ${thresholds.minVectorHitsAt5}`);
  }

  if (thresholds.minVectorHitsAt10 !== undefined && vectorHitsAt10 < thresholds.minVectorHitsAt10) {
    failures.push(`vector hits@10 ${vectorHitsAt10} < ${thresholds.minVectorHitsAt10}`);
  }

  return {
    firstRelevantRank,
    positiveRanks,
    negativeRanks,
    expectedFacetRanks,
    hitsAt5,
    hitsAt10,
    hitsAt20,
    expectedFacetHitsAt5,
    expectedFacetHitsAt10,
    negativeHitsAt5,
    negativeHitsAt10,
    vectorHitsAt5,
    vectorHitsAt10,
    passed: failures.length === 0,
    failures
  };
}

export function parseSearchEvalCliArgs(argv: string[]): SearchEvalCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      fixture: { type: "string" },
      fixtures: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    fixtureId: values.fixture ?? null,
    fixturesPath: path.resolve(values.fixtures ?? path.join(process.cwd(), "data", "analysis", "search-eval-fixtures.json")),
    outPath: path.resolve(values.out ?? path.join(process.cwd(), "tmp", "search-quality-eval.json")),
    json: Boolean(values.json),
    help: Boolean(values.help)
  };
}

async function evaluateFixture(fixture: SearchEvalFixture): Promise<SearchEvalCaseResult> {
  const result = await searchFacetIndex({
    query: fixture.query,
    facetName: fixture.facetName ?? undefined,
    limit: fixture.limit ?? 20,
    highQualityOnly: fixture.highQualityOnly ?? true,
    allFacetsMode: fixture.allFacetsMode ?? "combined_blob",
    hardMatchMode: fixture.hardMatchMode ?? "off"
  });
  const scored = scoreSearchFixtureRows(fixture, result.results);

  return {
    fixtureId: fixture.id,
    query: fixture.query,
    facetName: fixture.facetName ?? null,
    allFacetsMode: fixture.allFacetsMode ?? "combined_blob",
    hardMatchMode: fixture.hardMatchMode ?? "off",
    highQualityOnly: fixture.highQualityOnly ?? true,
    limit: fixture.limit ?? 20,
    vectorStatus: result.vectorStatus,
    warningMessage: result.warningMessage,
    ...scored,
    notes: fixture.notes ?? null,
    topResults: result.results.slice(0, 10).map((row, index) => ({
      rank: index + 1,
      usageId: getUsageId(row),
      assetId: getAssetId(row),
      facetName: typeof row.metadata.facet_name === "string" ? row.metadata.facet_name : null,
      facetValue: typeof row.metadata.facet_value === "string" ? row.metadata.facet_value : null,
      combinedScore: row.combinedScore,
      vectorScore: row.vectorScore,
      lexicalScore: row.lexicalScore,
      matchedBy: row.matchedBy,
      tweetText: row.media?.tweetText ?? null
    }))
  };
}

function writeSummary(results: SearchEvalCaseResult[], reportPath: string): void {
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    const details = [
      `first relevant ${result.firstRelevantRank ?? "missing"}`,
      `hits@5 ${result.hitsAt5}`,
      `hits@10 ${result.hitsAt10}`,
      `facet@5 ${result.expectedFacetHitsAt5}`,
      `neg@5 ${result.negativeHitsAt5}`,
      `vec@5 ${result.vectorHitsAt5}`,
      `vector ${result.vectorStatus}`
    ].join(" | ");
    process.stdout.write(`[${status}] ${result.fixtureId}: ${details}\n`);
    if (result.failures.length > 0) {
      process.stdout.write(`  ${result.failures.join("; ")}\n`);
    }
  }

  const passedCount = results.filter((result) => result.passed).length;
  process.stdout.write(`\n${passedCount}/${results.length} fixtures passed\n`);
  process.stdout.write(`report: ${reportPath}\n`);
}

async function main(argv: string[]): Promise<number> {
  const options = parseSearchEvalCliArgs(argv);
  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const fixtureFile = loadFixtureFile(options.fixturesPath);
  const fixtures = options.fixtureId
    ? fixtureFile.fixtures.filter((fixture) => fixture.id === options.fixtureId)
    : fixtureFile.fixtures;

  if (fixtures.length === 0) {
    throw new Error(
      options.fixtureId
        ? `Unknown search eval fixture "${options.fixtureId}".`
        : "No search eval fixtures were found."
    );
  }

  const results: SearchEvalCaseResult[] = [];
  for (const fixture of fixtures) {
    process.stderr.write(`[eval-search-quality] fixture ${fixture.id}\n`);
    results.push(await evaluateFixture(fixture));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fixturesPath: options.fixturesPath,
    fixtureCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    vectorUnavailableCount: results.filter((result) => result.vectorStatus !== "ok").length,
    fixtures: results
  };

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, `${JSON.stringify(report, null, 2)}\n`);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    writeSummary(results, options.outPath);
  }

  return report.failedCount > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
