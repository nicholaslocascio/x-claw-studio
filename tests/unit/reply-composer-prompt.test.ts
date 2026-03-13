import { describe, expect, it } from "vitest";
import {
  buildReplyCompositionCleanupPrompt,
  buildReplyCompositionPlanPrompt,
  buildReplyCompositionPrompt
} from "@/src/server/reply-composer-prompt";
import type { ReplyCompositionDraft, ReplyCompositionPlan, ReplyCompositionRequest, ReplyComposerSubject } from "@/src/lib/reply-composer";

const request: ReplyCompositionRequest = {
  usageId: "usage-1",
  goal: "insight",
  mode: "single",
  toneHint: "sharp but grounded",
  angleHint: "show the monopoly angle",
  constraints: "keep it postable"
};

const subject: ReplyComposerSubject = {
  usageId: "usage-1",
  tweetId: "tweet-1",
  tweetUrl: "https://x.com/example/status/1",
  authorUsername: "example",
  createdAt: "2026-03-11T10:00:00.000Z",
  tweetText: "Cloudflare is betraying the open web.",
  mediaKind: "image",
  analysis: {
    captionBrief: "A villain reveal reaction image",
    sceneDescription: "A smug reveal",
    primaryEmotion: "smugness",
    conveys: "calculated control",
    userIntent: "call out strategy",
    rhetoricalRole: "reaction",
    textMediaRelationship: "sharpens the claim",
    culturalReference: "villain reveal",
    analogyTarget: "platform gatekeeping",
    searchKeywords: ["villain", "reveal"]
  }
};

const plan: ReplyCompositionPlan = {
  stance: "disagree",
  angle: "This was strategy, not betrayal",
  tone: "dry and pointed",
  intentSummary: "Reframe the move as a moat play",
  targetEffect: "Make the incentive structure feel obvious",
  searchQueries: ["villain reveal", "gatekeeper toll booth"],
  moodKeywords: ["smug", "calculated"],
  candidateSelectionCriteria: ["fits the monopoly angle", "does not overexplain"],
  avoid: ["generic startup hype"]
};

const draft: ReplyCompositionDraft = {
  replyText: "This isn't a prediction—it’s an excuse to keep bad pricing in place.",
  selectedCandidateId: "candidate-1",
  mediaSelectionReason: "The image makes the timeline creep obvious.",
  whyThisReplyWorks: "It sharpens the point without repeating the original tweet.",
  postingNotes: null
};

describe("reply composer prompts", () => {
  it("tells Gemini to load the stop-slop skill for planning", () => {
    const prompt = buildReplyCompositionPlanPrompt({ request, subject });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
  });

  it("tells Gemini to load the stop-slop skill for final composition", () => {
    const prompt = buildReplyCompositionPrompt({
      request,
      subject,
      plan,
      candidates: []
    });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
  });

  it("renders tweet-only subjects without a usage id", () => {
    const prompt = buildReplyCompositionPlanPrompt({
      request: {
        tweetId: "tweet-2",
        goal: "support",
        mode: "single"
      },
      subject: {
        ...subject,
        usageId: null,
        tweetId: "tweet-2",
        mediaKind: "none"
      }
    });

    expect(prompt).toContain("Subject usageId: none");
    expect(prompt).toContain("Subject media_kind: none");
  });

  it("tells critique planning to disagree instead of reinforcing", () => {
    const prompt = buildReplyCompositionPlanPrompt({
      request: {
        usageId: "usage-1",
        goal: "critique",
        mode: "single"
      },
      subject
    });

    expect(prompt).toContain("Treat critique as real pushback");
    expect(prompt).toContain("Critique should usually land as disbelief, a dunk, or a blunt counter-caption");
    expect(prompt).toContain("Bad: 'Speech is low-bandwidth for syntax.'");
    expect(prompt).toContain("Do not merely agree with the tweet in a harsher tone");
    expect(prompt).toContain("Strong replies often hinge on one weirdly specific detail");
    expect(prompt).toContain("Do not just continue the source tweet's wording pattern");
    expect(prompt).toContain('"stance": "agree, disagree, or mixed"');
  });

  it("teaches support planning to anchor short jokes in the reversal trigger", () => {
    const prompt = buildReplyCompositionPlanPrompt({
      request: {
        usageId: "usage-1",
        goal: "support",
        mode: "single"
      },
      subject
    });

    expect(prompt).toContain("grab the moment of reversal");
  });

  it("passes the planned stance into final composition", () => {
    const prompt = buildReplyCompositionPrompt({
      request: {
        ...request,
        goal: "critique"
      },
      subject,
      plan,
      candidates: []
    });

    expect(prompt).toContain("- stance: disagree");
    expect(prompt).toContain("If the goal is critique, do not return a reply that mostly agrees with the tweet.");
    expect(prompt).toContain("Favor caption voice, disbelief, pile-on, social-truth compression, or fake dialogue");
    expect(prompt).toContain("Prefer native post openings like when / every time / how / guy who / ok / imagine");
    expect(prompt).toContain("If the source tweet is long, reply to one vivid detail, not the entire argument.");
    expect(prompt).toContain("If the reply could work under dozens of unrelated tweets, it is too generic.");
    expect(prompt).toContain("direct deposit");
  });

  it("builds a cleanup pass that keeps the selected media and bans unicode punctuation", () => {
    const prompt = buildReplyCompositionCleanupPrompt({
      request,
      subject,
      plan,
      draft
    });

    expect(prompt).toContain("@.agents/skills/stop-slop/SKILL.md");
    expect(prompt).toContain("Keep the same `selectedCandidateId` exactly.");
    expect(prompt).toContain("Do not use em dashes, en dashes, curly quotes, or unicode ellipses.");
    expect(prompt).toContain('"selectedCandidateId": "candidate-1"');
  });
});
