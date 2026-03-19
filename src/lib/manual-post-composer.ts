import { z } from "zod";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";

export const trendDigestTopicSchema = z.object({
  label: z.string().min(1),
  kind: z.string().min(1),
  hotnessScore: z.number(),
  recentTweetCount24h: z.number().int().nonnegative(),
  tweetCount: z.number().int().nonnegative(),
  mostRecentAt: z.string().nullable(),
  whyNow: z.string()
});

export const trendDigestTweetSchema = z.object({
  authorUsername: z.string().nullable(),
  text: z.string().min(1),
  likes: z.number().int().nonnegative(),
  topicLabel: z.string().nullable(),
  createdAt: z.string().nullable()
});

export const manualPostTrendContextSchema = z.object({
  timeframeHours: z.number().int().min(1),
  generatedAt: z.string().min(1),
  topicCount: z.number().int().nonnegative(),
  tweetCount: z.number().int().nonnegative(),
  topics: z.array(trendDigestTopicSchema),
  tweets: z.array(trendDigestTweetSchema)
});

export const manualPostRequestSchema = z.object({
  briefText: z.string().trim().min(1),
  sourceMode: z.enum(["general", "trend_digest"]).optional(),
  toneHint: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  angleHint: z.string().trim().optional(),
  constraints: z.string().trim().optional(),
  mustInclude: z.string().trim().optional(),
  avoid: z.string().trim().optional(),
  trendContext: manualPostTrendContextSchema.optional()
});

export type ManualPostRequest = z.infer<typeof manualPostRequestSchema>;

export const manualPostPlanSchema = z.object({
  angle: z.string().min(1),
  tone: z.string().min(1),
  postIntent: z.string().min(1),
  targetReaction: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(2),
  candidateSelectionCriteria: z.array(z.string().min(1)).min(2),
  hooks: z.array(z.string().min(1)),
  avoid: z.array(z.string().min(1))
});

export type ManualPostPlan = z.infer<typeof manualPostPlanSchema>;

export const manualPostDraftSchema = z.object({
  tweetText: z.string().min(1),
  selectedCandidateId: z.string().min(1).nullable(),
  mediaSelectionReason: z.string().min(1),
  whyThisTweetWorks: z.string().min(1),
  postingNotes: z.string().min(1).nullable()
});

export type ManualPostDraft = z.infer<typeof manualPostDraftSchema>;

export interface ManualPostSubject {
  briefText: string;
  extractedHooks: string[];
  sourceMode: "general" | "trend_digest";
  trendContext: {
    timeframeHours: number;
    generatedAt: string;
    topicCount: number;
    tweetCount: number;
    topics: Array<{
      label: string;
      kind: string;
      hotnessScore: number;
      recentTweetCount24h: number;
      tweetCount: number;
      mostRecentAt: string | null;
      whyNow: string;
    }>;
    tweets: Array<{
      authorUsername: string | null;
      text: string;
      likes: number;
      topicLabel: string | null;
      createdAt: string | null;
    }>;
  } | null;
}

export interface ManualPostResult {
  provider: string;
  request: ManualPostRequest;
  subject: ManualPostSubject;
  plan: ManualPostPlan;
  tweet: {
    text: string;
    mediaSelectionReason: string;
    whyThisTweetWorks: string;
    postingNotes: string | null;
  };
  search: {
    provider: string;
    queries: string[];
    resultCount: number;
    warning: string | null;
    wishlistSavedCount?: number;
  };
  selectedMedia: ReplyMediaCandidate | null;
  alternativeMedia: ReplyMediaCandidate[];
}

export type ManualPostCompositionStage = "starting" | "planning" | "searching" | "composing" | "completed";

export interface ManualPostProgressEvent {
  stage: ManualPostCompositionStage;
  message: string;
  detail?: string | null;
}
