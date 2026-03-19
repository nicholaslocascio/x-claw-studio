import { describe, expect, it } from "vitest";
import type { ManualPostDraft, ManualPostPlan, ManualPostRequest, ManualPostSubject } from "@/src/lib/manual-post-composer";
import {
  buildManualPostCleanupPrompt,
  buildManualPostPlanPrompt,
  buildManualPostPrompt
} from "@/src/server/manual-post-composer-prompt";

const request: ManualPostRequest = {
  briefText:
    'replying to a beach WFH clip. do the girls-working-from-the-pool callback and make it feel like a big short top signal.',
  toneHint: "sharp and feed-native",
  targetAudience: "founders, devtools people, crypto timeline, designers",
  angleHint: "big short top signal, not a recap of the clip",
  constraints: "make it postable, not essay-like",
  mustInclude: 'girls-working-from-the-pool or michael burry',
  avoid: "re-describing the visible clip"
};

const subject: ManualPostSubject = {
  briefText:
    'replying to a beach WFH clip. do the girls-working-from-the-pool callback and make it feel like a big short top signal.',
  extractedHooks: ["beach WFH clip", "girls-working-from-the-pool", "michael burry", "top signal"],
  sourceMode: "general",
  trendContext: null
};

const plan: ManualPostPlan = {
  angle: "Use the clip as proof and spend the tweet on the market-top callback.",
  tone: "sharp and feed-native",
  postIntent: "status line",
  targetReaction: "Readers instantly recognize a top signal without needing the clip narrated back to them.",
  searchQueries: ["girls working from the pool", "michael burry headphones"],
  candidateSelectionCriteria: ["media already carries the setup", "callback lands fast"],
  hooks: ["girls-working-from-the-pool", "michael burry", "top signal"],
  avoid: ["scene description", "essay voice"]
};

const draft: ManualPostDraft = {
  tweetText: 'routers, desks, laptops on the sand. this is the 2026 girls-working-from-the-pool clip. michael burry just put the headphones on.',
  selectedCandidateId: "candidate-3",
  mediaSelectionReason: "The clip already supplies the beach-office proof.",
  whyThisTweetWorks: "It turns the clip into a clean market-top callback.",
  postingNotes: null
};

describe("manual post composer prompts", () => {
  it("tells planning to rely on adjacent media instead of re-describing it", () => {
    const prompt = buildManualPostPlanPrompt({ request, subject });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(prompt).toContain("If the post will sit beside attached media, spend the text on the reaction, verdict, or callback");
    expect(prompt).toContain("Assume the viewer can already see the image or clip.");
  });

  it("tells composition to treat selected media as visible context", () => {
    const prompt = buildManualPostPrompt({ request, subject, plan, candidates: [] });

    expect(prompt).toContain("If you choose a media candidate, treat the attachment as visible context.");
    expect(prompt).toContain("When the media is doing the setup, use the text for the market read, callback, accusation, joke, or verdict.");
    expect(prompt).toContain("If the draft reads like a caption describing the asset beside it, rewrite it as a reaction to that asset.");
  });

  it("tells cleanup to delete narration that duplicates attached media", () => {
    const prompt = buildManualPostCleanupPrompt({
      request,
      subject,
      plan,
      draft
    });

    expect(prompt).toContain("If selectedCandidateId is not null, assume the media sits beside the post.");
    expect(prompt).toContain("Delete scene-setting or object lists that merely narrate the attachment.");
    expect(prompt).toContain('"selectedCandidateId": "candidate-3"');
  });

  it("adds trend-digest structure guidance when the source mode is trend_digest", () => {
    const trendSubject: ManualPostSubject = {
      ...subject,
      sourceMode: "trend_digest",
      trendContext: {
        timeframeHours: 48,
        generatedAt: "2026-03-18T18:00:00.000Z",
        topicCount: 2,
        tweetCount: 2,
        topics: [
          {
            label: "OpenAI",
            kind: "entity",
            hotnessScore: 9.6,
            recentTweetCount24h: 4,
            tweetCount: 8,
            mostRecentAt: "2026-03-18T16:00:00.000Z",
            whyNow: "Microsoft and Amazon are both in the story"
          }
        ],
        tweets: [
          {
            authorUsername: "alice",
            text: "OpenAI changed the cloud stack again",
            likes: 32000,
            topicLabel: "OpenAI",
            createdAt: "2026-03-18T15:00:00.000Z"
          }
        ]
      }
    };

    const planPrompt = buildManualPostPlanPrompt({ request, subject: trendSubject });
    const composePrompt = buildManualPostPrompt({ request, subject: trendSubject, plan, candidates: [] });

    expect(planPrompt).toContain("This is a trend digest post, not a normal one-angle take.");
    expect(planPrompt).toContain("5 to 10 stacked `>` lines");
    expect(planPrompt).toContain("Structured trend context:");
    expect(planPrompt).toContain("Reference examples:");
    expect(composePrompt).toContain("If this is a trend digest, prefer one continuous post with stacked quote-style lines");
    expect(composePrompt).toContain("OpenAI");
    expect(composePrompt).toContain("likes=32000");
  });
});
