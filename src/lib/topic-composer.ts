import { z } from "zod";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";

export const TOPIC_POST_GOALS = [
  "insight",
  "consequence",
  "contrarian",
  "product",
  "signal_boost"
] as const;

export type TopicPostGoal = (typeof TOPIC_POST_GOALS)[number];
export type TopicPostMode = "single" | "all_goals";

export const topicPostRequestSchema = z.object({
  topicId: z.string().min(1),
  goal: z.enum(TOPIC_POST_GOALS).default("insight"),
  mode: z.enum(["single", "all_goals"]).default("single"),
  maxConcurrency: z.coerce.number().int().min(1).max(TOPIC_POST_GOALS.length).optional(),
  toneHint: z.string().trim().optional(),
  angleHint: z.string().trim().optional(),
  constraints: z.string().trim().optional()
});

export type TopicPostRequest = z.infer<typeof topicPostRequestSchema>;

export const topicPostPlanSchema = z.object({
  angle: z.string().min(1),
  tone: z.string().min(1),
  postIntent: z.string().min(1),
  targetReaction: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(2),
  candidateSelectionCriteria: z.array(z.string().min(1)).min(2),
  avoid: z.array(z.string().min(1))
});

export type TopicPostPlan = z.infer<typeof topicPostPlanSchema>;

export const topicPostDraftSchema = z.object({
  tweetText: z.string().min(1),
  selectedCandidateId: z.string().min(1).nullable(),
  mediaSelectionReason: z.string().min(1),
  whyThisTweetWorks: z.string().min(1),
  postingNotes: z.string().min(1).nullable()
});

export type TopicPostDraft = z.infer<typeof topicPostDraftSchema>;

export interface TopicPostSubject {
  topicId: string;
  label: string;
  kind: string;
  hotnessScore: number;
  tweetCount: number;
  recentTweetCount24h: number;
  isStale: boolean;
  mostRecentAt: string | null;
  suggestedAngles: string[];
  representativeTweets: Array<{
    authorUsername: string | null;
    text: string | null;
    createdAt: string | null;
  }>;
  groundedNews: {
    summary: string;
    whyNow: string;
    sources: Array<{ title: string; uri: string }>;
  } | null;
}

export interface TopicPostResult {
  provider: string;
  request: TopicPostRequest;
  subject: TopicPostSubject;
  plan: TopicPostPlan;
  tweet: {
    text: string;
    whyThisTweetWorks: string;
    postingNotes: string | null;
    mediaSelectionReason: string;
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

export interface TopicPostBatchResult {
  mode: "all_goals";
  topicId: string;
  results: TopicPostResult[];
}

export type TopicPostCompositionStage = "starting" | "planning" | "searching" | "composing" | "completed";

export interface TopicPostProgressEvent {
  stage: TopicPostCompositionStage;
  message: string;
  detail?: string | null;
  goal?: TopicPostGoal | null;
  completedGoals?: number;
  totalGoals?: number;
  runningGoals?: number;
  queuedGoals?: number;
}
