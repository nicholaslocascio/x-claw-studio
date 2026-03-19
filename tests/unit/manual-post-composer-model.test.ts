import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createManualPostComposerModel,
  GeminiCliManualPostComposerModel
} from "@/src/server/manual-post-composer-model";
import type { ManualPostRequest, ManualPostSubject } from "@/src/lib/manual-post-composer";

const { runComposePromptWithProviderMock } = vi.hoisted(() => ({
  runComposePromptWithProviderMock: vi.fn()
}));

vi.mock("@/src/server/compose-model-cli", async () => {
  const actual = await vi.importActual<typeof import("@/src/server/compose-model-cli")>("@/src/server/compose-model-cli");

  return {
    ...actual,
    runComposePromptWithProvider: runComposePromptWithProviderMock
  };
});

const request: ManualPostRequest = {
  briefText: "Everybody is pretending the AI hardware bill is still normal.",
  toneHint: "dry",
  angleHint: "make the spend feel embarrassing",
  constraints: "one sharp sentence"
};

const subject: ManualPostSubject = {
  briefText: "Everybody is pretending the AI hardware bill is still normal.",
  extractedHooks: ["GPU bill", "embarrassing spend", "server invoice"]
};

describe("GeminiCliManualPostComposerModel", () => {
  beforeEach(() => {
    runComposePromptWithProviderMock.mockReset();
    delete process.env.COMPOSE_MODEL_PROVIDER;
  });

  it("runs a cleanup pass before returning the manual-post draft", async () => {
    runComposePromptWithProviderMock
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            tweetText: "The GPU bill stopped being infra and became a personality trait.",
            selectedCandidateId: "candidate-4",
            mediaSelectionReason: "The image turns the spend into a visual punchline.",
            whyThisTweetWorks: "It compresses the brief into one fed-native line.",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            tweetText: "The GPU bill stopped being infra and became a personality trait.",
            selectedCandidateId: null,
            mediaSelectionReason: "The image turns the spend into a visual punchline.",
            whyThisTweetWorks: "It compresses the brief into one fed-native line.",
            postingNotes: null
          })
        })
      );

    const model = new GeminiCliManualPostComposerModel();
    const draft = await model.composePost({
      request,
      subject,
      plan: {
        angle: "Make the hardware spend feel socially embarrassing.",
        tone: "dry",
        postIntent: "social truth",
        targetReaction: "Readers feel the excess instantly.",
        searchQueries: ["gpu invoice meme", "server bill reaction"],
        candidateSelectionCriteria: ["feels embarrassing", "stays legible"],
        hooks: ["GPU bill", "server invoice"],
        avoid: ["generic future talk"]
      },
      candidates: []
    });

    expect(runComposePromptWithProviderMock).toHaveBeenCalledTimes(2);
    expect(runComposePromptWithProviderMock.mock.calls[1]?.[1]?.prompt).toContain("cleaning a generated X post from a manual brief");
    expect(draft.selectedCandidateId).toBe("candidate-4");
  });

  it("defaults the manual-post composer factory to codex exec", () => {
    const model = createManualPostComposerModel();

    expect(model.providerId).toBe("codex-exec");
  });

  it("can switch the manual-post composer factory back to Gemini CLI", () => {
    process.env.COMPOSE_MODEL_PROVIDER = "gemini-cli";

    const model = createManualPostComposerModel();

    expect(model.providerId).toBe("gemini-cli");
  });
});
