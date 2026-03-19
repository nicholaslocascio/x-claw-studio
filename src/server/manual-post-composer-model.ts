import {
  manualPostDraftSchema,
  manualPostPlanSchema,
  type ManualPostDraft,
  type ManualPostPlan,
  type ManualPostRequest,
  type ManualPostSubject
} from "@/src/lib/manual-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import {
  getComposeModelProvider,
  parseComposeJsonResponse,
  runComposePromptWithProvider
} from "@/src/server/compose-model-cli";
import {
  buildManualPostCleanupPrompt,
  buildManualPostPlanPrompt,
  buildManualPostPrompt
} from "@/src/server/manual-post-composer-prompt";
import { looksTooAnalyticalForPost, normalizeDraftStrings } from "@/src/server/prose-cleaner";

export interface ManualPostComposerModel {
  providerId: string;
  planPost(input: {
    request: ManualPostRequest;
    subject: ManualPostSubject;
  }): Promise<ManualPostPlan>;
  composePost(input: {
    request: ManualPostRequest;
    subject: ManualPostSubject;
    plan: ManualPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<ManualPostDraft>;
}

interface PromptRunnerInput {
  prompt: string;
  imagePaths?: string[];
  label?: string;
}

function collectManualPostImagePaths(candidates: ReplyMediaCandidate[]): string[] {
  return Array.from(
    new Set(
      candidates.flatMap((candidate) => [candidate.localFilePath]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  );
}

class BaseManualPostComposerModel implements ManualPostComposerModel {
  constructor(
    public providerId: string,
    private readonly promptRunner: (input: PromptRunnerInput) => Promise<string>
  ) {}

  async planPost(input: {
    request: ManualPostRequest;
    subject: ManualPostSubject;
  }): Promise<ManualPostPlan> {
    const stdout = await this.promptRunner({
      prompt: buildManualPostPlanPrompt(input),
      label: "manual-post-plan"
    });
    return parseComposeJsonResponse(stdout, (value) => manualPostPlanSchema.parse(value));
  }

  async composePost(input: {
    request: ManualPostRequest;
    subject: ManualPostSubject;
    plan: ManualPostPlan;
    candidates: ReplyMediaCandidate[];
  }): Promise<ManualPostDraft> {
    const imagePaths = collectManualPostImagePaths(input.candidates);
    const stdout = await this.promptRunner({
      prompt: buildManualPostPrompt(input),
      imagePaths,
      label: "manual-post-compose"
    });
    const draft = parseComposeJsonResponse(stdout, (value) => manualPostDraftSchema.parse(value));
    const cleanupStdout = await this.promptRunner({
      prompt: buildManualPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft
      }),
      imagePaths,
      label: "manual-post-cleanup"
    });
    const cleanedDraft = parseComposeJsonResponse(cleanupStdout, (value) => manualPostDraftSchema.parse(value));
    const maybeNormalized = normalizeDraftStrings({
      ...cleanedDraft,
      selectedCandidateId: draft.selectedCandidateId
    });

    if (!looksTooAnalyticalForPost(maybeNormalized.tweetText)) {
      return maybeNormalized;
    }

    const finalCleanupStdout = await this.promptRunner({
      prompt: buildManualPostCleanupPrompt({
        request: input.request,
        subject: input.subject,
        plan: input.plan,
        draft: maybeNormalized
      }),
      imagePaths,
      label: "manual-post-final-cleanup"
    });
    const finalDraft = parseComposeJsonResponse(finalCleanupStdout, (value) => manualPostDraftSchema.parse(value));

    return normalizeDraftStrings({
      ...finalDraft,
      selectedCandidateId: draft.selectedCandidateId
    });
  }
}

export class GeminiCliManualPostComposerModel extends BaseManualPostComposerModel {
  constructor() {
    super("gemini-cli", ({ prompt }) => runComposePromptWithProvider("gemini-cli", { prompt }));
  }
}

export class CodexExecManualPostComposerModel extends BaseManualPostComposerModel {
  constructor() {
    super("codex-exec", (input) => runComposePromptWithProvider("codex-exec", input));
  }
}

export function createManualPostComposerModel(): ManualPostComposerModel {
  return getComposeModelProvider() === "gemini-cli" ? new GeminiCliManualPostComposerModel() : new CodexExecManualPostComposerModel();
}
