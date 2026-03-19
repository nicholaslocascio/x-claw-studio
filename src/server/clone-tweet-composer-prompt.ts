import type {
  CloneTweetDraft,
  CloneTweetPlan,
  CloneTweetRequest,
  CloneTweetSubject
} from "@/src/lib/clone-tweet-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";

const STOP_SLOP_SKILL_PATH = "@.agents/skills/stop-slop/SKILL.md";

function stringifyJsonShape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function describeRewriteAxis(mode: CloneTweetRequest["styleMode"], keepLabel: string, replaceLabel: string): string {
  if (mode === "preserve") {
    return keepLabel;
  }
  if (mode === "replace") {
    return replaceLabel;
  }
  return `keep the recognizable core, but remix it enough that it reads like a fresh post`;
}

function buildSubjectBlock(subject: CloneTweetSubject): string {
  return [
    `source_kind: ${subject.sourceKind}`,
    `tweet_id: ${subject.tweetId ?? "none"}`,
    `tweet_url: ${subject.tweetUrl ?? "none"}`,
    `author_username: ${subject.authorUsername ?? "none"}`,
    `created_at: ${subject.createdAt ?? "none"}`,
    `media_kind: ${subject.mediaKind}`,
    `tweet_text: ${subject.tweetText ?? ""}`,
    `scene_description: ${subject.analysis.sceneDescription ?? "none"}`,
    `primary_emotion: ${subject.analysis.primaryEmotion ?? "none"}`,
    `conveys: ${subject.analysis.conveys ?? "none"}`,
    `rhetorical_role: ${subject.analysis.rhetoricalRole ?? "none"}`,
    `cultural_reference: ${subject.analysis.culturalReference ?? "none"}`,
    `analogy_target: ${subject.analysis.analogyTarget ?? "none"}`,
    `search_keywords: ${subject.analysis.searchKeywords.join(", ") || "none"}`
  ].join("\n");
}

function buildCandidateBlock(candidate: ReplyMediaCandidate): string {
  return [
    `candidate_id: ${candidate.candidateId}`,
    `source_type: ${candidate.sourceType}`,
    `usage_id: ${candidate.usageId ?? "none"}`,
    `asset_id: ${candidate.assetId ?? "none"}`,
    `tweet_id: ${candidate.tweetId ?? "none"}`,
    `tweet_url: ${candidate.tweetUrl ?? "none"}`,
    `author_username: ${candidate.authorUsername ?? "none"}`,
    `media_kind: ${candidate.mediaKind ?? "unknown"}`,
    `tweet_text: ${candidate.tweetText ?? ""}`,
    `match_reason: ${candidate.matchReason ?? "none"}`,
    `scene_description: ${candidate.analysis?.sceneDescription ?? "none"}`,
    `primary_emotion: ${candidate.analysis?.primaryEmotion ?? "none"}`,
    `conveys: ${candidate.analysis?.conveys ?? "none"}`,
    `ranking_score: ${candidate.rankingScore ?? candidate.combinedScore}`,
    `display_url: ${candidate.displayUrl ?? "none"}`,
    `local_file_path: ${candidate.localFilePath ?? "none"}`,
    `video_file_path: ${candidate.videoFilePath ?? "none"}`
  ].join("\n");
}

export function buildCloneTweetPlanPrompt(input: {
  request: CloneTweetRequest;
  subject: CloneTweetSubject;
}): string {
  const { request, subject } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are planning a cloned X post from one source tweet or a pasted tweet-like text.",
    "This is not a summary task. Preserve what the operator asked to preserve, then rewrite the post so it feels new enough to publish.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Rewrite controls:",
    `- Style: ${describeRewriteAxis(request.styleMode, "keep the original style/voice/rhythm unless the operator nudges it", "replace the style with a clearly different voice or framing")}`,
    `- Topic: ${describeRewriteAxis(request.topicMode, "keep the same core topic or thesis", "move to a new topic while borrowing only useful style/structure DNA")}`,
    `- Media mode: ${request.mediaMode}`,
    "- Search queries should be empty when media mode is keep_source_media or text_only unless a backup search is clearly needed.",
    "- Search queries should be specific enough to retrieve useful local media, not generic theme words.",
    "",
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Style instruction: ${request.styleInstruction ?? "none"}`,
    `Topic instruction: ${request.topicInstruction ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    `Custom instructions: ${request.customInstructions ?? "none"}`,
    "",
    "Source:",
    buildSubjectBlock(subject),
    "",
    "Source media options:",
    formatList(subject.sourceMedia.map((candidate) => `${candidate.candidateId}: ${candidate.matchReason ?? candidate.sourceType}`)),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      angle: "what the cloned tweet should do differently while staying grounded in the source",
      tone: "spoken register for the rewrite",
      styleDecision: "what stays vs changes about style",
      topicDecision: "what stays vs changes about topic",
      structureNotes: ["note one", "note two"],
      searchQueries: ["query one", "query two"],
      candidateSelectionCriteria: ["criterion one", "criterion two"],
      avoid: ["thing to avoid"]
    } satisfies CloneTweetPlan)
  ].join("\n");
}

export function buildCloneTweetPrompt(input: {
  request: CloneTweetRequest;
  subject: CloneTweetSubject;
  plan: CloneTweetPlan;
  candidates: ReplyMediaCandidate[];
}): string {
  const { request, subject, plan, candidates } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are writing one cloned X post from a source tweet or pasted tweet text.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Writing rules:",
    "- Write a fresh post, not notes about a post.",
    "- Respect the operator's preserve/change instructions literally.",
    "- If style is preserved, keep recognizable cadence or framing tricks without copying distinctive phrasing line-for-line.",
    "- If topic is preserved, keep the same core subject while changing angle, framing, or wording enough that it reads new.",
    "- If topic shifts, carry over only the useful structural DNA from the source.",
    "- When selecting source_tweet media, the text should feel intentionally paired with the original asset, not accidentally duplicated.",
    "- If the best result is text-only, set selectedCandidateId to null.",
    "- Keep mediaSelectionReason, whyThisTweetWorks, and postingNotes concise.",
    "",
    `Style mode: ${request.styleMode}`,
    `Topic mode: ${request.topicMode}`,
    `Media mode: ${request.mediaMode}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Style instruction: ${request.styleInstruction ?? "none"}`,
    `Topic instruction: ${request.topicInstruction ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    `Custom instructions: ${request.customInstructions ?? "none"}`,
    "",
    "Source:",
    buildSubjectBlock(subject),
    "",
    "Planned direction:",
    `- angle: ${plan.angle}`,
    `- tone: ${plan.tone}`,
    `- style_decision: ${plan.styleDecision}`,
    `- topic_decision: ${plan.topicDecision}`,
    "Structure notes:",
    formatList(plan.structureNotes),
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
      tweetText: "fresh tweet",
      selectedCandidateId: "candidate id or null",
      mediaSelectionReason: "why the chosen media supports the rewrite",
      whyThisTweetWorks: "why the rewrite feels distinct but grounded",
      postingNotes: "optional short note or null"
    } satisfies CloneTweetDraft)
  ].join("\n");
}

export function buildCloneTweetCleanupPrompt(input: {
  request: CloneTweetRequest;
  subject: CloneTweetSubject;
  plan: CloneTweetPlan;
  draft: CloneTweetDraft;
}): string {
  const { request, subject, plan, draft } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are cleaning a cloned X post.",
    "Rewrite only as needed to make it sharper and less generic while preserving the same claim and selectedCandidateId.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Cleanup rules:",
    "- Keep selectedCandidateId exactly the same.",
    "- Preserve the same style/topic decision already chosen.",
    "- Remove filler, summary voice, and obvious explanation.",
    "- Avoid phrases that feel copied from the source tweet unless the operator explicitly requires them.",
    "",
    `Style mode: ${request.styleMode}`,
    `Topic mode: ${request.topicMode}`,
    `Media mode: ${request.mediaMode}`,
    `Must include: ${request.mustInclude ?? "none"}`,
    `Avoid: ${request.avoid ?? "none"}`,
    `Plan angle: ${plan.angle}`,
    "",
    "Source:",
    buildSubjectBlock(subject),
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
    } satisfies CloneTweetDraft)
  ].join("\n");
}
