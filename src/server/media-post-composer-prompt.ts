import type { MediaPostDraft, MediaPostPlan, MediaPostRequest, MediaPostSubject } from "@/src/lib/media-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";

const STOP_SLOP_SKILL_PATH = "@.agents/skills/stop-slop/SKILL.md";
const NANO_BANANA_SKILL_NAME = "nano-banana";

function buildMediaPostShapeGuidance(): string[] {
  return [
    "- Pick the post shape first. Useful shapes include: caption, contrast, social truth, institutional dunk, workflow truth, disbelief, status line.",
    "- Start from what the asset shows, then decide what kind of post someone would actually make with it today.",
    "- Keep the intelligence in the implication. Do not explain what the image already makes obvious.",
    "- If the asset is direct proof, prefer a verdict, contrast, or status line over scene-setting.",
    "- Prefer concrete nouns, products, brands, roles, and objects over abstract nouns like narrative, framing, discourse, infrastructure, or paradigm.",
    "- If the draft reads like commentary on the image, rewrite it as a caption or a sharp line.",
    "- Strong openings often start with a hard contrast, a blunt status line, when, or a quoted phrase."
  ];
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function stringifyJsonShape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildMediaPostPlanPrompt(input: {
  request: MediaPostRequest;
  subject: MediaPostSubject;
}): string {
  const { request, subject } = input;
  const lines = [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are planning a brand-new tweet starting from one media asset.",
    "Your job in this step is to decide the best original-post angle for this media.",
    "You are not writing the final tweet yet.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Planning rules:",
    "- The tweet should feel like an original post, not a reply or dashboard note.",
    ...buildMediaPostShapeGuidance(),
    "- Start from what the media communicates, then connect it to relevant active topics when useful.",
    "- Do not simply restate the old tweet that previously used this asset.",
    "- Prefer an angle that makes this asset newly useful now.",
    "- Plan 2 to 4 short search queries for alternate local media or imported meme templates that could beat the current asset.",
    "- Keep the final tweet plausibly postable under 280 characters.",
    "",
    "Bad vs good:",
    "- Bad: 'This demonstrates the democratization of local AI.'",
    "- Better: '100B parameters on a Mac CPU. The GPU tax is a software bug.'",
    "- Bad: 'The asset provides evidence of efficiency gains.'",
    "- Better: 'terminal proof that the rack was optional'",
    "- Bad: 'People are rethinking what hardware this requires.'",
    "- Better: 'the rack was optional'",
    "",
    `usage_id: ${subject.usageId}`,
    `asset_id: ${subject.assetId ?? "unknown"}`,
    `asset_usage_count: ${subject.assetUsageCount}`,
    `media_kind: ${subject.mediaKind}`,
    `author_username: ${subject.authorUsername ?? "unknown"}`,
    `created_at: ${subject.createdAt ?? "unknown"}`,
    `original_tweet_text: ${subject.tweetText ?? ""}`,
    `tone_hint: ${request.toneHint ?? "none"}`,
    `angle_hint: ${request.angleHint ?? "none"}`,
    `constraints: ${request.constraints ?? "none"}`,
    "",
    "Media analysis:",
    `- caption_brief: ${subject.analysis.captionBrief ?? "unknown"}`,
    `- scene_description: ${subject.analysis.sceneDescription ?? "unknown"}`,
    `- primary_emotion: ${subject.analysis.primaryEmotion ?? "unknown"}`,
    `- emotional_tone: ${subject.analysis.emotionalTone ?? "unknown"}`,
    `- conveys: ${subject.analysis.conveys ?? "unknown"}`,
    `- user_intent: ${subject.analysis.userIntent ?? "unknown"}`,
    `- rhetorical_role: ${subject.analysis.rhetoricalRole ?? "unknown"}`,
    `- text_media_relationship: ${subject.analysis.textMediaRelationship ?? "unknown"}`,
    `- cultural_reference: ${subject.analysis.culturalReference ?? "unknown"}`,
    `- analogy_target: ${subject.analysis.analogyTarget ?? "unknown"}`,
    `- trend_signal: ${subject.analysis.trendSignal ?? "unknown"}`,
    `- audience_takeaway: ${subject.analysis.audienceTakeaway ?? "unknown"}`,
    `- brand_signals: ${subject.analysis.brandSignals.join(", ") || "none"}`,
    `- search_keywords: ${subject.analysis.searchKeywords.join(", ") || "none"}`,
    "",
    "Relevant topics:",
    ...subject.relatedTopics.map(
      (topic) =>
        `- ${topic.label} | hot ${topic.hotnessScore.toFixed(1)} | ${topic.stance} | ${topic.sentiment} | ${topic.whyNow ?? "no why-now"}`
    ),
    "",
    "Prior usages of this asset:",
    ...subject.priorUsages.map(
      (usage, index) => `- ${index + 1}. @${usage.authorUsername ?? "unknown"} (${usage.createdAt ?? "unknown"}): ${usage.tweetText ?? ""}`
    ),
    ""
  ];

  if (subject.localFilePath) {
    lines.push(`asset_attachment: @${subject.localFilePath}`);
  } else if (subject.playableFilePath) {
    lines.push(`asset_attachment: @${subject.playableFilePath}`);
  }

  lines.push(
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      angle: "posting move plus the concrete point it makes",
      tone: "spoken register, not a marketing adjective",
      postIntent: "what kind of post this is in the feed",
      targetReaction: "what should click without being explained",
      searchQueries: ["query one", "query two"],
      candidateSelectionCriteria: ["criterion one", "criterion two"],
      supportingTopics: ["topic one", "topic two"],
      avoid: ["thing to avoid"]
    } satisfies MediaPostPlan)
  );

  return lines.join("\n");
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
  } else if (candidate.videoFilePath) {
    lines.push(`candidate_attachment: @${candidate.videoFilePath}`);
  }

  return lines.join("\n");
}

export function buildMediaPostPrompt(input: {
  request: MediaPostRequest;
  subject: MediaPostSubject;
  plan: MediaPostPlan;
  candidates: ReplyMediaCandidate[];
}): string {
  const { request, subject, plan, candidates } = input;
  const lines = [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    `If image editing would materially improve the result, you may invoke the ${NANO_BANANA_SKILL_NAME} skill to adapt a candidate image.`,
    "You are writing a brand-new tweet around one media asset and may choose a better local candidate if it fits the angle better.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Tweet rules:",
    "- The tweet text must fit within 280 characters.",
    "- It should read like an original post, not a reply and not a note about analytics.",
    "- Use the media as the anchor. The tweet should make the chosen asset or template feel relevant now.",
    "- You may connect it to one active topic, but do not turn it into a generic headline recap.",
    "- Be specific and postable. Avoid filler, vague trend language, and obvious thesis statements.",
    "- Favor caption voice, contrast, social-truth compression, institutional dunks, and workflow truths over analytical summary voice.",
    "- Use concrete nouns and familiar references. If the line leans on abstract words like framing, discourse, infrastructure, narrative, paradigm, or workflow without a concrete scene, rewrite it.",
    "- Do not explain the point after the image and first line already land it.",
    "- One sharp sentence beats two explanatory ones.",
    "- Prefer hard contrasts and status lines over explanatory setup when the asset already carries the proof.",
    "- If the asset is a proof artifact like a terminal, chart, receipt, or screenshot, speak in verdicts and consequences, not scene description.",
    "- Protect strong blunt claims. If you have a clean line that lands fast, do not soften it into commentary.",
    "- Fragments are allowed if they sound more native than a polished sentence.",
    "- Choose `selectedCandidateId` only from the provided candidate IDs, or null if the current asset is best as-is.",
    "- Keep `mediaSelectionReason`, `whyThisTweetWorks`, and `postingNotes` concise.",
    "",
    `tone_hint: ${request.toneHint ?? "none"}`,
    `angle_hint: ${request.angleHint ?? "none"}`,
    `constraints: ${request.constraints ?? "none"}`,
    `asset_id: ${subject.assetId ?? "unknown"}`,
    `media_kind: ${subject.mediaKind}`,
    `original_tweet_text: ${subject.tweetText ?? ""}`,
    "",
    "Media analysis:",
    `- caption_brief: ${subject.analysis.captionBrief ?? "unknown"}`,
    `- scene_description: ${subject.analysis.sceneDescription ?? "unknown"}`,
    `- primary_emotion: ${subject.analysis.primaryEmotion ?? "unknown"}`,
    `- emotional_tone: ${subject.analysis.emotionalTone ?? "unknown"}`,
    `- conveys: ${subject.analysis.conveys ?? "unknown"}`,
    `- rhetorical_role: ${subject.analysis.rhetoricalRole ?? "unknown"}`,
    `- cultural_reference: ${subject.analysis.culturalReference ?? "unknown"}`,
    `- analogy_target: ${subject.analysis.analogyTarget ?? "unknown"}`,
    `- trend_signal: ${subject.analysis.trendSignal ?? "unknown"}`,
    "",
    "Relevant topics:",
    formatList(plan.supportingTopics),
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
    ""
  ];

  if (subject.localFilePath) {
    lines.push(`asset_attachment: @${subject.localFilePath}`);
  } else if (subject.playableFilePath) {
    lines.push(`asset_attachment: @${subject.playableFilePath}`);
  }

  lines.push(
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      tweetText: "single tweet under 280 chars",
      selectedCandidateId: "candidate-1 or null",
      mediaSelectionReason: "why the chosen candidate or current asset fits the tweet",
      whyThisTweetWorks: "why the tweet fits the media and current moment",
      postingNotes: "optional posting note, or null"
    } satisfies MediaPostDraft)
  );

  return lines.join("\n");
}

export function buildMediaPostCleanupPrompt(input: {
  request: MediaPostRequest;
  subject: MediaPostSubject;
  plan: MediaPostPlan;
  draft: MediaPostDraft;
}): string {
  const { request, subject, plan, draft } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are cleaning a generated media-led X post before it is considered done.",
    "Rewrite only as needed to remove slop while preserving the same claim and selected media choice.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Cleanup rules:",
    "- Keep the same `selectedCandidateId` exactly.",
    "- Keep the same media-led framing and core point.",
    "- Cut filler, generic hype, and overexplained summary language.",
    "- Rewrite commentary voice into posting voice when needed.",
    "- Prefer captions, contrasts, social truths, and status lines over thesis statements.",
    "- Cut abstract nouns when the asset already gives you a concrete scene.",
    "- End earlier. Remove any sentence that only explains the first one.",
    "- If the line still sounds polished, roughen the register slightly. Lowercase and fragments are allowed.",
    "- Prefer a hard contrast or blunt status line over explanatory prose.",
    "- If the draft already has a strong blunt claim, preserve it. Do not trade sharpness for extra setup.",
    "- Use ASCII punctuation only.",
    "- Do not use em dashes, en dashes, curly quotes, or unicode ellipses.",
    "- Keep `tweetText` under 280 characters.",
    "- Keep `mediaSelectionReason`, `whyThisTweetWorks`, and `postingNotes` concise.",
    "",
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Asset id: ${subject.assetId ?? "unknown"}`,
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
    } satisfies MediaPostDraft)
  ].join("\n");
}
