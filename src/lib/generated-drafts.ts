export type GeneratedDraftKind = "reply" | "topic_post" | "media_post" | "manual_post" | "clone_tweet";
export type GeneratedDraftStatus = "running" | "complete" | "failed";

export interface GeneratedDraftMediaCandidateRecord {
  candidateId: string;
  usageId: string | null;
  assetId: string | null;
  tweetId: string | null;
  tweetUrl: string | null;
  authorUsername: string | null;
  tweetText: string | null;
  displayUrl: string | null;
  localFilePath: string | null;
  videoFilePath: string | null;
  sourceType: "usage_facet" | "meme_template" | "source_tweet";
  sourceLabel: string | null;
  combinedScore: number;
  rankingScore?: number | null;
  matchReason?: string | null;
  assetStarred?: boolean;
  assetUsageCount?: number | null;
  duplicateGroupUsageCount?: number | null;
  hotnessScore?: number | null;
  sceneDescription: string | null;
  primaryEmotion: string | null;
  conveys: string | null;
}

export interface GeneratedDraftOutputRecord {
  goal: string | null;
  text: string;
  whyThisWorks: string;
  mediaSelectionReason: string | null;
  postingNotes: string | null;
  selectedMediaLabel: string | null;
  selectedMediaSourceType: "usage_facet" | "meme_template" | "source_tweet" | null;
  selectedMediaCandidateId?: string | null;
  selectedMediaUsageId?: string | null;
  selectedMediaAssetId?: string | null;
  selectedMediaTweetId?: string | null;
  selectedMediaTweetUrl?: string | null;
  selectedMediaDisplayUrl?: string | null;
  selectedMediaLocalFilePath?: string | null;
  selectedMediaVideoFilePath?: string | null;
  selectedMediaCombinedScore?: number | null;
  selectedMediaRankingScore?: number | null;
  selectedMediaMatchReason?: string | null;
  selectedMediaAssetStarred?: boolean;
  selectedMediaAssetUsageCount?: number | null;
  selectedMediaDuplicateGroupUsageCount?: number | null;
  selectedMediaHotnessScore?: number | null;
  alternativeMedia?: GeneratedDraftMediaCandidateRecord[];
  postedToXAt?: string | null;
  postedToXUrl?: string | null;
  postedToXError?: string | null;
  typefullySavedAt?: string | null;
  typefullyDraftId?: number | null;
  typefullyStatus?: string | null;
  typefullyPrivateUrl?: string | null;
  typefullyShareUrl?: string | null;
  typefullyError?: string | null;
}

export interface GeneratedDraftRecord {
  draftId: string;
  kind: GeneratedDraftKind;
  status: GeneratedDraftStatus;
  createdAt: string;
  updatedAt: string;
  composeRunId: string | null;
  composeRunLogDir: string | null;
  usageId: string | null;
  tweetId: string | null;
  topicId: string | null;
  assetId: string | null;
  requestGoal: string | null;
  requestMode: string | null;
  progressStage: string | null;
  progressMessage: string | null;
  progressDetail: string | null;
  errorMessage: string | null;
  outputs: GeneratedDraftOutputRecord[];
}
