import type {
  ReplyCompositionProgressEvent,
  ReplyCompositionRequest,
  ReplyComposerSubject,
  ReplySourceLookupResult
} from "@/src/lib/reply-composer";
import type { TweetUsageRecord } from "@/src/lib/types";
import { queueMissingUsageAnalysisIfIdle } from "@/src/server/auto-analysis";
import { getLightweightUsageData } from "@/src/server/data";
import { findTweetById } from "@/src/server/tweet-repository";
import { runXApiCapture } from "@/src/server/x-api-capture";
import { extractTweetIdFromStatusUrl, normalizeXStatusUrl } from "@/src/lib/x-status-url";

function buildSubjectFromUsage(
  usage: TweetUsageRecord
): ReplyComposerSubject {
  return {
    usageId: usage.usageId,
    tweetId: usage.tweet.tweetId,
    tweetUrl: usage.tweet.tweetUrl,
    authorUsername: usage.tweet.authorUsername,
    createdAt: usage.tweet.createdAt,
    tweetText: usage.tweet.text,
    mediaKind: usage.analysis.mediaKind,
    localFilePath: usage.mediaLocalFilePath,
    playableFilePath: usage.mediaPlayableFilePath,
    analysis: {
      captionBrief: usage.analysis.caption_brief,
      sceneDescription: usage.analysis.scene_description,
      primaryEmotion: usage.analysis.primary_emotion,
      conveys: usage.analysis.conveys,
      userIntent: usage.analysis.user_intent,
      rhetoricalRole: usage.analysis.rhetorical_role,
      textMediaRelationship: usage.analysis.text_media_relationship,
      culturalReference: usage.analysis.cultural_reference,
      analogyTarget: usage.analysis.analogy_target,
      searchKeywords: usage.analysis.search_keywords
    }
  };
}

function findFirstUsageForRequest(request: Pick<ReplyCompositionRequest, "usageId" | "tweetId">) {
  const usages = getLightweightUsageData();
  if (request.usageId) {
    return usages.find((usage) => usage.usageId === request.usageId) ?? null;
  }

  if (request.tweetId) {
    return usages.find((usage) => usage.tweet.tweetId === request.tweetId && usage.mediaIndex === 0) ?? null;
  }

  return null;
}

function resolveUsageSubject(
  usage: TweetUsageRecord
): ReplyComposerSubject | null {
  return buildSubjectFromUsage(usage);
}

function buildSubjectFromTweetOnly(tweet: NonNullable<ReturnType<typeof findTweetById>>): ReplyComposerSubject {
  return {
    usageId: null,
    tweetId: tweet.tweetId,
    tweetUrl: tweet.tweetUrl,
    authorUsername: tweet.authorUsername,
    createdAt: tweet.createdAt,
    tweetText: tweet.text,
    mediaKind: tweet.media[0]?.mediaKind ?? "none",
    localFilePath: null,
    playableFilePath: null,
    analysis: {
      captionBrief: null,
      sceneDescription: null,
      primaryEmotion: null,
      conveys: null,
      userIntent: null,
      rhetoricalRole: null,
      textMediaRelationship: null,
      culturalReference: null,
      analogyTarget: null,
      searchKeywords: []
    }
  };
}

function getReplySourceAnalysisStatus(
  subject: ReplyComposerSubject,
  analysisStatus: TweetUsageRecord["analysis"]["status"] | null
): ReplySourceLookupResult["analysisStatus"] {
  if (analysisStatus === "complete") {
    return "complete";
  }

  return subject.mediaKind === "none" ? "not_applicable" : "pending";
}

export async function resolveReplyComposerSubject(
  request: ReplyCompositionRequest,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
    progressGoal?: ReplyCompositionRequest["goal"] | null;
  }
): Promise<ReplyComposerSubject> {
  const dashboardUsage = findFirstUsageForRequest(request);

  if (dashboardUsage?.usageId) {
    const hydratedSubject = resolveUsageSubject(dashboardUsage);
    if (hydratedSubject) {
      if (dashboardUsage.analysis.status !== "complete" && dashboardUsage.tweet.tweetId) {
        queueMissingUsageAnalysisIfIdle(`reply composer for ${dashboardUsage.usageId}`);
        options?.onProgress?.({
          stage: "starting",
          message: "Loaded the tweet. Media analysis is still catching up in the background",
          detail: dashboardUsage.usageId,
          goal: options?.progressGoal ?? request.goal
        });
      }
      return hydratedSubject;
    }
  }

  const tweetId = request.tweetId;
  if (!tweetId) {
    throw new Error("Reply composition requires either usageId or tweetId");
  }

  const tweet = findTweetById(tweetId);
  if (!tweet) {
    throw new Error(`Tweet ${tweetId} was not found`);
  }

  return buildSubjectFromTweetOnly(tweet);
}

export async function resolveReplySourceFromUrl(input: {
  xUrl: string;
}): Promise<ReplySourceLookupResult> {
  const normalizedUrl = normalizeXStatusUrl(input.xUrl);
  if (!normalizedUrl) {
    throw new Error("Tweet lookup URL must be a single tweet status URL on x.com or twitter.com");
  }

  const tweetId = extractTweetIdFromStatusUrl(normalizedUrl);
  if (!tweetId) {
    throw new Error(`Could not extract a tweet id from ${normalizedUrl}`);
  }

  const existingTweet = findTweetById(tweetId);
  const source = existingTweet ? "local" : "x_api";

  if (!existingTweet) {
    await runXApiCapture({
      mode: "tweet_lookup",
      tweetUrl: normalizedUrl,
      postProcessMode: "deferred"
    });
  }

  const usage = findFirstUsageForRequest({ tweetId });
  const subject = await resolveReplyComposerSubject({
    tweetId,
    goal: "insight",
    mode: "single"
  });

  return {
    normalizedUrl,
    tweetId,
    usageId: subject.usageId ?? null,
    source,
    analysisStatus: getReplySourceAnalysisStatus(subject, usage?.analysis.status ?? null),
    subject
  };
}
