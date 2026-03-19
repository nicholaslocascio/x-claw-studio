import { describe, expect, it } from "vitest";
import { cloneTweetDraftSchema, cloneTweetRequestSchema } from "@/src/lib/clone-tweet-composer";
import { manualPostRequestSchema } from "@/src/lib/manual-post-composer";
import { mediaPostDraftSchema, mediaPostRequestSchema } from "@/src/lib/media-post-composer";
import { replyCompositionDraftSchema, replyCompositionRequestSchema } from "@/src/lib/reply-composer";
import { topicPostDraftSchema, topicPostRequestSchema } from "@/src/lib/topic-composer";
import { createTypefullyDraftRequestSchema } from "@/src/lib/typefully";
import { resolveCloneTweetSource } from "@/src/server/clone-tweet-subject";

describe("clone tweet composer", () => {
  it("accepts pasted source text without a tweet id or url", () => {
    const parsed = cloneTweetRequestSchema.parse({
      sourceText: "every startup deck is just a prettier way to say please believe me",
      styleMode: "preserve",
      topicMode: "replace",
      mediaMode: "text_only"
    });

    expect(parsed.sourceText).toContain("startup deck");
    expect(parsed.mediaMode).toBe("text_only");
  });

  it("builds a text-only source subject from pasted source text", async () => {
    const result = await resolveCloneTweetSource({
      sourceText: "developers do not want more dashboards, they want fewer mysteries"
    });

    expect(result.source).toBe("text");
    expect(result.analysisStatus).toBe("not_applicable");
    expect(result.subject).toMatchObject({
      sourceKind: "tweet_text",
      tweetText: "developers do not want more dashboards, they want fewer mysteries",
      sourceMedia: []
    });
  });

  it("accepts long guidance fields across composer request schemas", () => {
    const longGuidance = "a".repeat(5000);

    expect(() =>
      replyCompositionRequestSchema.parse({
        usageId: "usage-1",
        angleHint: longGuidance,
        constraints: longGuidance
      })
    ).not.toThrow();

    expect(() =>
      topicPostRequestSchema.parse({
        topicId: "topic-1",
        angleHint: longGuidance,
        constraints: longGuidance
      })
    ).not.toThrow();

    expect(() =>
      mediaPostRequestSchema.parse({
        usageId: "usage-1",
        angleHint: longGuidance,
        constraints: longGuidance
      })
    ).not.toThrow();

    expect(() =>
      manualPostRequestSchema.parse({
        briefText: "launch note",
        angleHint: longGuidance,
        constraints: longGuidance,
        mustInclude: longGuidance,
        avoid: longGuidance
      })
    ).not.toThrow();

    expect(() =>
      cloneTweetRequestSchema.parse({
        sourceText: "source tweet",
        styleInstruction: longGuidance,
        topicInstruction: longGuidance,
        constraints: longGuidance,
        mustInclude: longGuidance,
        avoid: longGuidance
      })
    ).not.toThrow();
  });

  it("accepts long generated posts and draft bodies", () => {
    const longPost = "x".repeat(5000);

    expect(() =>
      replyCompositionDraftSchema.parse({
        replyText: longPost,
        selectedCandidateId: null,
        mediaSelectionReason: "text-only",
        whyThisReplyWorks: "no hard cap",
        postingNotes: null
      })
    ).not.toThrow();

    expect(() =>
      topicPostDraftSchema.parse({
        tweetText: longPost,
        selectedCandidateId: null,
        mediaSelectionReason: "text-only",
        whyThisTweetWorks: "no hard cap",
        postingNotes: null
      })
    ).not.toThrow();

    expect(() =>
      mediaPostDraftSchema.parse({
        tweetText: longPost,
        selectedCandidateId: null,
        mediaSelectionReason: "text-only",
        whyThisTweetWorks: "no hard cap",
        postingNotes: null
      })
    ).not.toThrow();

    expect(() =>
      cloneTweetDraftSchema.parse({
        tweetText: longPost,
        selectedCandidateId: null,
        mediaSelectionReason: "text-only",
        whyThisTweetWorks: "no hard cap",
        postingNotes: null
      })
    ).not.toThrow();

    expect(() =>
      createTypefullyDraftRequestSchema.parse({
        mode: "new_post",
        text: longPost
      })
    ).not.toThrow();
  });
});
