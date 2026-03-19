import type {
  ReplyCompositionDraft,
  ReplyCompositionPlan,
  ReplyCompositionRequest,
  ReplyComposerSubject,
  ReplyMediaCandidate
} from "@/src/lib/reply-composer";

const STOP_SLOP_SKILL_PATH = "@.agents/skills/stop-slop/SKILL.md";
const NANO_BANANA_SKILL_NAME = "nano-banana";

function buildReplyMoveGuidance(): string[] {
  return [
    "- Pick a feed-native post shape before you pick wording. Good shapes include: caption, disbelief, pile-on, institutional dunk, social-truth compression, absurd extension, fake instruction, fake dialogue.",
    "- The best reply usually sounds like something someone would blurt out while looking at the tweet, not a cleaned-up thesis.",
    "- Keep the real insight in the subtext. Do not explain the implication if the scene already implies it.",
    "- You are not captioning attached media. Assume the operator can see the image or clip already.",
    "- Do not spend words describing what the candidate media literally shows unless one tiny detail changes the joke or posting risk.",
    "- When talking about media fit, talk about the social energy, metaphor, or posting move, not the visible contents.",
    "- Strong replies often hinge on one weirdly specific detail: a product name, UI object, job title, room, prop, bill, or humiliating noun phrase.",
    "- Do not just continue the source tweet's wording pattern unless you can add a fresher and more humiliating detail than the original already had.",
    "- Prefer concrete nouns, brands, apps, objects, jobs, and quoted phrases over abstract nouns like framing, premise, discourse, narrative, or workflow.",
    "- If the first line sounds like analysis, rewrite it as a post.",
    "- Strong openers often start with: when, every time, how, guy who, me, nobody:, ok, imagine, '"
  ];
}

function buildGoalStanceGuidance(goal: ReplyCompositionRequest["goal"]): string[] {
  switch (goal) {
    case "support":
      return [
        "- Treat support as reinforcement. The reply should clearly back the tweet's core point unless the subject is internally inconsistent.",
        "- Support works best as a pile-on, sharper caption, or cleaner restatement of the social truth.",
        "- If the source tweet is long, compress it to one humiliatingly specific detail instead of summarizing the whole complaint.",
        "- If the source tweet is already very short, grab the moment of reversal: the paycheck, receipt, notification, body reaction, or object that flips the mood."
      ];
    case "signal_boost":
      return [
        "- Treat signal_boost as amplification. The reply should extend or sharpen the tweet while staying aligned with its core point.",
        "- Prefer a cleaner, more postable framing over a more analytical one."
      ];
    case "critique":
      return [
        "- Treat critique as real pushback. Challenge the premise, expose a missing assumption, or redirect the blame.",
        "- Critique should usually land as disbelief, a dunk, or a blunt counter-caption rather than a mini essay.",
        "- Do not merely agree with the tweet in a harsher tone. If you mostly agree, choose a different stance."
      ];
    case "consequence":
      return [
        "- Consequence can agree or disagree. Pick the stance that makes the downstream effect most legible.",
        "- Show the scene created by the consequence instead of naming it abstractly.",
        "- Prefer one irreversible or humiliating consequence over a broad warning."
      ];
    case "insight":
    default:
      return [
        "- Insight can agree, disagree, or mix both. Pick the stance that yields the sharpest post.",
        "- Do not chase a non-obvious reply if the better move is a brutally obvious line stated well."
      ];
  }
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function stringifyJsonShape(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildReplyCompositionPlanPrompt(input: {
  request: ReplyCompositionRequest;
  subject: ReplyComposerSubject;
}): string {
  const { request, subject } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are planning a reply to a subject tweet for an operator who will pair the reply text with one media asset from a local corpus.",
    "Your job in this step is to choose the posting move, spoken register, and best media search queries.",
    "The reply should read like a real post in the feed, not like a short explanation of the tweet.",
    "You are not writing the final reply yet.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Available tools after this step:",
    "- The application can run `x-media-analyst search facets --query <query> --format json` against a local media corpus.",
    "- That search now defaults to higher-quality assets only: starred assets or assets that have already shown duplicate/reuse signals. Operators can opt into the full corpus separately.",
    "- Search works best with short, retrieval-oriented phrases and named references, not long prose.",
    "- The final step can inspect candidate media metadata and attached local images/videos before choosing one.",
    `- If the best move is to adapt an image rather than use it as-is, you may choose an edit strategy that would later use the ${NANO_BANANA_SKILL_NAME} skill.`,
    "",
    "Planning rules:",
    "- First decide the reply stance toward the subject tweet: agree, disagree, or mixed.",
    ...buildReplyMoveGuidance(),
    "- Search queries should target mood, message, and recognizable references that fit the response angle.",
    "- Queries can point to meme templates, real people, public figures, fictional characters, pop-culture scenes, historical events, visual metaphors, objects, concepts, or vibes.",
    "- For image media, you may plan around an edited meme variant, a documentary/news image, a character still, a reaction photo, or an untouched source image.",
    "- Prefer 4 to 6 queries when the subject is tricky. Use at least 3 when you have enough good angles. More searches are allowed when they are genuinely distinct and likely to surface different assets.",
    "- The queries should attack different retrieval lanes, not minor rewrites of the same phrase.",
    "- The corpus is rich in facets like scene_description, conveys, rhetorical_role, metaphor, cultural_reference, analogy_target, meme_format, and search_keywords. Write queries that can match those fields, not just exact meme names.",
    "- A strong set usually mixes: one literal scene query, one role/job or social-type query, one object/prop query, one cultural-reference or character query, and one broader caption, feeling, or vibe query.",
    "- Balance across these concepts when possible: literal visual scene, social role/archetype, clip dynamic or body language, metaphor/analogy target, and broader emotional vibe.",
    "- Prefer retrieval phrases that describe the social energy of the asset: 'guy pretending authority', 'caught but acting normal', 'silent judgment reaction', 'performative competence', 'institutional middleman', 'old-money escape fantasy', 'expert advice clip', 'compliance with the letter of the law'.",
    "- Prefer short descriptive phrases over exact meme titles unless the reference is truly canonical and likely to exist in the corpus.",
    "- Do not overfit to one exact meme template name when a broader vibe phrase, metaphor phrase, or role phrase would surface more candidates.",
    "- Use at least one query that names the kind of asset or rhetorical role you want, such as reaction video, reaction image, advice clip, announcement clip, text-overlay aesthetic, evidence screenshot, smug interview clip, or stage announcement.",
    "- Use at least one query that names the analogy target or social truth behind the joke, such as fake authority, gatekeeping tollbooth, performative friendliness, sham competence, quiet quitting, old-money detachment, ruthless commerce, or hiding in plain sight.",
    "- If the subject is a video or movement matters, include at least one query that names the visible action or clip dynamic, not just the theme.",
    "- If movement matters, prefer clip-dynamic phrasing like glancing at camera, waving people through, smug reveal, hand signals, blank stare, podium talk, slow nod, or looking pleased while caught.",
    "- Do not burn slots on near-duplicates like the same scene with one synonym swapped in.",
    "- Avoid simply restating the tweet. Add a posting move.",
    ...buildGoalStanceGuidance(request.goal),
    "",
    "Useful reply shapes:",
    "- caption: name the exact scene or feeling in the tweet",
    "- disbelief: react to the logic as absurd or shameless",
    "- pile_on: agree by making the original point hit harder",
    "- institutional_dunk: make the company, role, or system look ridiculous",
    "- social_truth: compress a broadly felt dynamic into one line",
    "- absurd_extension: take the premise one click further",
    "",
    "Bad vs good:",
    "- Bad: 'Speech is low-bandwidth for syntax.'",
    "- Better: 'every coffee shop about to sound like ten dudes losing arguments to their IDE'",
    "- Bad: 'This feature changes workflow defaults.'",
    "- Better: 'when the rubber duck got voice mode'",
    "- Bad: 'suddenly i care about the q3 deliverables'",
    "- Better: 'direct deposit hit and now the laptop isn't even that loud'",
    "- Bad search: 'drake hotline bling meme'",
    "- Better search: 'smug reaction video' or 'guy acting pleased while caught'",
    "- Bad search: 'wizard of oz behind curtain meme'",
    "- Better search: 'fake authority behind the scenes' or 'fraud manager reveal'",
    "- Bad search: 'subway conductor meme'",
    "- Better search: 'guy pretending to direct huge system' or 'hand signals fake control'",
    "",
    `Goal: ${request.goal}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Revision feedback: ${request.revisionFeedback ?? "none"}`,
    `Previous generated reply: ${request.revisionOriginalReplyText ?? "none"}`,
    `Previous selected media context: ${request.revisionSelectedMediaContext ?? "none"}`,
    "",
    `Subject usageId: ${subject.usageId ?? "none"}`,
    `Subject tweetId: ${subject.tweetId ?? "unknown"}`,
    `Subject tweet URL: ${subject.tweetUrl ?? "unknown"}`,
    `Subject author: ${subject.authorUsername ?? "unknown"}`,
    `Subject created_at: ${subject.createdAt ?? "unknown"}`,
    `Subject media_kind: ${subject.mediaKind}`,
    `Subject tweet text: ${subject.tweetText ?? ""}`,
    "",
    "Subject media analysis:",
    `- caption_brief: ${subject.analysis.captionBrief ?? "unknown"}`,
    `- scene_description: ${subject.analysis.sceneDescription ?? "unknown"}`,
    `- primary_emotion: ${subject.analysis.primaryEmotion ?? "unknown"}`,
    `- conveys: ${subject.analysis.conveys ?? "unknown"}`,
    `- user_intent: ${subject.analysis.userIntent ?? "unknown"}`,
    `- rhetorical_role: ${subject.analysis.rhetoricalRole ?? "unknown"}`,
    `- text_media_relationship: ${subject.analysis.textMediaRelationship ?? "unknown"}`,
    `- cultural_reference: ${subject.analysis.culturalReference ?? "unknown"}`,
    `- analogy_target: ${subject.analysis.analogyTarget ?? "unknown"}`,
    `- search_keywords: ${subject.analysis.searchKeywords.join(", ") || "none"}`,
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      stance: "agree, disagree, or mixed",
      angle: "posting move plus the concrete point it makes",
      tone: "spoken register, not a brand adjective",
      intentSummary: "what kind of post this is in the feed",
      targetEffect: "what should click without being explained",
      searchQueries: ["query one", "query two", "query three"],
      moodKeywords: ["keyword one", "keyword two"],
      candidateSelectionCriteria: ["criterion one", "criterion two"],
      avoid: ["thing to avoid"]
    })
  ].join("\n");
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
  } else if (candidate.videoFilePath) {
    lines.push(`candidate_attachment: @${candidate.videoFilePath}`);
  }

  return lines.join("\n");
}

export function buildReplyCompositionPrompt(input: {
  request: ReplyCompositionRequest;
  subject: ReplyComposerSubject;
  plan: ReplyCompositionPlan;
  candidates: ReplyMediaCandidate[];
}): string {
  const { request, subject, plan, candidates } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    `If image editing would materially improve the result, you may invoke the ${NANO_BANANA_SKILL_NAME} skill to adapt a candidate image.`,
    "You are finalizing a reply to a subject tweet.",
    "Write one strong reply and choose the single best media candidate from the provided local corpus results.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Reply rules:",
    "- It should sound like a real post, not analysis notes.",
    "- It should add a posting move rather than paraphrasing the original tweet.",
    "- It may be witty, sharp, supportive, blunt, annoyed, or deadpan as long as it matches the requested goal.",
    "- Match the planned stance. If the stance is disagree, the reply should plainly push back on the tweet's premise or framing.",
    "- If the goal is critique, do not return a reply that mostly agrees with the tweet.",
    "- Prefer specificity over generic internet tone.",
    "- Favor caption voice, disbelief, pile-on, social-truth compression, or fake dialogue before analytical summary voice.",
    "- Use concrete nouns and familiar references. If a line leans on abstract words like framing, narrative, premise, discourse, workflow, architecture, semantics, or accountability, rewrite it.",
    "- Leave part of the thought unsaid. Do not explain the moral of the post.",
    "- One sharp sentence beats two explanatory ones.",
    "- If the source tweet is long, reply to one vivid detail, not the entire argument.",
    "- A weirdly specific noun phrase is often better than a full explanatory clause.",
    "- If the source tweet is already using a strong shell or repeated phrase, either twist it with a sharper object or switch to a different post shape entirely.",
    "- If the reply could work under dozens of unrelated tweets, it is too generic. Make it feel pinned to this tweet's exact scene.",
    "- On short joke tweets, prefer the concrete trigger over generic corporate filler. 'direct deposit', 'bank app', 'payday', 'badge swipe', or 'receipt printer' beat vague words like 'deliverables' or 'workflow'.",
    "- Prefer native post openings like when / every time / how / guy who / ok / imagine / quoted dialogue when they fit.",
    "- Fragments are allowed if they sound more native than a complete sentence.",
    "- Treat `mediaSelectionReason`, `whyThisReplyWorks`, and `postingNotes` as terse operator notes, not audience copy.",
    "- Keep `mediaSelectionReason`, `whyThisReplyWorks`, and `postingNotes` concise: one short sentence each, ideally under 120 characters.",
    "- Do not use `mediaSelectionReason` or `whyThisReplyWorks` to narrate the selected image or clip. No 'this image shows...' or 'the video is of...'.",
    "- In those note fields, explain the pairing through analogy, social role, emotional charge, or attack angle.",
    "- Bad note: 'The subway vest image reads as fake gatekeeper on sight.'",
    "- Better note: 'Hits the fake authority angle without restating the tweet.'",
    "- Bad note: 'This clip shows a smug guy with a clipboard.'",
    "- Better note: 'Bureaucratic self-importance, instantly.'",
    "- Choose `selectedCandidateId` only from the provided candidate IDs.",
    "- If none of the candidates fit, set `selectedCandidateId` to null and still return the best text-only reply.",
    "- If you select an image candidate, you may also decide that it should be edited to fit the subject better.",
    "- For image candidates, allowed edit strategies include adding meme text, rewriting captions, swapping a face for a relevant public figure, replacing an object for stronger comedic effect, or otherwise editing the image to sharpen the joke.",
    "- Examples of valid edits: replace one original subject's face with a founder, politician, or company figure relevant to the tweet; replace an item or prop with the product, policy, or controversy being discussed; add top/bottom text or panel captions that make the angle land faster.",
    "- Only propose edits that preserve the meme's recognizability and make the reply/media pairing more legible.",
    "",
    `Goal: ${request.goal}`,
    `Tone hint: ${request.toneHint ?? "none"}`,
    `Angle hint: ${request.angleHint ?? "none"}`,
    `Constraints: ${request.constraints ?? "none"}`,
    `Revision feedback: ${request.revisionFeedback ?? "none"}`,
    `Previous generated reply: ${request.revisionOriginalReplyText ?? "none"}`,
    `Previous selected media context: ${request.revisionSelectedMediaContext ?? "none"}`,
    "",
    "Planned angle:",
    `- stance: ${plan.stance}`,
    `- angle: ${plan.angle}`,
    `- tone: ${plan.tone}`,
    `- intent_summary: ${plan.intentSummary}`,
    `- target_effect: ${plan.targetEffect}`,
    "Selection criteria:",
    formatList(plan.candidateSelectionCriteria),
    "Avoid:",
    formatList(plan.avoid),
    "",
    `Subject tweet text: ${subject.tweetText ?? ""}`,
    `Subject author: ${subject.authorUsername ?? "unknown"}`,
    `Subject tweet URL: ${subject.tweetUrl ?? "unknown"}`,
    `Subject created_at: ${subject.createdAt ?? "unknown"}`,
    `Subject media kind: ${subject.mediaKind}`,
    `Subject local_file_path: ${subject.localFilePath ?? "unknown"}`,
    `Subject video_file_path: ${subject.playableFilePath ?? "unknown"}`,
    "",
    "Subject media analysis:",
    `- caption_brief: ${subject.analysis.captionBrief ?? "unknown"}`,
    `- scene_description: ${subject.analysis.sceneDescription ?? "unknown"}`,
    `- primary_emotion: ${subject.analysis.primaryEmotion ?? "unknown"}`,
    `- conveys: ${subject.analysis.conveys ?? "unknown"}`,
    `- user_intent: ${subject.analysis.userIntent ?? "unknown"}`,
    `- rhetorical_role: ${subject.analysis.rhetoricalRole ?? "unknown"}`,
    `- text_media_relationship: ${subject.analysis.textMediaRelationship ?? "unknown"}`,
    `- cultural_reference: ${subject.analysis.culturalReference ?? "unknown"}`,
    `- analogy_target: ${subject.analysis.analogyTarget ?? "unknown"}`,
    `- search_keywords: ${subject.analysis.searchKeywords.join(", ") || "none"}`,
    ...(subject.localFilePath
      ? ["", `Subject attachment: @${subject.localFilePath}`]
      : subject.playableFilePath
        ? ["", `Subject attachment: @${subject.playableFilePath}`]
        : [""]),
    candidates.length > 0 ? "Candidates:" : "Candidates: none",
    candidates.map((candidate, index) => [`Candidate ${index + 1}`, buildCandidateBlock(candidate)].join("\n")).join("\n\n"),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      replyText: "single reply text",
      selectedCandidateId: "candidate-1 or null",
      mediaSelectionReason: "why the chosen candidate fits the reply",
      whyThisReplyWorks: "why the text and media pairing works",
      postingNotes: "optional caveat or posting note, or null"
    } satisfies ReplyCompositionDraft)
  ].join("\n");
}

export function buildReplyCompositionCleanupPrompt(input: {
  request: ReplyCompositionRequest;
  subject: ReplyComposerSubject;
  plan: ReplyCompositionPlan;
  draft: ReplyCompositionDraft;
}): string {
  const { request, subject, plan, draft } = input;

  return [
    `Before answering, load and follow ${STOP_SLOP_SKILL_PATH}.`,
    "You are cleaning a generated X reply draft before it is considered done.",
    "Rewrite only as needed to remove slop while keeping the same core point, stance, and selected media choice.",
    "Return raw JSON only. No markdown fences.",
    "",
    "Cleanup rules:",
    "- Keep the same `selectedCandidateId` exactly.",
    "- Keep the same overall claim, stance, and tone target.",
    "- Tighten filler, flatten formulaic phrasing, and remove quotable-summary writing.",
    "- Rewrite analysis voice into posting voice when needed.",
    "- Prefer caption shapes, disbelief, social-truth compression, and fake dialogue over thesis statements.",
    "- Cut abstract nouns when a concrete scene can do the work.",
    "- Do not let `mediaSelectionReason` or `whyThisReplyWorks` drift into captioning the media. Assume the operator can see it.",
    "- If a note explains the visible contents of the image or clip, rewrite it around metaphor, social energy, or posting function.",
    "- Keep note fields blunt and operational. They should help someone choose or post, not admire the writing.",
    "- End earlier. If the second sentence explains the first, delete or compress it.",
    "- If the line still feels broad, swap one generic phrase for a more humiliatingly specific detail.",
    "- If the line still sounds polished, roughen the register slightly. Fragments, lowercase, and spoken phrasing are allowed.",
    "- Prefer 'guy who', 'when', 'every time', 'how', or quoted dialogue over a clean declarative thesis when both work.",
    "- If the draft could sit under a hundred unrelated tweets, it is too generic. Anchor it to one trigger, object, product, or quoted phrase from the source scene.",
    "- On short joke tweets, replace vague office filler with the concrete thing that flips the mood: direct deposit, the bank app, a receipt, a notification, a badge swipe.",
    "- Use ASCII punctuation only.",
    "- Do not use em dashes, en dashes, curly quotes, or unicode ellipses.",
    "- Keep `mediaSelectionReason`, `whyThisReplyWorks`, and `postingNotes` concise and operational.",
    "",
    `Goal: ${request.goal}`,
    `Revision feedback: ${request.revisionFeedback ?? "none"}`,
    `Previous generated reply: ${request.revisionOriginalReplyText ?? "none"}`,
    `Previous selected media context: ${request.revisionSelectedMediaContext ?? "none"}`,
    `Planned stance: ${plan.stance}`,
    `Planned angle: ${plan.angle}`,
    `Subject tweet text: ${subject.tweetText ?? ""}`,
    "",
    "Draft to clean:",
    stringifyJsonShape(draft),
    "",
    "Return JSON matching this shape exactly:",
    stringifyJsonShape({
      replyText: "cleaned single reply text",
      selectedCandidateId: draft.selectedCandidateId,
      mediaSelectionReason: "cleaned reason",
      whyThisReplyWorks: "cleaned explanation",
      postingNotes: "cleaned note or null"
    } satisfies ReplyCompositionDraft)
  ].join("\n");
}
