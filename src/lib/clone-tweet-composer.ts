import { z } from "zod";
import type { ReplyMediaCandidate, ReplyComposerSubject } from "@/src/lib/reply-composer";

export const cloneTweetSourceLookupRequestSchema = z.object({
  tweetId: z.string().trim().min(1).optional(),
  xUrl: z.string().trim().min(1).optional(),
  sourceText: z.string().trim().min(1).optional()
}).superRefine((value, ctx) => {
  const provided = [value.tweetId, value.xUrl, value.sourceText].filter((item) => typeof item === "string" && item.trim().length > 0);
  if (provided.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a tweet id, tweet URL, or source text"
    });
  }
});

export type CloneTweetSourceLookupRequest = z.infer<typeof cloneTweetSourceLookupRequestSchema>;

export const cloneTweetMediaModeSchema = z.enum(["auto", "keep_source_media", "search_new_media", "text_only"]);
export type CloneTweetMediaMode = z.infer<typeof cloneTweetMediaModeSchema>;

export const cloneTweetStyleModeSchema = z.enum(["preserve", "refresh", "replace"]);
export type CloneTweetStyleMode = z.infer<typeof cloneTweetStyleModeSchema>;

export const cloneTweetTopicModeSchema = z.enum(["preserve", "refresh", "replace"]);
export type CloneTweetTopicMode = z.infer<typeof cloneTweetTopicModeSchema>;

export const cloneTweetRequestSchema = z.object({
  tweetId: z.string().trim().min(1).optional(),
  xUrl: z.string().trim().min(1).optional(),
  sourceText: z.string().trim().min(1).optional(),
  styleMode: cloneTweetStyleModeSchema.default("preserve"),
  topicMode: cloneTweetTopicModeSchema.default("refresh"),
  mediaMode: cloneTweetMediaModeSchema.default("auto"),
  toneHint: z.string().trim().optional(),
  styleInstruction: z.string().trim().optional(),
  topicInstruction: z.string().trim().optional(),
  constraints: z.string().trim().optional(),
  mustInclude: z.string().trim().optional(),
  avoid: z.string().trim().optional(),
  customInstructions: z.string().trim().optional()
}).superRefine((value, ctx) => {
  const provided = [value.tweetId, value.xUrl, value.sourceText].filter((item) => typeof item === "string" && item.trim().length > 0);
  if (provided.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tweet cloning requires a tweet id, tweet URL, or source text"
    });
  }
});

export type CloneTweetRequest = z.infer<typeof cloneTweetRequestSchema>;

export const cloneTweetPlanSchema = z.object({
  angle: z.string().min(1),
  tone: z.string().min(1),
  styleDecision: z.string().min(1),
  topicDecision: z.string().min(1),
  structureNotes: z.array(z.string().min(1)),
  searchQueries: z.array(z.string().min(1)),
  candidateSelectionCriteria: z.array(z.string().min(1)).min(2),
  avoid: z.array(z.string().min(1))
});

export type CloneTweetPlan = z.infer<typeof cloneTweetPlanSchema>;

export const cloneTweetDraftSchema = z.object({
  tweetText: z.string().min(1),
  selectedCandidateId: z.string().min(1).nullable(),
  mediaSelectionReason: z.string().min(1),
  whyThisTweetWorks: z.string().min(1),
  postingNotes: z.string().min(1).nullable()
});

export type CloneTweetDraft = z.infer<typeof cloneTweetDraftSchema>;

export interface CloneTweetSubject extends ReplyComposerSubject {
  sourceKind: "captured_tweet" | "tweet_url" | "tweet_text";
  sourceMedia: ReplyMediaCandidate[];
}

export interface CloneTweetSourceLookupResult {
  normalizedUrl: string | null;
  tweetId: string | null;
  usageId: string | null;
  source: "local" | "x_api" | "text";
  analysisStatus: "complete" | "not_applicable";
  subject: CloneTweetSubject;
}

export interface CloneTweetResult {
  provider: string;
  request: CloneTweetRequest;
  subject: CloneTweetSubject;
  plan: CloneTweetPlan;
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
  };
  selectedMedia: ReplyMediaCandidate | null;
  alternativeMedia: ReplyMediaCandidate[];
}

export type CloneTweetCompositionStage = "starting" | "resolving" | "planning" | "searching" | "composing" | "completed";

export interface CloneTweetProgressEvent {
  stage: CloneTweetCompositionStage;
  message: string;
  detail?: string | null;
}
