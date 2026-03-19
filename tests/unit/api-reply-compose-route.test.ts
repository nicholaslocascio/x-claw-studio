import { beforeEach, describe, expect, it, vi } from "vitest";

const composeReplyForUsageMock = vi.fn();
const composeRepliesForAllGoalsMock = vi.fn();
let capturedOnProgress: ((event: {
  stage: string;
  message: string;
  detail?: string | null;
  goal?: "insight" | null;
}) => void) | null = null;

vi.mock("@/src/server/reply-composer", () => ({
  composeReplyForUsage: composeReplyForUsageMock,
  composeRepliesForAllGoals: composeRepliesForAllGoalsMock
}));

vi.mock("@/src/server/generated-drafts", () => ({
  createGeneratedDraft: vi.fn(() => ({
    draftId: "reply-1"
  })),
  markGeneratedDraftComplete: vi.fn(),
  updateGeneratedDraft: vi.fn()
}));

describe("/api/reply/compose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnProgress = null;
  });

  it("ignores late progress writes after the stream closes", async () => {
    composeReplyForUsageMock.mockImplementation(async (_body, options) => {
      capturedOnProgress = options?.onProgress ?? null;

      return {
        provider: "test-model",
        request: {
          usageId: "usage-1",
          goal: "insight",
          mode: "single"
        },
        subject: {
          usageId: "usage-1",
          tweetId: "tweet-1",
          tweetUrl: "https://x.com/test/status/1",
          authorUsername: "tester",
          createdAt: "2026-03-12T20:00:00.000Z",
          tweetText: "subject tweet",
          mediaKind: "image",
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
        },
        plan: {
          stance: "agree",
          angle: "tight agreement",
          tone: "dry",
          intentSummary: "join the point",
          targetEffect: "make the follow-up sharper",
          searchQueries: ["reaction image", "clean nod"],
          moodKeywords: ["dry", "knowing"],
          candidateSelectionCriteria: ["supports the read", "stays legible"],
          avoid: ["generic"]
        },
        reply: {
          text: "clean add-on",
          whyThisReplyWorks: "stays specific",
          postingNotes: null,
          mediaSelectionReason: "text-only"
        },
        search: {
          provider: "test-search",
          queries: ["reaction image", "clean nod"],
          resultCount: 0,
          warning: null,
          wishlistSavedCount: 0
        },
        selectedMedia: null,
        alternativeMedia: []
      };
    });

    const { POST } = await import("@/app/api/reply/compose/route");
    const response = await POST(
      new Request("http://localhost:4105/api/reply/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usageId: "usage-1",
          goal: "insight",
          mode: "single"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("\"type\":\"result\"");
    expect(capturedOnProgress).not.toBeNull();
    expect(() =>
      capturedOnProgress?.({
        stage: "completed",
        message: "Saved missing asset ideas to the wishlist",
        detail: "reaction image",
        goal: "insight"
      })
    ).not.toThrow();
  });

  it("logs stream failures and emits an error event", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    composeReplyForUsageMock.mockRejectedValue(new Error("compose blew up"));

    const { POST } = await import("@/app/api/reply/compose/route");
    const response = await POST(
      new Request("http://localhost:4105/api/reply/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usageId: "usage-1",
          goal: "insight",
          mode: "single"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("\"error\":\"compose blew up\"");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[api:reply/compose.stream] POST /api/reply/compose failed: compose blew up",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
