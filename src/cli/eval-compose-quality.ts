import "@/src/lib/env";
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildReplyCompositionCleanupPrompt, buildReplyCompositionPlanPrompt, buildReplyCompositionPrompt } from "@/src/server/reply-composer-prompt";
import { buildTopicPostCleanupPrompt, buildTopicPostPlanPrompt, buildTopicPostPrompt } from "@/src/server/topic-composer-prompt";
import { buildMediaPostCleanupPrompt, buildMediaPostPlanPrompt, buildMediaPostPrompt } from "@/src/server/media-post-composer-prompt";
import { parseGeminiJsonResponse, runGeminiPrompt } from "@/src/server/gemini-cli-json";
import { replyCompositionDraftSchema, replyCompositionPlanSchema } from "@/src/lib/reply-composer";
import { topicPostDraftSchema, topicPostPlanSchema } from "@/src/lib/topic-composer";
import { mediaPostDraftSchema, mediaPostPlanSchema } from "@/src/lib/media-post-composer";
import { looksTooAnalyticalForPost, normalizeDraftStrings } from "@/src/server/prose-cleaner";

type EvalCaseId = "reply" | "topic" | "media";

interface ReplyFixture {
  id: string;
  request: {
    tweetId: string;
    goal: "insight" | "consequence" | "support" | "critique" | "signal_boost";
    mode: "single";
  };
  subject: {
    usageId: null;
    tweetId: string;
    tweetUrl: string;
    authorUsername: string;
    createdAt: string | null;
    tweetText: string;
    mediaKind: string;
    analysis: {
      captionBrief: null;
      sceneDescription: null;
      primaryEmotion: null;
      conveys: null;
      userIntent: null;
      rhetoricalRole: null;
      textMediaRelationship: null;
      culturalReference: null;
      analogyTarget: null;
      searchKeywords: string[];
    };
  };
  referenceTexts: string[];
}

interface LocalTweetRecord {
  tweetId: string;
  tweetUrl: string;
  authorUsername: string;
  createdAt: string | null;
  tweetText: string;
  sourcePath: string;
}

interface ReplyFixtureSpec {
  id: string;
  tweetId: string;
  goal: "insight" | "consequence" | "support" | "critique" | "signal_boost";
  referenceTweetIds: string[];
}

interface ReplyEvalSuccessResult {
  fixtureId: string;
  status: "ok";
  sourcePath: string;
  request: ReplyFixture["request"];
  referenceTexts: string[];
  plan: ReturnType<typeof normalizeReplyPlan>;
  draftText: string;
  summary: EvalSummary;
}

interface ReplyEvalFailedResult {
  fixtureId: string;
  status: "failed";
  sourcePath: string;
  request: ReplyFixture["request"];
  referenceTexts: string[];
  error: string;
}

interface EvalStyleSignals {
  analyticalPenalty: boolean;
  openerBonus: boolean;
  contrastBonus: boolean;
  concreteTechBonus: boolean;
  lowerCaseBonus: boolean;
  shortEnoughBonus: boolean;
}

interface EvalSummary {
  score: number;
  signals: EvalStyleSignals;
  notes: string[];
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
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
  ).slice(0, maxItems);
}

function normalizeBoundedStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, maxLength).trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function normalizeReplyPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    searchQueries: normalizeBoundedStringList(record.searchQueries, 4, 160),
    moodKeywords: normalizeBoundedStringList(record.moodKeywords, 8, 60),
    candidateSelectionCriteria: normalizeBoundedStringList(record.candidateSelectionCriteria, 6, 160),
    avoid: normalizeBoundedStringList(record.avoid, 6, 160)
  };
}

function normalizeTopicPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    searchQueries: normalizeStringList(record.searchQueries, 4),
    candidateSelectionCriteria: normalizeStringList(record.candidateSelectionCriteria, 6),
    avoid: normalizeStringList(record.avoid, 6)
  };
}

function normalizeMediaPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    searchQueries: normalizeStringList(record.searchQueries, 4),
    candidateSelectionCriteria: normalizeStringList(record.candidateSelectionCriteria, 6),
    supportingTopics: normalizeStringList(record.supportingTopics, 4),
    avoid: normalizeStringList(record.avoid, 6)
  };
}

function normalizeTopicDraft(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    mediaSelectionReason:
      typeof record.mediaSelectionReason === "string" && record.mediaSelectionReason.trim()
        ? record.mediaSelectionReason
        : "no media provided",
    whyThisTweetWorks:
      typeof record.whyThisTweetWorks === "string" && record.whyThisTweetWorks.trim()
        ? record.whyThisTweetWorks
        : "fits the requested angle",
    postingNotes: typeof record.postingNotes === "string" ? record.postingNotes : null
  };
}

function scorePostText(text: string): EvalSummary {
  const normalized = text.trim();
  const openerBonus = /^(when|every time|how|guy who|ok|imagine|me\b|nobody:|'|")/i.test(normalized);
  const contrastBonus = /\b(just|turns out|meanwhile|optional|vs|instead)\b/i.test(normalized) || /\n\n/.test(normalized);
  const concreteTechBonus =
    /\b(mac|macbook|cpu|gpu|laptop|office|coffee shop|ssh|terminal|monitor|ide|cloud|ping|filter|map|confluence|linear|workday|duo push|slack|outlook|okta|yubikey|direct deposit|bank app|payday)\b/i.test(normalized);
  const lowerCaseBonus = /^[a-z]/.test(normalized);
  const shortEnoughBonus = normalized.split(/\s+/).filter(Boolean).length <= 24;
  const analyticalPenalty = looksTooAnalyticalForPost(normalized);

  let score = 0;
  if (openerBonus) score += 1;
  if (contrastBonus) score += 1;
  if (concreteTechBonus) score += 1;
  if (lowerCaseBonus) score += 1;
  if (shortEnoughBonus) score += 1;
  if (analyticalPenalty) score -= 2;

  const notes: string[] = [];
  if (openerBonus) notes.push("uses a feed-native opening");
  if (contrastBonus) notes.push("lands as a contrast/verdict instead of setup");
  if (concreteTechBonus) notes.push("uses concrete tech nouns");
  if (lowerCaseBonus) notes.push("register feels more feed-native than polished prose");
  if (shortEnoughBonus) notes.push("stays compact");
  if (analyticalPenalty) notes.push("still reads too analytical");

  return {
    score,
    signals: {
      analyticalPenalty,
      openerBonus,
      contrastBonus,
      concreteTechBonus,
      lowerCaseBonus,
      shortEnoughBonus
    },
    notes
  };
}

let topicTweetIndexCache: Map<string, LocalTweetRecord> | null = null;
let rawTweetIndexCache: Map<string, LocalTweetRecord> | null = null;

function buildTopicTweetIndex(): Map<string, LocalTweetRecord> {
  const index = new Map<string, LocalTweetRecord>();
  const filePath = path.join(process.cwd(), "data", "analysis", "topics", "index.json");
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    tweets?: Array<{
      tweetId?: string;
      tweetKey?: string;
      authorUsername?: string;
      createdAt?: string | null;
      text?: string;
    }>;
  };

  for (const tweet of payload.tweets ?? []) {
    const tweetId = `${tweet.tweetId ?? tweet.tweetKey ?? ""}`.trim();
    const tweetText = `${tweet.text ?? ""}`.trim();
    if (!tweetId || !tweetText || index.has(tweetId)) {
      continue;
    }

    const authorUsername = `${tweet.authorUsername ?? "unknown"}`.trim();
    index.set(tweetId, {
      tweetId,
      tweetUrl: `https://x.com/${authorUsername.replace(/^@/, "")}/status/${tweetId}`,
      authorUsername,
      createdAt: tweet.createdAt ?? null,
      tweetText,
      sourcePath: filePath
    });
  }

  return index;
}

function buildRawTweetIndex(): Map<string, LocalTweetRecord> {
  const rootDir = path.join(process.cwd(), "data", "raw");
  const index = new Map<string, LocalTweetRecord>();
  const pendingDirs = [rootDir];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== "manifest.json") {
        continue;
      }

      const payload = JSON.parse(fs.readFileSync(entryPath, "utf8")) as {
        capturedTweets?: Array<{
          tweetId?: string;
          tweetUrl?: string;
          authorUsername?: string;
          createdAt?: string | null;
          text?: string;
        }>;
      };

      for (const tweet of payload.capturedTweets ?? []) {
        const tweetId = `${tweet.tweetId ?? ""}`.trim();
        const tweetText = `${tweet.text ?? ""}`.trim();
        if (!tweetId || !tweetText || index.has(tweetId)) {
          continue;
        }

        const authorUsername = `${tweet.authorUsername ?? "unknown"}`.trim();
        index.set(tweetId, {
          tweetId,
          tweetUrl: `${tweet.tweetUrl ?? `https://x.com/${authorUsername.replace(/^@/, "")}/status/${tweetId}`}`.trim(),
          authorUsername,
          createdAt: tweet.createdAt ?? null,
          tweetText,
          sourcePath: entryPath
        });
      }
    }
  }

  return index;
}

function loadLocalTweetById(tweetId: string): LocalTweetRecord {
  if (!topicTweetIndexCache) {
    topicTweetIndexCache = buildTopicTweetIndex();
  }
  const topicTweet = topicTweetIndexCache.get(tweetId);
  if (topicTweet) {
    return topicTweet;
  }

  if (!rawTweetIndexCache) {
    rawTweetIndexCache = buildRawTweetIndex();
  }
  const rawTweet = rawTweetIndexCache.get(tweetId);
  if (rawTweet) {
    return rawTweet;
  }

  throw new Error(`Could not find local tweet fixture for tweet ${tweetId}`);
}

function buildReplyFixture(spec: ReplyFixtureSpec): ReplyFixture {
  const subjectTweet = loadLocalTweetById(spec.tweetId);
  return {
    id: spec.id,
    request: {
      tweetId: subjectTweet.tweetId,
      goal: spec.goal,
      mode: "single"
    },
    subject: {
      usageId: null,
      tweetId: subjectTweet.tweetId,
      tweetUrl: subjectTweet.tweetUrl,
      authorUsername: subjectTweet.authorUsername,
      createdAt: subjectTweet.createdAt,
      tweetText: subjectTweet.tweetText,
      mediaKind: "none",
      analysis: {
        captionBrief: null,
        sceneDescription: null,
        primaryEmotion: null,
        conveys: null,
        userIntent: null,
        rhetoricalRole: null,
        textMediaRelationship: null,
        culturalReference: null,
        analogyTarget: null,
        searchKeywords: []
      }
    },
    referenceTexts: spec.referenceTweetIds.map((referenceTweetId) => loadLocalTweetById(referenceTweetId).tweetText)
  };
}

function isReplyEvalSuccessResult(result: ReplyEvalSuccessResult | ReplyEvalFailedResult): result is ReplyEvalSuccessResult {
  return result.status === "ok";
}

async function runReplyCase(selectedFixtureId?: string) {
  const fixtures: ReplyFixture[] = [
    buildReplyFixture({
      id: "screenshot-ui",
      tweetId: "2029578356308467989",
      goal: "insight",
      referenceTweetIds: ["1902150504156950874", "1980750276773413177"]
    }),
    buildReplyFixture({
      id: "one-liner-job",
      tweetId: "2031403902852055491",
      goal: "support",
      referenceTweetIds: ["2031026003665977381", "1980285066312830997"]
    }),
    buildReplyFixture({
      id: "one-liner-text-back",
      tweetId: "2031026003665977381",
      goal: "support",
      referenceTweetIds: ["2031403902852055491", "1980285066312830997"]
    }),
    buildReplyFixture({
      id: "corporate-loop",
      tweetId: "1988312881084174384",
      goal: "critique",
      referenceTweetIds: ["1965797342332022893", "2031072163864703044"]
    }),
    buildReplyFixture({
      id: "persona-hack",
      tweetId: "2024927479358709800",
      goal: "consequence",
      referenceTweetIds: ["1980285066312830997", "2029578356308467989"]
    }),
    buildReplyFixture({
      id: "crab-legs",
      tweetId: "2031531128335507640",
      goal: "support",
      referenceTweetIds: ["2032192866957619449", "2031226540319543301"]
    }),
    buildReplyFixture({
      id: "epstein-files",
      tweetId: "2031226540319543301",
      goal: "critique",
      referenceTweetIds: ["2031531128335507640", "2024927479358709800"]
    }),
    buildReplyFixture({
      id: "boomer-house",
      tweetId: "2031022697506078944",
      goal: "insight",
      referenceTweetIds: ["2031079336854561091", "2031618624553890000"]
    }),
    buildReplyFixture({
      id: "retirement-neighbor",
      tweetId: "2031079336854561091",
      goal: "support",
      referenceTweetIds: ["2031022697506078944", "2031618624553890000"]
    })
  ];

  const filteredFixtures = selectedFixtureId ? fixtures.filter((fixture) => fixture.id === selectedFixtureId) : fixtures;
  if (selectedFixtureId && filteredFixtures.length === 0) {
    throw new Error(`Unknown reply fixture "${selectedFixtureId}"`);
  }

  const results: Array<ReplyEvalSuccessResult | ReplyEvalFailedResult> = [];
  for (const fixture of filteredFixtures) {
    process.stderr.write(`[eval-compose-quality] reply fixture ${fixture.id}\n`);
    try {
      const plan = parseGeminiJsonResponse(
        await runGeminiPrompt(buildReplyCompositionPlanPrompt({ request: fixture.request, subject: fixture.subject })),
        (value) => replyCompositionPlanSchema.parse(normalizeReplyPlan(value))
      );
      const draft = parseGeminiJsonResponse(
        await runGeminiPrompt(buildReplyCompositionPrompt({ request: fixture.request, subject: fixture.subject, plan, candidates: [] })),
        (value) => replyCompositionDraftSchema.parse(value)
      );
      const cleaned = normalizeDraftStrings(
        parseGeminiJsonResponse(
          await runGeminiPrompt(buildReplyCompositionCleanupPrompt({ request: fixture.request, subject: fixture.subject, plan, draft })),
          (value) => replyCompositionDraftSchema.parse(value)
        )
      );

      results.push({
        fixtureId: fixture.id,
        status: "ok" as const,
        sourcePath: loadLocalTweetById(fixture.subject.tweetId).sourcePath,
        request: fixture.request,
        referenceTexts: fixture.referenceTexts,
        plan,
        draftText: cleaned.replyText,
        summary: scorePostText(cleaned.replyText)
      });
      process.stderr.write(`[eval-compose-quality] reply fixture ${fixture.id} ok\n`);
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        status: "failed" as const,
        sourcePath: loadLocalTweetById(fixture.subject.tweetId).sourcePath,
        request: fixture.request,
        referenceTexts: fixture.referenceTexts,
        error: error instanceof Error ? error.message : String(error)
      });
      process.stderr.write(`[eval-compose-quality] reply fixture ${fixture.id} failed\n`);
    }
  }

  const successfulResults = results.filter(isReplyEvalSuccessResult);

  return {
    caseId: "reply" as const,
    fixtureCount: results.length,
    successCount: successfulResults.length,
    failedCount: results.length - successfulResults.length,
    averageScore:
      successfulResults.length > 0
        ? Number((successfulResults.reduce((sum, item) => sum + item.summary.score, 0) / successfulResults.length).toFixed(2))
        : null,
    fixtures: results
  };
}

async function runTopicCase() {
  const request = {
    topicId: "phrase:alibaba-cloud-ai-in-orbit",
    goal: "insight" as const,
    mode: "single" as const
  };
  const subject = {
    topicId: "phrase:alibaba-cloud-ai-in-orbit",
    label: "Alibaba cloud AI in orbit",
    kind: "phrase",
    hotnessScore: 8.9,
    tweetCount: 12,
    recentTweetCount24h: 8,
    isStale: false,
    mostRecentAt: "2026-03-12T00:00:00.000Z",
    suggestedAngles: ["The interesting part is constrained compute, not space theater."],
    representativeTweets: [
      { authorUsername: "example1", text: "Alibaba just put Qwen in orbit.", createdAt: null },
      { authorUsername: "example2", text: "Space AI is here.", createdAt: null }
    ],
    groundedNews: {
      summary: "Alibaba said a Qwen model was deployed in orbit.",
      whyNow: "People are posting it like a sci-fi milestone instead of a compute constraint story.",
      sources: [{ title: "Example", uri: "https://example.com" }]
    }
  };

  const plan = parseGeminiJsonResponse(await runGeminiPrompt(buildTopicPostPlanPrompt({ request, subject })), (value) =>
    topicPostPlanSchema.parse(normalizeTopicPlan(value))
  );
  const draft = parseGeminiJsonResponse(await runGeminiPrompt(buildTopicPostPrompt({ request, subject, plan, candidates: [] })), (value) =>
    topicPostDraftSchema.parse(normalizeTopicDraft(value))
  );
  const cleaned = normalizeDraftStrings(
    parseGeminiJsonResponse(await runGeminiPrompt(buildTopicPostCleanupPrompt({ request, subject, plan, draft })), (value) =>
      topicPostDraftSchema.parse(normalizeTopicDraft(value))
    )
  );

  return {
    caseId: "topic" as const,
    referenceTexts: ["1969: we can send people to the moon with 4kb of ram 2025: a cloud outage means my smart bed won't cool down"],
    plan,
    draftText: cleaned.tweetText,
    summary: scorePostText(cleaned.tweetText)
  };
}

async function runMediaCase() {
  const request = {
    usageId: "2031628875864879386-0"
  };
  const subject = {
    usageId: "2031628875864879386-0",
    tweetId: "2031628875864879386",
    assetId: "asset-bitnet-demo",
    assetUsageCount: 1,
    mediaKind: "video_blob",
    authorUsername: "heygurisingh",
    createdAt: "2026-03-11T07:10:44.000Z",
    tweetText: "Holy shit... Microsoft open sourced an inference framework that runs a 100B parameter LLM on a single CPU.",
    localFilePath: null,
    playableFilePath: null,
    analysis: {
      captionBrief: "A terminal window showing a BitNet inference script running locally.",
      sceneDescription: "A dark terminal with a local inference command running a model on a macOS machine.",
      primaryEmotion: "excitement",
      emotionalTone: "amazed and revolutionary",
      conveys: "powerful AI on commodity hardware",
      userIntent: "show proof that local CPU inference works",
      rhetoricalRole: "evidence",
      textMediaRelationship: "proof of the claim",
      culturalReference: null,
      analogyTarget: null,
      trendSignal: "efficiency and local-first AI",
      audienceTakeaway: "large models are getting much more accessible",
      brandSignals: ["Microsoft", "Apple"],
      searchKeywords: ["BitNet", "LLM", "inference", "local AI", "CPU inference"]
    },
    relatedTopics: [
      {
        label: "local AI",
        hotnessScore: 8.1,
        stance: "supportive",
        sentiment: "positive",
        whyNow: "People are rethinking GPU requirements."
      }
    ],
    priorUsages: []
  };

  const plan = parseGeminiJsonResponse(await runGeminiPrompt(buildMediaPostPlanPrompt({ request, subject })), (value) =>
    mediaPostPlanSchema.parse(normalizeMediaPlan(value))
  );
  const draft = parseGeminiJsonResponse(await runGeminiPrompt(buildMediaPostPrompt({ request, subject, plan, candidates: [] })), (value) =>
    mediaPostDraftSchema.parse(value)
  );
  const cleaned = normalizeDraftStrings(
    parseGeminiJsonResponse(await runGeminiPrompt(buildMediaPostCleanupPrompt({ request, subject, plan, draft })), (value) =>
      mediaPostDraftSchema.parse(value)
    )
  );

  return {
    caseId: "media" as const,
    referenceTexts: [
      "today is a great reminder that the cloud is just someone else's computer",
      "100B parameters on a Mac CPU. The GPU tax is a software bug."
    ],
    plan,
    draftText: cleaned.tweetText,
    summary: scorePostText(cleaned.tweetText)
  };
}

const HELP_TEXT = `Evaluate compose quality on fixed local subjects.

Usage:
  npm run eval:compose-quality
  npm run eval:compose-quality -- --case reply
  npm run eval:compose-quality -- --case reply --fixture screenshot-ui
  x-media-analyst eval compose-quality --case media

Flags:
  --case <reply|topic|media|all>   Which fixture to run. Default: all.
  --fixture <id>                   Optional fixture id for reply evals.
  --out <path>                     Write JSON output here. Default: tmp/composer-quality-eval.json
  -h, --help                       Show help.
`;

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      case: { type: "string" },
      fixture: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const selectedCase = (values.case ?? "all") as EvalCaseId | "all";
  const selectedFixture = values.fixture;
  const outPath = path.resolve(values.out ?? path.join(process.cwd(), "tmp", "composer-quality-eval.json"));

  const results = [];
  if (selectedCase === "all" || selectedCase === "reply") {
    results.push(await runReplyCase(selectedFixture));
  }
  if (selectedCase === "all" || selectedCase === "topic") {
    results.push(await runTopicCase());
  }
  if (selectedCase === "all" || selectedCase === "media") {
    results.push(await runMediaCase());
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    selectedCase,
    totalScore: results.reduce((sum, item) => {
      if ("summary" in item) {
        return sum + item.summary.score;
      }
      if ("fixtures" in item) {
        return (
          sum +
          item.fixtures.filter(isReplyEvalSuccessResult).reduce((fixtureSum, fixture) => fixtureSum + fixture.summary.score, 0)
        );
      }
      return sum;
    }, 0),
    cases: results
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const entryScriptPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (entryScriptPath && import.meta.url === entryScriptPath) {
  void main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
