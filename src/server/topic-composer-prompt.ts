import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import type { TopicPostDraft, TopicPostPlan, TopicPostRequest, TopicPostSubject } from "@/src/lib/topic-composer";

const STOP_SLOP_SKILL_PATH = "@.agents/skills/stop-slop/SKILL.md";
const NANO_BANANA_SKILL_NAME = "nano-banana";

function buildPostShapeGuidance(): string[] {
  return [
    "- Choose a feed-native post shape before you choose the angle. Useful shapes: caption, compressed take, contrast, disbelief, institutional dunk, social truth, workflow truth, status line.",
    "- The post should feel like something a sharp account would actually tweet, not a clever summary prepared for a dashboard.",
    "- Keep the intelligence in the implication. Avoid explaining the insight if the line already lands.",
    "- Prefer concrete nouns, brands, roles, interfaces, objects, and quoted phrases over abstract nouns like narrative, discourse, paradigm, ecosystem, framing, or workflow.",
    "- If the line sounds like a polished takeaway, make it rougher and more post-like.",
    "- Strong openings often start with: when, how, every time, guy who, ok, imagine, a quoted line, or a blunt contrast."
  ];
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function buildGoalGuidance(goal: TopicPostRequest["goal"]): string[] {
  switch (goal) {
    case "consequence":
      return [
        "- Treat consequence as second-order framing. Surface what this move changes downstream for creators, audiences, workflows, or incentives.",
        "- Make the follow-on effect more important than the announcement itself.",
        "- Show the downstream scene or behavior change instead of summarizing it."
      ];
    case "contrarian":
      return [
        "- Treat contrarian as a real counter-read. Push against the lazy consensus or obvious company-centric framing.",
        "- The post should feel sharper than a recap, not just more negative.",
        "- Contrarian works best when it sounds inevitable or obvious in hindsight, not performatively edgy."
      ];
    case "product":
      return [
        "- Treat product as a workflow or tooling lens. Focus on what this means for the product surface, user behavior, or production loop.",
        "- Prefer operational detail over executive or corporate theater.",
        "- Product posts should still read like posts. Use one workflow detail, not a full product memo."
      ];
    case "signal_boost":
      return [
        "- Treat signal_boost as a clean, forceful framing of why the topic matters now.",
        "- The post can sound declarative, but it still needs one specific angle.",
        "- Think cleaner and more legible, not more formal."
      ];
    case "insight":
    default:
      return [
        "- Treat insight as the sharpest read, not necessarily the most novel one.",
        "- Find the line smart posters would wish they had said first."
      ];
  }
}

function stringifyJsonShape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildCandidateBlock(candidate: ReplyMediaCandidate): string {
  const lines = [
    `candidate_id: ${candidate.candidateId}`,
    `usage_id: ${candidate.usageId}`,
    `asset_id: ${candidate.assetId ?? "unknown"}`,
    `tweet_id: ${candidate.tweetId ?? "unknown"}`,
    `tweet_url: ${candidate.tweetUrl ?? "unknown"}`,
    `author_username: ${candidate.authorUsername ?? "unknown"}`,
    `created_at: ${candidate.createdAt ?? "unknown"}`,
    `media_kind: ${candidate.mediaKind ?? "unknown"}`,
    `source_type: ${candidate.sourceType}`,
    `source_label: ${candidate.sourceLabel ?? "unknown"}`,
    `combined_score: ${candidate.combinedScore.toFixed(3)}`,
    `tweet_text: ${candidate.tweetText ?? ""}`,
    `match_reason: ${candidate.matchReason ?? "unknown"}`,
    `caption_brief: ${candidate.analysis?.captionBrief ?? "unknown"}`,
    `scene_description: ${candidate.analysis?.sceneDescription ?? "unknown"}`,
    `primary_emotion: ${candidate.analysis?.primaryEmotion ?? "unknown"}`,
    `conveys: ${candidate.analysis?.conveys ?? "unknown"}`,
    `rhetorical_role: ${candidate.analysis?.rhetoricalRole ?? "unknown"}`,
    `cultural_reference: ${candidate.analysis?.culturalReference ?? "unknown"}`,
    `analogy_target: ${candidate.analysis?.analogyTarget ?? "unknown"}`,
    `search_keywords: ${candidate.analysis?.searchKeywords.join(", ") || "none"}`,
    `display_url: ${candidate.displayUrl ?? "unknown"}`,
    `local_file_path: ${candidate.localFilePath ?? "unknown"}`,
    `video_file_path: ${candidate.videoFilePath ?? "unknown"}`
  ];

  if (candidate.localFilePath) {
    lines.push(`candidate_attachment: @${candidate.localFilePath}`);
  }

  return lines.join("\n");
}

export function buildTopicPostPlanPrompt(input: {
  request: TopicPostRequest;
  subject: TopicPostSubject;
}): string {
  const { request, subject } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are planning a brand-new tweet from a topic cluster.",
    "Your job in this step is to decide the posting move, spoken register, and best local-media retrieval queries.",
    "You are not writing the final tweet yet.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Available tools after this step:",
    "- The application can run `x-media-analyst search facets --query <query> --format json` against a local media corpus.",
    "- Search works best with short retrieval phrases, mood descriptors, recognizable references, and concrete objects/scenes.",
    `- If the best move is to adapt an image rather than use it as-is, you may later choose an edit strategy that uses the ${NANO_BANANA_SKILL_NAME} skill.`,
    "",
    "Planning rules:",
    "- The tweet should feel like an original post, not a recap of the dashboard.",
    ...buildPostShapeGuidance(),
    "- Use the topic's current heat, sample tweets, and grounded-news context if available.",
    "- Prefer a sharper posting move than the representative tweets, not a paraphrase of them.",
    "- Search queries should target both message and visual tone.",
    "- Keep the final tweet plausibly postable under 280 characters.",
    ...buildGoalGuidance(request.goal),
    "",
    "Useful post shapes:",
    "- caption: name the scene people immediately recognize",
    "- compressed_take: condense a whole worldview into one line",
    "- contrast: put two eras, systems, or incentives side by side",
    "- institutional_dunk: make a company, role, or industry behavior look ridiculous",
    "- workflow_truth: point at the actual product or production behavior hiding under the headline",
    "- status_line: a short declarative line that signals taste or timing",
    "",
    "Bad vs good:",
    "- Bad: 'The real shift is which defaults get baked into the toolchain.'",
    "- Better: 'space is just edge compute with worse cooling'",
    "- Bad: 'This announcement matters for creator workflows downstream.'",
    "- Better: 'physical access requires a rocket launch'",
    "",
    `Goal: ${request.goal}`,
    `Topic label: ${subject.label}`,
    `Topic kind: ${subject.kind}`,
    `Topic hotness: ${subject.hotnessScore.toFixed(2)}`,
    `Topic tweet_count: ${subject.tweetCount}`,
    `Topic recent_24h: ${subject.recentTweetCount24h}`,
    `Topic stale: ${subject.isStale ? "true" : "false"}`,
    `Most recent mention: ${subject.mostRecentAt ?? "unknown"}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    "",
    "Suggested angles:",
    formatList(subject.suggestedAngles),
    "",
    "Representative tweets:",
    ...subject.representativeTweets.map((tweet, index) => `- ${index + 1}. @${tweet.authorUsername ?? "unknown"}: ${tweet.text ?? ""}`),
    "",
    "Grounded news:",
    `- summary: ${subject.groundedNews?.summary ?? "none"}`,
    `- why_now: ${subject.groundedNews?.whyNow ?? "none"}`,
    `- sources: ${subject.groundedNews?.sources.map((source) => source.title).join(", ") || "none"}`,
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      angle: "posting move plus the concrete point it makes",
      tone: "spoken register, not a marketing adjective",
      postIntent: "what kind of post this is in the feed",
      targetReaction: "what should click without being explained",
      searchQueries: ["query one", "query two"],
      candidateSelectionCriteria: ["criterion one", "criterion two"],
      avoid: ["thing to avoid"]
    } satisfies TopicPostPlan)
  ].join("\n");
}

export function buildTopicPostPrompt(input: {
  request: TopicPostRequest;
  subject: TopicPostSubject;
  plan: TopicPostPlan;
  candidates: ReplyMediaCandidate[];
}): string {
  const { request, subject, plan, candidates } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    `If image editing would materially improve the result, you may invoke the ${NANO_BANANA_SKILL_NAME} skill to adapt a candidate image.`,
    "You are writing a brand-new tweet from a topic cluster and choosing one local media candidate.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Tweet rules:",
    "- The tweet text must fit within 280 characters.",
    "- It should read like an original post, not commentary on the dashboard or notes about data.",
    "- Be specific and postable. Avoid generic 'big shift' language.",
    "- Use the planned angle, but tighten it into one clean post shape.",
    "- You may be witty, critical, bullish, dry, blunt, or deadpan if it fits the topic and hints.",
    "- Match the requested goal. A consequence post should foreground downstream effects; a contrarian post should plainly reject the default framing; a product post should stay anchored on tooling or workflow behavior.",
    "- Favor caption voice, compressed takes, contrasts, institutional dunks, and workflow truths over analytical summary voice.",
    "- Use concrete nouns and familiar references. If the line leans on abstract words like framing, narrative, paradigm, ecosystem, discourse, or workflow without a concrete scene, rewrite it.",
    "- Do not explain the point after the point lands.",
    "- One sentence is usually enough. If you need two, the second should escalate rather than explain.",
    "- Prefer native post openings like when / how / every time / guy who / quoted dialogue when they fit.",
    "- Fragments are allowed if they sound more native than a polished sentence.",
    "- Keep `mediaSelectionReason`, `whyThisTweetWorks`, and `postingNotes` concise.",
    "- Choose `selectedCandidateId` only from the provided candidates.",
    "- If none fit, set `selectedCandidateId` to null and still return the best text-only tweet.",
    "",
    `Goal: ${request.goal}`,
    `Topic label: ${subject.label}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    "",
    "Planned direction:",
    `- angle: ${plan.angle}`,
    `- tone: ${plan.tone}`,
    `- post_intent: ${plan.postIntent}`,
    `- target_reaction: ${plan.targetReaction}`,
    "Selection criteria:",
    formatList(plan.candidateSelectionCriteria),
    "Avoid:",
    formatList(plan.avoid),
    "",
    "Representative tweets:",
    ...subject.representativeTweets.map((tweet, index) => `- ${index + 1}. @${tweet.authorUsername ?? "unknown"}: ${tweet.text ?? ""}`),
    "",
    `Grounded summary: ${subject.groundedNews?.summary ?? "none"}`,
    `Grounded why_now: ${subject.groundedNews?.whyNow ?? "none"}`,
    "",
    candidates.length > 0 ? "Candidates:" : "Candidates: none",
    candidates.map((candidate, index) => [`Candidate ${index + 1}`, buildCandidateBlock(candidate)].join("\n")).join("\n\n"),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      tweetText: "single tweet under 280 chars",
      selectedCandidateId: "candidate-1 or null",
      mediaSelectionReason: "why the chosen candidate fits the tweet",
      whyThisTweetWorks: "why the tweet and media pairing works",
      postingNotes: "optional posting note, or null"
    } satisfies TopicPostDraft)
  ].join("\n");
}

export function buildTopicPostCleanupPrompt(input: {
  request: TopicPostRequest;
  subject: TopicPostSubject;
  plan: TopicPostPlan;
  draft: TopicPostDraft;
}): string {
  const { request, subject, plan, draft } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are cleaning a generated X post draft before it is considered done.",
    "Rewrite only as needed to remove slop while preserving the same point, tone target, and selected media choice.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Cleanup rules:",
    "- Keep the same `selectedCandidateId` exactly.",
    "- Keep the same angle and topic framing.",
    "- Remove filler, predictable contrasts, and generic grandstanding.",
    "- Rewrite analytical summary voice into posting voice when needed.",
    "- Prefer captions, compressed takes, contrasts, and institutional dunks over thesis statements.",
    "- Cut abstract nouns when a concrete scene can carry the point.",
    "- End earlier. Remove any sentence that explains what the first sentence already implied.",
    "- If the line still sounds too polished, roughen the register slightly. Lowercase and fragments are allowed.",
    "- Prefer a native opener or a hard contrast over a neat explanatory thesis.",
    "- Use ASCII punctuation only.",
    "- Do not use em dashes, en dashes, curly quotes, or unicode ellipses.",
    "- Keep `tweetText` under 280 characters.",
    "- Keep `mediaSelectionReason`, `whyThisTweetWorks`, and `postingNotes` concise.",
    "",
    `Goal: ${request.goal}`,
    `Topic label: ${subject.label}`,
    `Planned angle: ${plan.angle}`,
    "",
    "Draft to clean:",
    stringifyJsonShape(draft),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      tweetText: "cleaned single tweet under 280 chars",
      selectedCandidateId: draft.selectedCandidateId,
      mediaSelectionReason: "cleaned reason",
      whyThisTweetWorks: "cleaned explanation",
      postingNotes: "cleaned note or null"
    } satisfies TopicPostDraft)
  ].join("\n");
}
