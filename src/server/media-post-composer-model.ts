import {
  mediaPostDraftSchema,
  mediaPostPlanSchema,
  type MediaPostDraft,
  type MediaPostPlan,
  type MediaPostRequest,
  type MediaPostSubject
} from "@/src/lib/media-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import {
  getComposeModelProvider,
  parseComposeJsonResponse,
  runComposePromptWithProvider
} from "@/src/server/compose-model-cli";
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

interface PromptRunnerInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

function collectMediaPostImagePaths(input: {
  subject: MediaPostSubject;
  candidates: ReplyMediaCandidate[];
}): string[] {
  return Array.from(
    new Set(
      [input.subject.localFilePath, ...input.candidates.flatMap((candidate) => [candidate.localFilePath])].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    )
  );
}

class BaseMediaPostComposerModel implements MediaPostComposerModel {
  constructor(
    public providerId: string,
    private readonly promptRunner: (input: PromptRunnerInput) => Promise<string>
  ) {}

  async planPost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
  }): Promise<MediaPostPlan> {
    const stdout = await this.promptRunner({
      prompt: buildMediaPostPlanPrompt(input),
      imagePaths: collectMediaPostImagePaths({ subject: input.subject, candidates: [] }),
      label: "media-post-plan"
    });
    return parseComposeJsonResponse(stdout, (value) => mediaPostPlanSchema.parse(value));
  }

  async composePost(input: {
    request: MediaPostRequest;
    subject: MediaPostSubject;
    plan: MediaPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<MediaPostDraft> {
    const imagePaths = collectMediaPostImagePaths(input);
    const stdout = await this.promptRunner({
      prompt: buildMediaPostPrompt(input),
      imagePaths,
      label: "media-post-compose"
    });
    const draft = parseComposeJsonResponse(stdout, (value) => mediaPostDraftSchema.parse(value));
    const cleanupStdout = await this.promptRunner({
      prompt: buildMediaPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      }),
      imagePaths,
      label: "media-post-cleanup"
    });
    const cleanedDraft = parseComposeJsonResponse(cleanupStdout, (value) => mediaPostDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await this.promptRunner({
      prompt: buildMediaPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      }),
      imagePaths,
      label: "media-post-final-cleanup"
    });
    const finalDraft = parseComposeJsonResponse(finalCleanupStdout, (value) => mediaPostDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export class GeminiCliMediaPostComposerModel extends BaseMediaPostComposerModel {
  constructor() {
    super("gemini-cli", ({ prompt }) => runComposePromptWithProvider("gemini-cli", { prompt }));
  }
}

export class CodexExecMediaPostComposerModel extends BaseMediaPostComposerModel {
  constructor() {
    super("codex-exec", (input) => runComposePromptWithProvider("codex-exec", input));
  }
}

export function createMediaPostComposerModel(): MediaPostComposerModel {
  return getComposeModelProvider() === "gemini-cli" ? new GeminiCliMediaPostComposerModel() : new CodexExecMediaPostComposerModel();
}
