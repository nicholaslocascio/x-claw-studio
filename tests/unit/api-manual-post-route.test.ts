import { beforeEach, describe, expect, it, vi } from "vitest";

const composeTweetFromManualBriefMock = vi.fn();

vi.mock("@/src/server/manual-post-composer", () => ({
  composeTweetFromManualBrief: composeTweetFromManualBriefMock
}));

vi.mock("@/src/server/generated-drafts", () => ({
  createGeneratedDraft: vi.fn(() => ({
    draftId: "manual-post-1"
  })),
  markGeneratedDraftComplete: vi.fn(),
  updateGeneratedDraft: vi.fn()
}));

describe("/api/manual-post/compose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams a composed post result", async () => {
    composeTweetFromManualBriefMock.mockResolvedValue({
      provider: "test-model",
      request: {
        briefText: "launch note",
        toneHint: "sharp",
        targetAudience: "founders",
        angleHint: "",
        constraints: "",
        mustInclude: "ship",
        avoid: "hype"
      },
      subject: {
        briefText: "launch note",
        extractedHooks: ["launch note"]
      },
      plan: {
        angle: "status line",
        tone: "dry",
        postIntent: "announce",
        targetReaction: "instant click",
        searchQueries: ["launch", "terminal screenshot"],
        candidateSelectionCriteria: ["fits the point", "stays legible"],
        hooks: ["launch"],
        avoid: ["generic hype"]
      },
      tweet: {
        text: "shipping the thing was the easy part",
        mediaSelectionReason: "text-only lands cleanest",
        whyThisTweetWorks: "short and specific",
        postingNotes: null
      },
      search: {
        provider: "test-search",
        queries: ["launch", "terminal screenshot"],
        resultCount: 0,
        warning: null,
        wishlistSavedCount: 0
      },
      selectedMedia: null,
      alternativeMedia: []
    });

    const { POST } = await import("@/app/api/manual-post/compose/route");
    const response = await POST(
      new Request("http://localhost:4105/api/manual-post/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefText: "launch note",
          toneHint: "sharp",
          targetAudience: "founders",
          mustInclude: "ship",
          avoid: "hype"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(composeTweetFromManualBriefMock).toHaveBeenCalledWith(
      expect.objectContaining({
        briefText: "launch note",
        toneHint: "sharp",
        targetAudience: "founders",
        mustInclude: "ship",
        avoid: "hype"
      }),
      expect.any(Object)
    );
    const text = await response.text();
    expect(text).toContain("\"type\":\"result\"");
    expect(text).toContain("shipping the thing was the easy part");
  });
});
