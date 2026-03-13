import {
  replyCompositionDraftSchema,
  replyCompositionPlanSchema,
  type ReplyCompositionDraft,
  type ReplyCompositionPlan,
  type ReplyCompositionRequest,
  type ReplyComposerSubject,
  type ReplyMediaCandidate
} from "@/src/lib/reply-composer";
import { parseGeminiJsonResponse, runGeminiPrompt } from "@/src/server/gemini-cli-json";
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

function normalizeReplyPlan(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    ...record,
    searchQueries: normalizeStringList(record.searchQueries, 4, 160),
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

export class GeminiCliReplyComposerModel implements ReplyComposerModel {
  providerId = "gemini-cli";

  async planReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
  }): Promise<ReplyCompositionPlan> {
    const stdout = await runGeminiPrompt(buildReplyCompositionPlanPrompt(input));
    return parseGeminiJsonResponse(stdout, (value) => replyCompositionPlanSchema.parse(normalizeReplyPlan(value)));
  }

  async composeReply(input: {
    request: ReplyCompositionRequest;
    subject: ReplyComposerSubject;
    plan: ReplyCompositionPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<ReplyCompositionDraft> {
    const stdout = await runGeminiPrompt(buildReplyCompositionPrompt(input));
    const draft = parseGeminiJsonResponse(stdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));
    const cleanupStdout = await runGeminiPrompt(
      buildReplyCompositionCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      })
    );
    const cleanedDraft = parseGeminiJsonResponse(cleanupStdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));
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

    const finalCleanupStdout = await runGeminiPrompt(
      buildReplyCompositionCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      })
    );
    const finalDraft = parseGeminiJsonResponse(finalCleanupStdout, (value) => replyCompositionDraftSchema.parse(normalizeReplyDraft(value)));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export function createReplyComposerModel(): ReplyComposerModel {
  return new GeminiCliReplyComposerModel();
}
