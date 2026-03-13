import { describe, expect, it } from "vitest";
import type { MediaPostDraft, MediaPostPlan, MediaPostRequest, MediaPostSubject } from "@/src/lib/media-post-composer";
import {
  buildMediaPostCleanupPrompt,
  buildMediaPostPlanPrompt,
  buildMediaPostPrompt
} from "@/src/server/media-post-composer-prompt";

const request: MediaPostRequest = {
  usageId: "usage-1",
  toneHint: "dry",
  angleHint: "make the hardware point",
  constraints: "keep it short"
};

const subject: MediaPostSubject = {
  usageId: "usage-1",
  tweetId: "tweet-1",
  assetId: "asset-1",
  assetUsageCount: 3,
  mediaKind: "image",
  authorUsername: "example",
  createdAt: "2026-03-11T17:00:00.000Z",
  tweetText: "Look at this tiny box.",
  localFilePath: "data/example.jpg",
  playableFilePath: null,
  analysis: {
    captionBrief: "Tiny hardware on a desk",
    sceneDescription: "A palm-sized device beside a bottle cap",
    primaryEmotion: "curiosity",
    emotionalTone: "dry",
    conveys: "small hardware can do real work",
    userIntent: "show a tiny computer",
    rhetoricalRole: "evidence",
    textMediaRelationship: "grounds the claim",
    culturalReference: null,
    analogyTarget: null,
    trendSignal: "local-first hardware",
    audienceTakeaway: "consumer gear can handle more than expected",
    brandSignals: ["DIY"],
    searchKeywords: ["tiny computer", "maker device"]
  },
  relatedTopics: [
    {
      label: "Edge AI",
      hotnessScore: 9.1,
      stance: "supportive",
      sentiment: "positive",
      whyNow: "People are arguing about cost and footprint."
    }
  ],
  priorUsages: [
    {
      authorUsername: "oldpost",
      createdAt: "2026-03-10T12:00:00.000Z",
      tweetText: "Small box, big trick."
    }
  ]
};

const plan: MediaPostPlan = {
  angle: "Tiny hardware makes the bloated-server story look optional.",
  tone: "dry",
  postIntent: "Connect the image to the current edge-compute moment.",
  targetReaction: "Readers should question why inference stacks are so bloated.",
  searchQueries: ["tiny computer", "server rack"],
  candidateSelectionCriteria: ["supports the edge-compute point", "stays grounded"],
  supportingTopics: ["Edge AI"],
  avoid: ["generic future talk"]
};

const draft: MediaPostDraft = {
  tweetText: "This bottlecap computer isn’t cute—it’s a receipt for how much infra bloat is self-inflicted.",
  selectedCandidateId: "candidate-9",
  mediaSelectionReason: "The tiny hardware visual makes the point instantly.",
  whyThisTweetWorks: "It turns the asset into a clean argument about hardware efficiency.",
  postingNotes: null
};

describe("media post composer prompts", () => {
  it("tells Gemini to load the stop-slop skill for planning and final composition", () => {
    const planPrompt = buildMediaPostPlanPrompt({ request, subject });
    const composePrompt = buildMediaPostPrompt({ request, subject, plan, candidates: [] });

    expect(planPrompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(planPrompt).toContain("Pick the post shape first.");
    expect(planPrompt).toContain("Bad: 'This demonstrates the democratization of local AI.'");
    expect(planPrompt).toContain("If the asset is direct proof, prefer a verdict, contrast, or status line over scene-setting.");
    expect(composePrompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(composePrompt).toContain("Favor caption voice, contrast, social-truth compression, institutional dunks, and workflow truths");
    expect(composePrompt).toContain("Prefer hard contrasts and status lines over explanatory setup");
    expect(composePrompt).toContain("Protect strong blunt claims.");
  });

  it("builds a cleanup pass that preserves media choice and bans smart punctuation", () => {
    const prompt = buildMediaPostCleanupPrompt({
      request,
      subject,
      plan,
      draft
    });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(prompt).toContain("Keep the same `selectedCandidateId` exactly.");
    expect(prompt).toContain("Do not use em dashes, en dashes, curly quotes, or unicode ellipses.");
    expect(prompt).toContain('"selectedCandidateId": "candidate-9"');
  });
});
