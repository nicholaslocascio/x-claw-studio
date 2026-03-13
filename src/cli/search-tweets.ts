import "@/src/lib/env";
import { parseArgs } from "node:util";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { getDashboardData, getCapturedTweetPage, MAX_CAPTURED_TWEET_PAGE_SIZE } from "@/src/server/data";
import type { CapturedTweetFilter, CapturedTweetPage } from "@/src/lib/types";

type OutputFormat = "json" | "jsonl";

interface SearchTweetsCliOptions {
  query: string | null;
  filter: CapturedTweetFilter;
  page: number;
  limit: number;
  format: OutputFormat;
  help: boolean;
}

const HELP_TEXT = `List captured tweets with server-style filtering and pagination.

Usage:
  x-media-analyst search tweets [--query "<query>"] [--filter all|with_media|without_media] [--page <n>] [--limit <n>] [--format json|jsonl]
  x-media-analyst search tweets "<query>"

Flags:
  -q, --query <query>     Filter by author or tweet text.
  --filter <filter>       all, with_media, or without_media. Default: all.
  -p, --page <n>          Page number. Default: 1.
  -l, --limit <n>         Page size. Max: 200. Default: 200.
  --format <format>       Output format: json or jsonl. Default: json.
  --json                  Alias for --format json.
  --jsonl                 Alias for --format jsonl.
  -h, --help              Show this help text.

Exit codes:
  0  Success
  2  Usage error or invalid arguments

Examples:
  x-media-analyst search tweets --filter with_media --limit 50
  x-media-analyst search tweets "mask reveal" --page 2 --json
  x-media-analyst search tweets --query "elon" --filter without_media --jsonl`;

function parsePositiveInt(value: string | undefined, flag: string, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flag} value "${value}". Expected a positive integer.`);
  }

  return parsed;
}

function parseFilter(value: string | undefined): CapturedTweetFilter {
  if (!value || value === "all" || value === "with_media" || value === "without_media") {
    return (value ?? "all") as CapturedTweetFilter;
  }

  throw new Error(`Invalid --filter value "${value}". Expected all, with_media, or without_media.`);
}

export function parseSearchTweetsCliArgs(argv: string[]): SearchTweetsCliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      query: { type: "string", short: "q" },
      filter: { type: "string" },
      page: { type: "string", short: "p" },
      limit: { type: "string", short: "l" },
      format: { type: "string" },
      json: { type: "boolean" },
      jsonl: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.json && values.jsonl) {
    throw new Error("Choose only one of --json or --jsonl.");
  }

  const formatRaw = values.format ?? (values.jsonl ? "jsonl" : "json");
  const format = formatRaw === "jsonl" ? "jsonl" : formatRaw === "json" ? "json" : null;
  if (!format) {
    throw new Error(`Invalid --format value "${formatRaw}". Expected "json" or "jsonl".`);
  }

  return {
    query: values.query ?? positionals[0] ?? null,
    filter: parseFilter(values.filter),
    page: parsePositiveInt(values.page, "--page", 1),
    limit: parsePositiveInt(values.limit, "--limit", MAX_CAPTURED_TWEET_PAGE_SIZE),
    format,
    help: Boolean(values.help)
  };
}

export function buildAgentTweetSearchPayload(result: CapturedTweetPage) {
  return {
    command: "search-tweets",
    query: result.query,
    filter: result.tweetFilter,
    page: result.page,
    limit: result.pageSize,
    total_results: result.totalResults,
    total_pages: result.totalPages,
    has_previous_page: result.hasPreviousPage,
    has_next_page: result.hasNextPage,
    counts: result.counts,
    results: result.tweets.map((entry, index) => ({
      rank: (result.page - 1) * result.pageSize + index + 1,
      tweet_key: entry.tweetKey,
      tweet_id: entry.tweet.tweetId,
      tweet_url: entry.tweet.tweetUrl,
      source_name: entry.tweet.sourceName,
      author_handle: entry.tweet.authorHandle,
      author_username: entry.tweet.authorUsername,
      author_display_name: entry.tweet.authorDisplayName,
      created_at: entry.tweet.createdAt,
      extracted_at: entry.tweet.extraction.extractedAt,
      text: entry.tweet.text,
      has_media: entry.hasMedia,
      media_count: entry.mediaCount,
      analyzed_media_count: entry.analyzedMediaCount,
      first_media_asset_id: entry.firstMediaAssetId,
      first_media_asset_starred: entry.firstMediaAssetStarred,
      topic_labels: entry.topicLabels,
      top_topic_label: entry.topTopicLabel,
      top_topic_hotness_score: entry.topTopicHotnessScore
    }))
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printJsonLines(value: ReturnType<typeof buildAgentTweetSearchPayload>): void {
  process.stdout.write(
    `${JSON.stringify({
      type: "search_meta",
      command: value.command,
      query: value.query,
      filter: value.filter,
      page: value.page,
      limit: value.limit,
      total_results: value.total_results,
      total_pages: value.total_pages,
      has_previous_page: value.has_previous_page,
      has_next_page: value.has_next_page,
      counts: value.counts
    })}\n`
  );

  for (const row of value.results) {
    process.stdout.write(`${JSON.stringify({ type: "search_result", ...row })}\n`);
  }
}

async function main(argv: string[]): Promise<void> {
  let options: SearchTweetsCliOptions;

  try {
    options = parseSearchTweetsCliArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write('Run "x-media-analyst search tweets --help" for usage.\n');
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const data = getDashboardData();
  const result = getCapturedTweetPage({
    tweets: data.capturedTweets,
    page: options.page,
    pageSize: options.limit,
    query: options.query,
    tweetFilter: options.filter
  });
  const payload = buildAgentTweetSearchPayload(result);

  if (options.format === "jsonl") {
    printJsonLines(payload);
    return;
  }

  printJson(payload);
}

const entryScriptPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (entryScriptPath && import.meta.url === entryScriptPath) {
  void main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
