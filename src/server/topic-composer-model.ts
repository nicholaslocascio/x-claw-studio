import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import {
  topicPostDraftSchema,
  topicPostPlanSchema,
  type TopicPostDraft,
  type TopicPostPlan,
  type TopicPostRequest,
  type TopicPostSubject
} from "@/src/lib/topic-composer";
import {
  getComposeModelProvider,
  parseComposeJsonResponse,
  runComposePromptWithProvider
} from "@/src/server/compose-model-cli";
import {
  buildTopicPostCleanupPrompt,
  buildTopicPostPlanPrompt,
  buildTopicPostPrompt
} from "@/src/server/topic-composer-prompt";
import { looksTooAnalyticalForPost, normalizeDraftStrings } from "@/src/server/prose-cleaner";

export interface TopicComposerModel {
  providerId: string;
  planPost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
  }): Promise<TopicPostPlan>;
  composePost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
    plan: TopicPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<TopicPostDraft>;
}

interface PromptRunnerInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

function collectTopicImagePaths(candidates: ReplyMediaCandidate[]): string[] {
  return Array.from(
    new Set(
      candidates.flatMap((candidate) => [candidate.localFilePath]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function normalizeTopicPostPlan(value: unknown): unknown {
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

class BaseTopicComposerModel implements TopicComposerModel {
  constructor(
    public providerId: string,
    private readonly promptRunner: (input: PromptRunnerInput) => Promise<string>
  ) {}

  async planPost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
  }): Promise<TopicPostPlan> {
    const stdout = await this.promptRunner({
      prompt: buildTopicPostPlanPrompt(input),
      label: "topic-plan"
    });
    return parseComposeJsonResponse(stdout, (value) => topicPostPlanSchema.parse(normalizeTopicPostPlan(value)));
  }

  async composePost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
    plan: TopicPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<TopicPostDraft> {
    const imagePaths = collectTopicImagePaths(input.candidates);
    const stdout = await this.promptRunner({
      prompt: buildTopicPostPrompt(input),
      imagePaths,
      label: "topic-compose"
    });
    const draft = parseComposeJsonResponse(stdout, (value) => topicPostDraftSchema.parse(value));
    const cleanupStdout = await this.promptRunner({
      prompt: buildTopicPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      }),
      imagePaths,
      label: "topic-cleanup"
    });
    const cleanedDraft = parseComposeJsonResponse(cleanupStdout, (value) => topicPostDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await this.promptRunner({
      prompt: buildTopicPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      }),
      imagePaths,
      label: "topic-final-cleanup"
    });
    const finalDraft = parseComposeJsonResponse(finalCleanupStdout, (value) => topicPostDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export class GeminiCliTopicComposerModel extends BaseTopicComposerModel {
  constructor() {
    super("gemini-cli", ({ prompt }) => runComposePromptWithProvider("gemini-cli", { prompt }));
  }
}

export class CodexExecTopicComposerModel extends BaseTopicComposerModel {
  constructor() {
    super("codex-exec", (input) => runComposePromptWithProvider("codex-exec", input));
  }
}

export function createTopicComposerModel(): TopicComposerModel {
  return getComposeModelProvider() === "gemini-cli" ? new GeminiCliTopicComposerModel() : new CodexExecTopicComposerModel();
}
