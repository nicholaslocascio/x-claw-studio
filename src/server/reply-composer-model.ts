import {
  replyCompositionDraftSchema,
  replyCompositionPlanSchema,
  type ReplyCompositionDraft,
  type ReplyCompositionPlan,
  type ReplyCompositionRequest,
  type ReplyComposerSubject,
  type ReplyMediaCandidate
} from "@/src/lib/reply-composer";
import {
  getComposeModelProvider,
  parseComposeJsonResponse,
  runComposePromptWithProvider
} from "@/src/server/compose-model-cli";
import {
  buildReplyCompositionPlanPrompt,
  buildReplyCompositionPrompt,
  buildReplyCompositionCleanupPrompt
} from "@/src/server/reply-composer-prompt";
import { looksTooAnalyticalForPost, looksTooGenericForReply, normalizeDraftStrings } from "@/src/server/prose-cleaner";

export interface ReplyComposerModel {
  providerId: string;
  planReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
  }): Promise<ReplyCompositionPlan>;
  composeReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
    plan: ReplyCompositionPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<ReplyCompositionDraft>;
}

interface PromptRunnerInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

function collectReplyImagePaths(input: {
  subject: ReplyComposerSubject;
  candidates?: ReplyMediaCandidate[];
}): string[] {
  return Array.from(
    new Set(
      [input.subject.localFilePath, ...(input.candidates ?? []).flatMap((candidate) => [candidate.localFilePath])]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength).trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function tokenizeQueryForDiversity(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && token !== "video" && token !== "image" && token !== "meme");
}

function areQueriesNearDuplicates(left: string, right: string): boolean {
  const leftTokens = tokenizeQueryForDiversity(left);
  const rightTokens = tokenizeQueryForDiversity(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  const overlapRatio = overlap / Math.max(leftSet.size, rightSet.size);
  const leftNormalized = leftTokens.join(" ");
  const rightNormalized = rightTokens.join(" ");

  return overlapRatio >= 0.75 || leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized);
}

function diversifySearchQueries(queries: string[], maxItems: number): string[] {
  const unique = normalizeStringList(queries, maxItems, 160);
  const diversified: string[] = [];

  for (const query of unique) {
    if (diversified.some((existing) => areQueriesNearDuplicates(existing, query))) {
      continue;
    }

    diversified.push(query);
    if (diversified.length >= maxItems) {
      break;
    }
  }

  return diversified.length >= 2 ? diversified : unique.slice(0, maxItems);
}

function normalizeReplyPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    searchQueries: diversifySearchQueries(
      Array.isArray(record.searchQueries) ? record.searchQueries : [],
      6
    ),
    moodKeywords: normalizeStringList(record.moodKeywords, 8, 60),
    candidateSelectionCriteria: normalizeStringList(record.candidateSelectionCriteria, 6, 160),
    avoid: normalizeStringList(record.avoid, 6, 160)
  };
}

function normalizeReplyDraft(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    mediaSelectionReason:
      typeof record.mediaSelectionReason === "string" && record.mediaSelectionReason.trim()
        ? record.mediaSelectionReason
        : "no candidate selected",
    whyThisReplyWorks:
      typeof record.whyThisReplyWorks === "string" && record.whyThisReplyWorks.trim()
        ? record.whyThisReplyWorks
        : "keeps the reply postable and on-angle",
    postingNotes: typeof record.postingNotes === "string" ? record.postingNotes : null
  };
}

class BaseReplyComposerModel implements ReplyComposerModel {
  constructor(
    public providerId: string,
    private readonly promptRunner: (input: PromptRunnerInput) => Promise<string>
  ) {}

  async planReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
  }): Promise<ReplyCompositionPlan> {
    const stdout = await this.promptRunner({
      prompt: buildReplyCompositionPlanPrompt(input),
      imagePaths: collectReplyImagePaths(input),
      label: "reply-plan"
    });
    return parseComposeJsonResponse(stdout, (value) => replyCompositionPlanSchema.parse(normalizeReplyPlan(value)));
  }

  async composeReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
    plan: ReplyCompositionPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<ReplyCompositionDraft> {
    const imagePaths = collectReplyImagePaths(input);
    const stdout = await this.promptRunner({
      prompt: buildReplyCompositionPrompt(input),
      imagePaths,
      label: "reply-compose"
    });
    const draft = parseComposeJsonResponse(stdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));
    const cleanupStdout = await this.promptRunner({
      prompt: buildReplyCompositionCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      }),
      imagePaths,
      label: "reply-cleanup"
    });
    const cleanedDraft = parseComposeJsonResponse(cleanupStdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (
      !looksTooAnalyticalForPost(maybeNormalized.replyText) &&
      !looksTooGenericForReply(maybeNormalized.replyText, input.subject.tweetText)
    ) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await this.promptRunner({
      prompt: buildReplyCompositionCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      }),
      imagePaths,
      label: "reply-final-cleanup"
    });
    const finalDraft = parseComposeJsonResponse(finalCleanupStdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export class GeminiCliReplyComposerModel extends BaseReplyComposerModel {
  constructor() {
    super("gemini-cli", ({ prompt }) => runComposePromptWithProvider("gemini-cli", { prompt }));
  }
}

export class CodexExecReplyComposerModel extends BaseReplyComposerModel {
  constructor() {
    super("codex-exec", (input) => runComposePromptWithProvider("codex-exec", input));
  }
}

export function createReplyComposerModel(): ReplyComposerModel {
  return getComposeModelProvider() === "gemini-cli" ? new GeminiCliReplyComposerModel() : new CodexExecReplyComposerModel();
}
