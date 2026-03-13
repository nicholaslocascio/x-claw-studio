import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import {
  topicPostDraftSchema,
  topicPostPlanSchema,
  type TopicPostDraft,
  type TopicPostPlan,
  type TopicPostRequest,
  type TopicPostSubject
} from "@/src/lib/topic-composer";
import { parseGeminiJsonResponse, runGeminiPrompt } from "@/src/server/gemini-cli-json";
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

export class GeminiCliTopicComposerModel implements TopicComposerModel {
  providerId = "gemini-cli";

  async planPost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
  }): Promise<TopicPostPlan> {
    const stdout = await runGeminiPrompt(buildTopicPostPlanPrompt(input));
    return parseGeminiJsonResponse(stdout, (value) => topicPostPlanSchema.parse(normalizeTopicPostPlan(value)));
  }

  async composePost(input: {
    request: TopicPostRequest;
    subject: TopicPostSubject;
    plan: TopicPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<TopicPostDraft> {
    const stdout = await runGeminiPrompt(buildTopicPostPrompt(input));
    const draft = parseGeminiJsonResponse(stdout, (value) => topicPostDraftSchema.parse(value));
    const cleanupStdout = await runGeminiPrompt(
      buildTopicPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      })
    );
    const cleanedDraft = parseGeminiJsonResponse(cleanupStdout, (value) => topicPostDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await runGeminiPrompt(
      buildTopicPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      })
    );
    const finalDraft = parseGeminiJsonResponse(finalCleanupStdout, (value) => topicPostDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export function createTopicComposerModel(): TopicComposerModel {
  return new GeminiCliTopicComposerModel();
}
