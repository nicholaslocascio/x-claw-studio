import { z } from "zod";

export const REPLY_COMPOSITION_GOALS = [
  "insight",
  "consequence",
  "support",
  "critique",
  "signal_boost"
] as const;

export type ReplyCompositionGoal = (typeof REPLY_COMPOSITION_GOALS)[number];
export type ReplyCompositionMode = "single" | "all_goals";

export const replyCompositionRequestSchema = z.object({
  usageId: z.string().min(1).optional(),
  tweetId: z.string().min(1).optional(),
  goal: z.enum(REPLY_COMPOSITION_GOALS).default("insight"),
  mode: z.enum(["single", "all_goals"]).default("single"),
  maxConcurrency: z.coerce.number().int().min(1).max(REPLY_COMPOSITION_GOALS.length).optional(),
  toneHint: z.string().trim().optional(),
  angleHint: z.string().trim().optional(),
  constraints: z.string().trim().optional(),
  revisionFeedback: z.string().trim().optional(),
  revisionOriginalReplyText: z.string().trim().optional(),
  revisionSelectedMediaContext: z.string().trim().optional()
}).superRefine((value, ctx) => {
  if (!value.usageId && !value.tweetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either usageId or tweetId is required"
    });
  }
});

export type ReplyCompositionRequest = z.infer<typeof replyCompositionRequestSchema>;

export const replySourceLookupRequestSchema = z.object({
  xUrl: z.string().trim().min(1, "An X status URL is required")
});

export type ReplySourceLookupRequest = z.infer<typeof replySourceLookupRequestSchema>;

export const replyCompositionPlanSchema = z.object({
  stance: z.enum(["agree", "disagree", "mixed"]),
  angle: z.string().min(1),
  tone: z.string().min(1),
  intentSummary: z.string().min(1),
  targetEffect: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(2),
  moodKeywords: z.array(z.string().min(1)).min(2),
  candidateSelectionCriteria: z.array(z.string().min(1)).min(2),
  avoid: z.array(z.string().min(1))
});

export type ReplyCompositionPlan = z.infer<typeof replyCompositionPlanSchema>;

export const replyCompositionDraftSchema = z.object({
  replyText: z.string().min(1),
  selectedCandidateId: z.string().min(1).nullable(),
  mediaSelectionReason: z.string().min(1),
  whyThisReplyWorks: z.string().min(1),
  postingNotes: z.string().min(1).nullable()
});

export type ReplyCompositionDraft = z.infer<typeof replyCompositionDraftSchema>;

export interface ReplyComposerSubject {
  usageId: string | null;
  tweetId: string | null;
  tweetUrl: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  tweetText: string | null;
  mediaKind: string;
  localFilePath: string | null;
  playableFilePath: string | null;
  analysis: {
    captionBrief: string | null;
    sceneDescription: string | null;
    primaryEmotion: string | null;
    conveys: string | null;
    userIntent: string | null;
    rhetoricalRole: string | null;
    textMediaRelationship: string | null;
    culturalReference: string | null;
    analogyTarget: string | null;
    searchKeywords: string[];
  };
}

export interface ReplyMediaCandidate {
  candidateId: string;
  usageId: string | null;
  assetId: string | null;
  tweetId: string | null;
  tweetUrl: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  tweetText: string | null;
  displayUrl: string | null;
  localFilePath: string | null;
  videoFilePath: string | null;
  mediaKind: string | null;
  combinedScore: number;
  rankingScore: number | null;
  assetStarred: boolean;
  assetUsageCount: number | null;
  duplicateGroupUsageCount: number | null;
  hotnessScore: number | null;
  matchReason: string | null;
  sourceType: "usage_facet" | "meme_template" | "source_tweet";
  sourceLabel: string | null;
  analysis: {
    captionBrief: string | null;
    sceneDescription: string | null;
    primaryEmotion: string | null;
    conveys: string | null;
    rhetoricalRole: string | null;
    culturalReference: string | null;
    analogyTarget: string | null;
    searchKeywords: string[];
  } | null;
}

export interface ReplyCompositionResult {
  provider: string;
  request: ReplyCompositionRequest;
  subject: ReplyComposerSubject;
  plan: ReplyCompositionPlan;
  reply: {
    text: string;
    whyThisReplyWorks: string;
    postingNotes: string | null;
    mediaSelectionReason: string;
  };
  search: {
    provider: string;
    queries: string[];
    resultCount: number;
    rawResultCount?: number;
    warning: string | null;
    queryOutcomes?: Array<{
      query: string;
      resultCount: number;
    }>;
    wishlistSavedCount?: number;
  };
  selectedMedia: ReplyMediaCandidate | null;
  alternativeMedia: ReplyMediaCandidate[];
}

export interface ReplyCompositionBatchResult {
  mode: "all_goals";
  usageId: string | null;
  tweetId: string | null;
  results: ReplyCompositionResult[];
}

export interface ReplySourceLookupResult {
  normalizedUrl: string;
  tweetId: string;
  usageId: string | null;
  source: "local" | "x_api";
  analysisStatus: "complete" | "pending" | "not_applicable";
  subject: ReplyComposerSubject;
}

export type ReplyCompositionStage =
  | "starting"
  | "analyzing"
  | "planning"
  | "searching"
  | "composing"
  | "completed";

export interface ReplyCompositionProgressEvent {
  stage: ReplyCompositionStage;
  message: string;
  detail?: string | null;
  goal?: ReplyCompositionGoal | null;
  completedGoals?: number;
  totalGoals?: number;
  runningGoals?: number;
  queuedGoals?: number;
}

export interface DesiredReplyMediaWishlistEntry {
  key: string;
  label: string;
  status: "pending" | "collected" | "dismissed";
  source: "reply_composer" | "topic_composer" | "media_post_composer" | "manual_post_composer";
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  usageIds: string[];
  goals: string[];
  exampleTweetTexts: string[];
  angles: string[];
}
