import { describe, expect, it } from "vitest";
import { buildTopicPostCleanupPrompt, buildTopicPostPlanPrompt, buildTopicPostPrompt } from "@/src/server/topic-composer-prompt";
import type { TopicPostDraft, TopicPostPlan, TopicPostRequest, TopicPostSubject } from "@/src/lib/topic-composer";

const request: TopicPostRequest = {
  topicId: "topic-1",
  goal: "product",
  mode: "single",
  toneHint: "sharp and specific",
  angleHint: "focus on product not company",
  constraints: "keep it punchy and postable"
};

const subject: TopicPostSubject = {
  topicId: "topic-1",
  label: "Ben Affleck AI Film Deal",
  kind: "news",
  hotnessScore: 9.7,
  tweetCount: 42,
  recentTweetCount24h: 31,
  isStale: false,
  mostRecentAt: "2026-03-11T17:00:00.000Z",
  suggestedAngles: ["The tooling shift matters more than the celebrity wrapper."],
  representativeTweets: [
    {
      authorUsername: "example",
      text: "Ben Affleck signs AI film deal.",
      createdAt: "2026-03-11T17:00:00.000Z"
    }
  ],
  groundedNews: {
    summary: "Affleck attached his name to an AI-assisted film production deal.",
    whyNow: "The announcement pulled film-tech discourse back toward workflow questions.",
    sources: [{ title: "Example", uri: "https://example.com" }]
  }
};

const plan: TopicPostPlan = {
  angle: "The real story is which production steps become product defaults.",
  tone: "sharp and specific",
  postIntent: "Shift the frame from celebrity to workflow.",
  targetReaction: "Make the product implications feel more concrete than the headline.",
  searchQueries: ["editing suite", "storyboard factory"],
  candidateSelectionCriteria: ["supports workflow framing", "feels precise"],
  avoid: ["celebrity recap"]
};

const draft: TopicPostDraft = {
  tweetText: "The real film-AI shift isn’t the celeb deal—it’s which production defaults get baked into the toolchain.",
  selectedCandidateId: "candidate-2",
  mediaSelectionReason: "The factory image fits the workflow angle.",
  whyThisTweetWorks: "It keeps the post on product behavior instead of celebrity chatter.",
  postingNotes: null
};

describe("topic composer prompts", () => {
  it("tells Gemini to load the stop-slop skill for planning", () => {
    const prompt = buildTopicPostPlanPrompt({ request, subject });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
  });

  it("includes goal-specific planning guidance", () => {
    const prompt = buildTopicPostPlanPrompt({ request, subject });

    expect(prompt).toContain("Goal: product");
    expect(prompt).toContain("Treat product as a workflow or tooling lens.");
    expect(prompt).toContain("Prefer operational detail over executive or corporate theater.");
    expect(prompt).toContain("Choose a feed-native post shape before you choose the angle.");
    expect(prompt).toContain("Bad: 'The real shift is which defaults get baked into the toolchain.'");
  });

  it("passes the goal into final composition", () => {
    const prompt = buildTopicPostPrompt({
      request: {
        ...request,
        goal: "consequence"
      },
      subject,
      plan,
      candidates: []
    });

    expect(prompt).toContain("Goal: consequence");
    expect(prompt).toContain("A consequence post should foreground downstream effects");
    expect(prompt).toContain("Favor caption voice, compressed takes, contrasts, institutional dunks, and workflow truths");
    expect(prompt).toContain("Prefer native post openings like when / how / every time / guy who / quoted dialogue");
  });

  it("builds a cleanup pass that preserves selection and bans smart punctuation", () => {
    const prompt = buildTopicPostCleanupPrompt({
      request,
      subject,
      plan,
      draft
    });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(prompt).toContain("Keep the same `selectedCandidateId` exactly.");
    expect(prompt).toContain("Do not use em dashes, en dashes, curly quotes, or unicode ellipses.");
    expect(prompt).toContain('"selectedCandidateId": "candidate-2"');
  });
});
