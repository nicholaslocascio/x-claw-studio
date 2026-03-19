import type {
  CloneTweetDraft,
  CloneTweetPlan,
  CloneTweetRequest,
  CloneTweetSubject
} from "@/src/lib/clone-tweet-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import { cloneTweetDraftSchema, cloneTweetPlanSchema } from "@/src/lib/clone-tweet-composer";
import {
  getComposeModelProvider,
  parseComposeJsonResponse,
  runComposePromptWithProvider
} from "@/src/server/compose-model-cli";
import {
  buildCloneTweetCleanupPrompt,
  buildCloneTweetPlanPrompt,
  buildCloneTweetPrompt
} from "@/src/server/clone-tweet-composer-prompt";
import { looksTooAnalyticalForPost, normalizeDraftStrings } from "@/src/server/prose-cleaner";

export interface CloneTweetComposerModel {
  providerId: string;
  planTweet(input: {
    request: CloneTweetRequest;
    subject: CloneTweetSubject;
  }): Promise<CloneTweetPlan>;
  composeTweet(input: {
    request: CloneTweetRequest;
    subject: CloneTweetSubject;
    plan: CloneTweetPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<CloneTweetDraft>;
}

interface PromptRunnerInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

function collectImagePaths(candidates: ReplyMediaCandidate[]): string[] {
  return Array.from(
    new Set(
      candidates
        .flatMap((candidate) => [candidate.localFilePath])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );
}

class BaseCloneTweetComposerModel implements CloneTweetComposerModel {
  constructor(
    public providerId: string,
    private readonly promptRunner: (input: PromptRunnerInput) => Promise<string>
  ) {}

  async planTweet(input: {
    request: CloneTweetRequest;
    subject: CloneTweetSubject;
  }): Promise<CloneTweetPlan> {
    const stdout = await this.promptRunner({
      prompt: buildCloneTweetPlanPrompt(input),
      label: "clone-plan"
    });
    return parseComposeJsonResponse(stdout, (value) => cloneTweetPlanSchema.parse(value));
  }

  async composeTweet(input: {
    request: CloneTweetRequest;
    subject: CloneTweetSubject;
    plan: CloneTweetPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<CloneTweetDraft> {
    const imagePaths = collectImagePaths(input.candidates);
    const stdout = await this.promptRunner({
      prompt: buildCloneTweetPrompt(input),
      imagePaths,
      label: "clone-compose"
    });
    const draft = parseComposeJsonResponse(stdout, (value) => cloneTweetDraftSchema.parse(value));
    const cleanupStdout = await this.promptRunner({
      prompt: buildCloneTweetCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      }),
      imagePaths,
      label: "clone-cleanup"
    });
    const cleanedDraft = parseComposeJsonResponse(cleanupStdout, (value) => cloneTweetDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: cleanedDraft.selectedCandidateId ?? draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await this.promptRunner({
      prompt: buildCloneTweetCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      }),
      imagePaths,
      label: "clone-final-cleanup"
    });
    const finalDraft = parseComposeJsonResponse(finalCleanupStdout, (value) => cloneTweetDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: finalDraft.selectedCandidateId ?? maybeNormalized.selectedCandidateId
    });
  }
}

export class GeminiCliCloneTweetComposerModel extends BaseCloneTweetComposerModel {
  constructor() {
    super("gemini-cli", ({ prompt }) => runComposePromptWithProvider("gemini-cli", { prompt }));
  }
}

export class CodexExecCloneTweetComposerModel extends BaseCloneTweetComposerModel {
  constructor() {
    super("codex-exec", (input) => runComposePromptWithProvider("codex-exec", input));
  }
}

export function createCloneTweetComposerModel(): CloneTweetComposerModel {
  return getComposeModelProvider() === "gemini-cli" ? new GeminiCliCloneTweetComposerModel() : new CodexExecCloneTweetComposerModel();
}
