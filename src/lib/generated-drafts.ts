export type GeneratedDraftKind = "reply" | "topic_post" | "media_post";
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
  sourceType: "usage_facet" | "meme_template";
  sourceLabel: string | null;
  combinedScore: number;
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
  selectedMediaSourceType: "usage_facet" | "meme_template" | null;
  selectedMediaCandidateId?: string | null;
  selectedMediaUsageId?: string | null;
  selectedMediaAssetId?: string | null;
  selectedMediaTweetId?: string | null;
  selectedMediaTweetUrl?: string | null;
  selectedMediaDisplayUrl?: string | null;
  selectedMediaLocalFilePath?: string | null;
  selectedMediaVideoFilePath?: string | null;
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
