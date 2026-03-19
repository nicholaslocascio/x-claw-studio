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
  constraints: "keep it postable",
  revisionFeedback: "make it less smug and try a different media direction",
  revisionOriginalReplyText: "Cloudflare wants applause for charging rent on the lock they installed.",
  revisionSelectedMediaContext:
    "label: villain reveal | source_type: usage_facet | asset_id: asset-9 | usage_id: usage-9 | scene: smug boardroom reveal | emotion: smugness | conveys: calculated control"
};

const subject: ReplyComposerSubject = {
  usageId: "usage-1",
  tweetId: "tweet-1",
  tweetUrl: "https://x.com/example/status/1",
  authorUsername: "example",
  createdAt: "2026-03-11T10:00:00.000Z",
  tweetText: "Cloudflare is betraying the open web.",
  mediaKind: "image",
  localFilePath: "data/raw/cloudflare.jpg",
  playableFilePath: null,
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
    expect(prompt).toContain("The corpus is rich in facets like scene_description, conveys, rhetorical_role, metaphor");
    expect(prompt).toContain("Do not overfit to one exact meme template name");
    expect(prompt).toContain("Balance across these concepts when possible");
    expect(prompt).toContain("You are not captioning attached media.");
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

  it("pushes search planning toward vibe and metaphor instead of exact meme names", () => {
    const prompt = buildReplyCompositionPlanPrompt({ request, subject });

    expect(prompt).toContain("Prefer short descriptive phrases over exact meme titles");
    expect(prompt).toContain("Use at least one query that names the kind of asset or rhetorical role you want");
    expect(prompt).toContain("Use at least one query that names the analogy target or social truth behind the joke");
    expect(prompt).toContain("Bad search: 'drake hotline bling meme'");
    expect(prompt).toContain("Better search: 'smug reaction video' or 'guy acting pleased while caught'");
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
    expect(prompt).toContain("Treat `mediaSelectionReason`, `whyThisReplyWorks`, and `postingNotes` as terse operator notes");
    expect(prompt).toContain("Do not use `mediaSelectionReason` or `whyThisReplyWorks` to narrate the selected image or clip.");
    expect(prompt).toContain("Better note: 'Hits the fake authority angle without restating the tweet.'");
    expect(prompt).toContain("Revision feedback: make it less smug and try a different media direction");
    expect(prompt).toContain(
      "Previous generated reply: Cloudflare wants applause for charging rent on the lock they installed."
    );
    expect(prompt).toContain("Previous selected media context: label: villain reveal | source_type: usage_facet");
    expect(prompt).toContain("Subject tweet URL: https://x.com/example/status/1");
    expect(prompt).toContain("Subject local_file_path: data/raw/cloudflare.jpg");
    expect(prompt).toContain("Subject media analysis:");
    expect(prompt).toContain("- scene_description: A smug reveal");
    expect(prompt).toContain("- text_media_relationship: sharpens the claim");
    expect(prompt).toContain("Subject attachment: @data/raw/cloudflare.jpg");
  });

  it("uses the source video path as the attachment when no local image exists", () => {
    const prompt = buildReplyCompositionPrompt({
      request,
      subject: {
        ...subject,
        mediaKind: "video",
        localFilePath: null,
        playableFilePath: "data/raw/cloudflare.mp4"
      },
      plan,
      candidates: []
    });

    expect(prompt).toContain("Subject video_file_path: data/raw/cloudflare.mp4");
    expect(prompt).toContain("Subject attachment: @data/raw/cloudflare.mp4");
  });

  it("includes video candidate attachments when only a playable file exists", () => {
    const prompt = buildReplyCompositionPrompt({
      request,
      subject,
      plan,
      candidates: [
        {
          candidateId: "candidate-video",
          usageId: "usage-2",
          assetId: "asset-2",
          tweetId: "tweet-2",
          tweetUrl: "https://x.com/example/status/2",
          authorUsername: "other",
          createdAt: "2026-03-11T11:00:00.000Z",
          tweetText: "video candidate",
          displayUrl: null,
          localFilePath: null,
          videoFilePath: "data/raw/candidate.mp4",
          mediaKind: "video",
          combinedScore: 0.9,
          rankingScore: 0.9,
          assetStarred: false,
          assetUsageCount: 1,
          duplicateGroupUsageCount: 1,
          hotnessScore: null,
          matchReason: "same energy",
          sourceType: "usage_facet",
          sourceLabel: "video candidate",
          analysis: null
        }
      ]
    });

    expect(prompt).toContain("video_file_path: data/raw/candidate.mp4");
    expect(prompt).toContain("candidate_attachment: @data/raw/candidate.mp4");
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
    expect(prompt).toContain("Do not let `mediaSelectionReason` or `whyThisReplyWorks` drift into captioning the media.");
    expect(prompt).toContain("Do not use em dashes, en dashes, curly quotes, or unicode ellipses.");
    expect(prompt).toContain(
      "Previous generated reply: Cloudflare wants applause for charging rent on the lock they installed."
    );
    expect(prompt).toContain("Previous selected media context: label: villain reveal | source_type: usage_facet");
    expect(prompt).toContain('"selectedCandidateId": "candidate-1"');
  });
});
