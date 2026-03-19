import { z } from "zod";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";

export const mediaPostRequestSchema = z.object({
  usageId: z.string().min(1),
  toneHint: z.string().trim().optional(),
  angleHint: z.string().trim().optional(),
  constraints: z.string().trim().optional()
});

export type MediaPostRequest = z.infer<typeof mediaPostRequestSchema>;

export const mediaPostPlanSchema = z.object({
  angle: z.string().min(1),
  tone: z.string().min(1),
  postIntent: z.string().min(1),
  targetReaction: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(2),
  candidateSelectionCriteria: z.array(z.string().min(1)).min(2),
  supportingTopics: z.array(z.string().min(1)),
  avoid: z.array(z.string().min(1))
});

export type MediaPostPlan = z.infer<typeof mediaPostPlanSchema>;

export const mediaPostDraftSchema = z.object({
  tweetText: z.string().min(1),
  selectedCandidateId: z.string().min(1).nullable(),
  mediaSelectionReason: z.string().min(1),
  whyThisTweetWorks: z.string().min(1),
  postingNotes: z.string().min(1).nullable()
});

export type MediaPostDraft = z.infer<typeof mediaPostDraftSchema>;

export interface MediaPostSubject {
  usageId: string;
  tweetId: string | null;
  assetId: string | null;
  assetUsageCount: number;
  mediaKind: string;
  authorUsername: string | null;
  createdAt: string | null;
  tweetText: string | null;
  localFilePath: string | null;
  playableFilePath: string | null;
  analysis: {
    captionBrief: string | null;
    sceneDescription: string | null;
    primaryEmotion: string | null;
    emotionalTone: string | null;
    conveys: string | null;
    userIntent: string | null;
    rhetoricalRole: string | null;
    textMediaRelationship: string | null;
    culturalReference: string | null;
    analogyTarget: string | null;
    trendSignal: string | null;
    audienceTakeaway: string | null;
    brandSignals: string[];
    searchKeywords: string[];
  };
  relatedTopics: Array<{
    label: string;
    hotnessScore: number;
    stance: string;
    sentiment: string;
    whyNow: string | null;
  }>;
  priorUsages: Array<{
    authorUsername: string | null;
    createdAt: string | null;
    tweetText: string | null;
  }>;
}

export interface MediaPostResult {
  provider: string;
  request: MediaPostRequest;
  subject: MediaPostSubject;
  plan: MediaPostPlan;
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

export type MediaPostCompositionStage = "starting" | "planning" | "searching" | "composing" | "completed";

export interface MediaPostProgressEvent {
  stage: MediaPostCompositionStage;
  message: string;
  detail?: string | null;
}
