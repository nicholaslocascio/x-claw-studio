import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseGeminiJsonResponse } from "@/src/server/gemini-cli-json";
import { replyCompositionDraftSchema, replyCompositionPlanSchema } from "@/src/lib/reply-composer";
import { createReplyComposerModel, GeminiCliReplyComposerModel } from "@/src/server/reply-composer-model";

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

const request = {
  usageId: "usage-1",
  goal: "insight" as const,
  mode: "single" as const
};

const subject = {
  usageId: "usage-1",
  tweetId: "tweet-1",
  tweetUrl: "https://x.com/example/status/1",
  authorUsername: "example",
  createdAt: "2026-03-11T10:00:00.000Z",
  tweetText: "Cloudflare is betraying the open web.",
  mediaKind: "image",
  localFilePath: "data/raw/source-image.jpg",
  playableFilePath: null,
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
};

describe("parseGeminiJsonResponse", () => {
  beforeEach(() => {
    runComposePromptWithProviderMock.mockReset();
    delete process.env.COMPOSE_MODEL_PROVIDER;
  });

  it("parses the Gemini CLI JSON envelope response field", () => {
    const value = parseGeminiJsonResponse(
      JSON.stringify({
        response: JSON.stringify({
          stance: "agree",
          angle: "Point out the second-order effect",
          tone: "dry and concise",
          intentSummary: "Add one sharper implication",
          targetEffect: "Make the consequence feel obvious",
          searchQueries: ["reaction image consequence", "grim nod support"],
          moodKeywords: ["grim", "knowing"],
          candidateSelectionCriteria: ["matches consequence", "feels understated"],
          avoid: ["too celebratory"]
        })
      }),
      (input) => replyCompositionPlanSchema.parse(input)
    );

    expect(value.searchQueries).toEqual(["reaction image consequence", "grim nod support"]);
    expect(value.stance).toBe("agree");
  });

  it("parses fenced JSON nested inside the response field", () => {
    const value = parseGeminiJsonResponse(
      JSON.stringify({
        response:
          "```json\n" +
          JSON.stringify({
            replyText: "This is where the shortcut turns into the whole strategy.",
            selectedCandidateId: "candidate-1",
            mediaSelectionReason: "The image lands the same implication without overexplaining it.",
            whyThisReplyWorks: "It adds consequence and keeps the tone tight.",
            postingNotes: null
          }) +
          "\n```"
      }),
      (input) => replyCompositionDraftSchema.parse(input)
    );

    expect(value.selectedCandidateId).toBe("candidate-1");
  });

  it("ignores non-JSON preamble text before the envelope", () => {
    const value = parseGeminiJsonResponse(
      '[dotenv@17.3.1] injecting env (3) from .env\n' +
        JSON.stringify({
          response: JSON.stringify({
            replyText: "The moat was always the point.",
            selectedCandidateId: null,
            mediaSelectionReason: "No candidate fit closely enough.",
            whyThisReplyWorks: "It reframes the move as strategy instead of betrayal.",
            postingNotes: null
          })
        }),
      (input) => replyCompositionDraftSchema.parse(input)
    );

    expect(value.replyText).toBe("The moat was always the point.");
  });

  it("runs a second cleanup pass before returning a composed reply", async () => {
    runComposePromptWithProviderMock
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "This isn't a prediction—it’s the new baseline.",
            selectedCandidateId: "candidate-1",
            mediaSelectionReason: "The meme makes the drift obvious.",
            whyThisReplyWorks: "It adds one sharper implication.",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "turns out the moat was the product",
            selectedCandidateId: "candidate-2",
            mediaSelectionReason: "The meme makes the drift obvious.",
            whyThisReplyWorks: "It adds one sharper implication.",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "cloudflare guy who keeps calling the toll booth open infrastructure",
            selectedCandidateId: "candidate-2",
            mediaSelectionReason: "The meme makes the drift obvious.",
            whyThisReplyWorks: "It adds one sharper implication.",
            postingNotes: null
          })
        })
      );

    const model = new GeminiCliReplyComposerModel();
    const draft = await model.composeReply({
      request,
      subject,
      plan: {
        stance: "disagree",
        angle: "Call out baseline drift",
        tone: "dry",
        intentSummary: "Make the excuse obvious",
        targetEffect: "Readers see the timeline trick",
        searchQueries: ["clown makeup", "timeline drift"],
        moodKeywords: ["dry", "annoyed"],
        candidateSelectionCriteria: ["sharpens the point", "stays legible"],
        avoid: ["hype"]
      },
      candidates: []
    });

    expect(runComposePromptWithProviderMock).toHaveBeenCalledTimes(3);
    expect(runComposePromptWithProviderMock.mock.calls[1]?.[1]?.prompt).toContain("cleaning a generated X reply draft");
    expect(runComposePromptWithProviderMock.mock.calls[2]?.[1]?.prompt).toContain("cleaning a generated X reply draft");
    expect(draft.selectedCandidateId).toBe("candidate-1");
    expect(draft.replyText).toBe("cloudflare guy who keeps calling the toll booth open infrastructure");
  });

  it("attaches the source image to compose and cleanup calls when available", async () => {
    runComposePromptWithProviderMock
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "the toll booth was always the product",
            selectedCandidateId: null,
            mediaSelectionReason: "text-only landed cleaner",
            whyThisReplyWorks: "it stays grounded in the source image",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "the toll booth was always the product",
            selectedCandidateId: null,
            mediaSelectionReason: "text-only landed cleaner",
            whyThisReplyWorks: "it stays grounded in the source image",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "the toll booth was always the product",
            selectedCandidateId: null,
            mediaSelectionReason: "text-only landed cleaner",
            whyThisReplyWorks: "it stays grounded in the source image",
            postingNotes: null
          })
        })
      );

    const model = createReplyComposerModel();
    await model.composeReply({
      request,
      subject,
      plan: {
        stance: "agree",
        angle: "reframe it as the business model",
        tone: "dry",
        intentSummary: "pile on",
        targetEffect: "keep the original image context in play",
        searchQueries: ["toll booth reaction", "grim agreement"],
        moodKeywords: ["grim", "dry"],
        candidateSelectionCriteria: ["stays grounded", "does not overexplain"],
        avoid: ["generic"]
      },
      candidates: []
    });

    expect(runComposePromptWithProviderMock.mock.calls[0]?.[1]?.imagePaths).toEqual(["data/raw/source-image.jpg"]);
    expect(runComposePromptWithProviderMock.mock.calls[1]?.[1]?.imagePaths).toEqual(["data/raw/source-image.jpg"]);
  });

  it("normalizes oversized plan fields and null draft explanations", async () => {
    runComposePromptWithProviderMock
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            stance: "agree",
            angle: "Make the joke land on the paycheck trigger",
            tone: "relatable",
            intentSummary: "supportive pile-on",
            targetEffect: "the salary logic feels immediate",
            searchQueries: ["direct deposit meme", "paid day reaction"],
            moodKeywords: ["resigned", "relief"],
            candidateSelectionCriteria: [
              "x".repeat(220),
              "visual metaphors for getting paid and instantly changing your tune"
            ],
            avoid: ["generic office filler"]
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "that direct deposit email hits and suddenly the job has layers",
            selectedCandidateId: null,
            mediaSelectionReason: null,
            whyThisReplyWorks: null,
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            replyText: "direct deposit hit and suddenly the job has layers",
            selectedCandidateId: null,
            mediaSelectionReason: null,
            whyThisReplyWorks: null,
            postingNotes: null
          })
        })
      );

    const model = new GeminiCliReplyComposerModel();
    const plan = await model.planReply({ request, subject });
    const draft = await model.composeReply({
      request,
      subject: {
        ...subject,
        tweetText: "\"I hate this job\" *gets paid*"
      },
      plan,
      candidates: []
    });

    expect(plan.candidateSelectionCriteria[0]?.length).toBeLessThanOrEqual(160);
    expect(draft.mediaSelectionReason).toBe("no candidate selected");
    expect(draft.whyThisReplyWorks).toBe("keeps the reply postable and on-angle");
  });

  it("defaults the reply composer factory to codex exec", () => {
    const model = createReplyComposerModel();

    expect(model.providerId).toBe("codex-exec");
  });

  it("can switch the reply composer factory back to Gemini CLI", () => {
    process.env.COMPOSE_MODEL_PROVIDER = "gemini-cli";

    const model = createReplyComposerModel();

    expect(model.providerId).toBe("gemini-cli");
  });
});
