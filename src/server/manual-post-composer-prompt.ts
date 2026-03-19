import type { ManualPostDraft, ManualPostPlan, ManualPostRequest, ManualPostSubject } from "@/src/lib/manual-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import { formatTrendDigestExamplesForPrompt } from "@/src/server/trend-digest-examples";

const STOP_SLOP_SKILL_PATH = "@.agents/skills/stop-slop/SKILL.md";
const NANO_BANANA_SKILL_NAME = "nano-banana";

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function stringifyJsonShape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildManualPostShapeGuidance(): string[] {
  return [
    "- Pick the post shape before the wording. Useful shapes: caption, disbelief, social truth, institutional dunk, status line, workflow truth, fake dialogue, or quoted phrase.",
    "- If the post will sit beside attached media, spend the text on the reaction, verdict, or callback, not on re-describing what the media already shows.",
    "- Assume the viewer can already see the image or clip. Do not burn words on scene-setting unless the text adds a detail the media cannot carry alone.",
    "- Keep the intelligence in the implication. Do not plan a thesis statement if a caption, contrast, or blunt status line would hit harder.",
    "- Prefer concrete nouns, products, roles, objects, screenshots, institutions, and quoted phrases over abstract summaries.",
    "- Strong openings often start with a verdict, quoted phrase, callback, or hard contrast."
  ];
}

function buildTrendDigestGuidance(): string[] {
  return [
    "- This is a trend digest post, not a normal one-angle take.",
    "- The ideal result feels like a compressed 'do you understand what happened in the last 24-48 hours' post.",
    "- Strong shape: short alarm-bell opener, then 5 to 10 stacked `>` lines, then one final kicker.",
    "- Each stacked line should compress one development into a verdict, accusation, or incentive read. Do not waste lines on neutral restatement.",
    "- The lines should escalate. Start with recognizably big moves, then widen into labor, platform, regulatory, or market implications.",
    "- Every line must earn its place by being a distinct development or implication.",
    "- Do not write like a newsletter, thread intro, or analyst memo. This should feel native to the feed and slightly dangerous.",
    "- Use company names, dollar figures, products, institutions, and roles when the brief includes them.",
    "- The closer the draft gets to 'here are several things happening in tech', the more it is failing.",
    "- End with a hard kicker. Good endings sound like a warning, taunt, or 'it gets worse' escalation."
  ];
}

function formatTrendContext(subject: ManualPostSubject): string[] {
  if (!subject.trendContext) {
    return ["- none"];
  }

  return [
    `- timeframe_hours: ${subject.trendContext.timeframeHours}`,
    `- generated_at: ${subject.trendContext.generatedAt}`,
    `- topic_count: ${subject.trendContext.topicCount}`,
    `- tweet_count: ${subject.trendContext.tweetCount}`,
    "Trend topics:",
    ...subject.trendContext.topics.map(
      (topic, index) =>
        `- ${index + 1}. ${topic.label} | kind=${topic.kind} | hotness=${topic.hotnessScore.toFixed(2)} | recent_24h=${topic.recentTweetCount24h} | tweets=${topic.tweetCount} | why_now=${topic.whyNow || "none"}`
    ),
    "Trend tweets:",
    ...subject.trendContext.tweets.map((tweet, index) => {
      const author = tweet.authorUsername ? `@${tweet.authorUsername}` : "@unknown";
      return `- ${index + 1}. ${author} | likes=${tweet.likes} | topic=${tweet.topicLabel ?? "none"} | text=${tweet.text}`;
    })
  ];
}

function formatTrendExamples(subject: ManualPostSubject): string {
  if (subject.sourceMode !== "trend_digest") {
    return "- none";
  }

  return formatTrendDigestExamplesForPrompt(2);
}

function buildCandidateBlock(candidate: ReplyMediaCandidate): string {
  const lines = [
    `candidate_id: ${candidate.candidateId}`,
    `usage_id: ${candidate.usageId ?? "unknown"}`,
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
    `cultural_reference: ${candidate.analysis?.culturalReference ?? "unknown"}`,
    `analogy_target: ${candidate.analysis?.analogyTarget ?? "unknown"}`,
    `search_keywords: ${candidate.analysis?.searchKeywords.join(", ") || "none"}`,
    `display_url: ${candidate.displayUrl ?? "unknown"}`,
    `local_file_path: ${candidate.localFilePath ?? "unknown"}`,
    `video_file_path: ${candidate.videoFilePath ?? "unknown"}`
  ];

  if (candidate.localFilePath) {
    lines.push(`candidate_attachment: @${candidate.localFilePath}`);
  } else if (candidate.videoFilePath) {
    lines.push(`candidate_attachment: @${candidate.videoFilePath}`);
  }

  return lines.join("\n");
}

export function buildManualPostPlanPrompt(input: {
  request: ManualPostRequest;
  subject: ManualPostSubject;
}): string {
  const { request, subject } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are planning a brand-new X post from a manually pasted brief.",
    "Turn the raw notes into a posting move, not an explanation.",
    "You are not writing the final post yet.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Planning rules:",
    "- Find the one thing in the brief that is most postable right now.",
    ...buildManualPostShapeGuidance(),
    ...(subject.sourceMode === "trend_digest" ? buildTrendDigestGuidance() : []),
    "- Generate 2 to 4 short search queries for local media or meme templates that could support the post, even if the final result stays text-only.",
    "- If this is a trend digest, the best answer may still be text-only. Do not force media if the stacked text lands harder alone.",
    "",
    `Source mode: ${subject.sourceMode}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Target audience: ${request.targetAudience ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    "",
    "Manual brief:",
    subject.briefText,
    "",
    "Extracted hooks:",
    formatList(subject.extractedHooks),
    "",
    "Structured trend context:",
    ...formatTrendContext(subject),
    "",
    "Reference examples:",
    formatTrendExamples(subject),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      angle: "posting move plus the concrete point it makes",
      tone: "spoken register, not a generic style adjective",
      postIntent: "what kind of post this is in the feed",
      targetReaction: "what should click without being explained",
      searchQueries: ["query one", "query two"],
      candidateSelectionCriteria: ["criterion one", "criterion two"],
      hooks: ["hook one", "hook two"],
      avoid: ["thing to avoid"]
    } satisfies ManualPostPlan)
  ].join("\n");
}

export function buildManualPostPrompt(input: {
  request: ManualPostRequest;
  subject: ManualPostSubject;
  plan: ManualPostPlan;
  candidates: ReplyMediaCandidate[];
}): string {
  const { request, subject, plan, candidates } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    `If image editing would materially improve the result, you may invoke the ${NANO_BANANA_SKILL_NAME} skill to adapt a candidate image.`,
    "You are writing one brand-new X post from a manual brief and optional local media candidates.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Post rules:",
    "- It should read like an original post, not a reply and not notes for a writer.",
    "- Favor captions, social-truth compression, blunt status lines, disbelief, or fake dialogue over analytical summary voice.",
    ...(subject.sourceMode === "trend_digest" ? buildTrendDigestGuidance() : []),
    "- If you choose a media candidate, treat the attachment as visible context. Do not restate obvious objects, actions, or scene details that the image or clip already gives away.",
    "- When the media is doing the setup, use the text for the market read, callback, accusation, joke, or verdict.",
    "- If the draft reads like a caption describing the asset beside it, rewrite it as a reaction to that asset.",
    "- If the line could fit under dozens of unrelated posts, it is too generic.",
    "- Use concrete nouns and quoted phrases from the brief when possible.",
    "- If the best result is text-only, set selectedCandidateId to null and still write the post.",
    "- Keep mediaSelectionReason, whyThisTweetWorks, and postingNotes concise.",
    "- If this is a trend digest, prefer one continuous post with stacked quote-style lines over a neat paragraph summary.",
    "- If this is a trend digest, the opener and closer matter as much as the middle bullets. Make them feel intentional.",
    "",
    `Source mode: ${subject.sourceMode}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Target audience: ${request.targetAudience ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    "",
    "Manual brief:",
    subject.briefText,
    "",
    "Extracted hooks:",
    formatList(subject.extractedHooks),
    "",
    "Structured trend context:",
    ...formatTrendContext(subject),
    "",
    "Reference examples:",
    formatTrendExamples(subject),
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
    candidates.length > 0 ? "Candidates:" : "Candidates: none",
    candidates.map((candidate, index) => [`Candidate ${index + 1}`, buildCandidateBlock(candidate)].join("\n")).join("\n\n"),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      tweetText: "single tweet",
      selectedCandidateId: "candidate-1 or null",
      mediaSelectionReason: "why the chosen candidate fits the post",
      whyThisTweetWorks: "why the post lands from this brief",
      postingNotes: "optional note or null"
    } satisfies ManualPostDraft)
  ].join("\n");
}

export function buildManualPostCleanupPrompt(input: {
  request: ManualPostRequest;
  subject: ManualPostSubject;
  plan: ManualPostPlan;
  draft: ManualPostDraft;
}): string {
  const { request, subject, plan, draft } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are cleaning a generated X post from a manual brief.",
    "Rewrite only as needed to remove slop while preserving the same claim and selected media choice.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Cleanup rules:",
    "- Keep the same selectedCandidateId exactly.",
    "- Keep the same core point and post shape.",
    "- Cut filler, generic hype, and analysis voice.",
    "- If this is a trend digest, preserve the stacked escalating structure unless it is clearly broken.",
    "- In a trend digest, cut any bullet that feels redundant, bland, or weaker than the others.",
    "- In a trend digest, make the opener and closing kicker sharper before touching the middle.",
    "- If selectedCandidateId is not null, assume the media sits beside the post. Delete scene-setting or object lists that merely narrate the attachment.",
    "- Prefer concrete triggers, objects, products, or quoted phrases from the brief.",
    "- End earlier. If the second sentence explains the first, compress or delete it.",
    "- Use ASCII punctuation only.",
    "",
    `Target audience: ${request.targetAudience ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    `Source mode: ${subject.sourceMode}`,
    `Planned angle: ${plan.angle}`,
    "Manual brief:",
    subject.briefText,
    "",
    "Reference examples:",
    formatTrendExamples(subject),
    "",
    "Draft to clean:",
    stringifyJsonShape(draft),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      tweetText: "cleaned tweet",
      selectedCandidateId: draft.selectedCandidateId,
      mediaSelectionReason: "cleaned reason",
      whyThisTweetWorks: "cleaned explanation",
      postingNotes: "cleaned note or null"
    } satisfies ManualPostDraft)
  ].join("\n");
}
