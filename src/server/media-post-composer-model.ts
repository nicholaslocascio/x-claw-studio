import {
  mediaPostDraftSchema,
  mediaPostPlanSchema,
  type MediaPostDraft,
  type MediaPostPlan,
  type MediaPostRequest,
  type MediaPostSubject
} from "@/src/lib/media-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import { parseGeminiJsonResponse, runGeminiPrompt } from "@/src/server/gemini-cli-json";
import {
  buildMediaPostCleanupPrompt,
  buildMediaPostPlanPrompt,
  buildMediaPostPrompt
} from "@/src/server/media-post-composer-prompt";
import { looksTooAnalyticalForPost, normalizeDraftStrings } from "@/src/server/prose-cleaner";

export interface MediaPostComposerModel {
  providerId: string;
  planPost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
  }): Promise<MediaPostPlan>;
  composePost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
    plan: MediaPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<MediaPostDraft>;
}

export class GeminiCliMediaPostComposerModel implements MediaPostComposerModel {
  providerId = "gemini-cli";

  async planPost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
  }): Promise<MediaPostPlan> {
    const stdout = await runGeminiPrompt(buildMediaPostPlanPrompt(input));
    return parseGeminiJsonResponse(stdout, (value) => mediaPostPlanSchema.parse(value));
  }

  async composePost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
    plan: MediaPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<MediaPostDraft> {
    const stdout = await runGeminiPrompt(buildMediaPostPrompt(input));
    const draft = parseGeminiJsonResponse(stdout, (value) => mediaPostDraftSchema.parse(value));
    const cleanupStdout = await runGeminiPrompt(
      buildMediaPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      })
    );
    const cleanedDraft = parseGeminiJsonResponse(cleanupStdout, (value) => mediaPostDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await runGeminiPrompt(
      buildMediaPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      })
    );
    const finalDraft = parseGeminiJsonResponse(finalCleanupStdout, (value) => mediaPostDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export function createMediaPostComposerModel(): MediaPostComposerModel {
  return new GeminiCliMediaPostComposerModel();
}
