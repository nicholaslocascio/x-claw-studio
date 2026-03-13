import type {
  ReplyCompositionProgressEvent,
  ReplyCompositionRequest,
  ReplyComposerSubject,
  ReplySourceLookupResult
} from "@/src/lib/reply-composer";
import { analyzeAndIndexTweetUsage } from "@/src/server/analysis-pipeline";
import { getDashboardData } from "@/src/server/data";
import { findTweetById } from "@/src/server/tweet-repository";
import { getUsageDetail } from "@/src/server/usage-details";
import { runXApiCapture } from "@/src/server/x-api-capture";
import { extractTweetIdFromStatusUrl, normalizeXStatusUrl } from "@/src/lib/x-status-url";

function buildSubjectFromUsageDetail(
  detail: NonNullable<Awaited<ReturnType<typeof getUsageDetail>>>
): ReplyComposerSubject {
  return {
    usageId: detail.usageId,
    tweetId: detail.tweet.tweetId,
    tweetUrl: detail.tweet.tweetUrl,
    authorUsername: detail.tweet.authorUsername,
    createdAt: detail.tweet.createdAt,
    tweetText: detail.tweet.text,
    mediaKind: detail.analysis.mediaKind,
    analysis: {
      captionBrief: detail.analysis.caption_brief,
      sceneDescription: detail.analysis.scene_description,
      primaryEmotion: detail.analysis.primary_emotion,
      conveys: detail.analysis.conveys,
      userIntent: detail.analysis.user_intent,
      rhetoricalRole: detail.analysis.rhetorical_role,
      textMediaRelationship: detail.analysis.text_media_relationship,
      culturalReference: detail.analysis.cultural_reference,
      analogyTarget: detail.analysis.analogy_target,
      searchKeywords: detail.analysis.search_keywords
    }
  };
}

function findFirstUsageForRequest(request: Pick<ReplyCompositionRequest, "usageId" | "tweetId">) {
  const data = getDashboardData();
  if (request.usageId) {
    return data.tweetUsages.find((usage) => usage.usageId === request.usageId) ?? null;
  }

  if (request.tweetId) {
    return data.tweetUsages.find((usage) => usage.tweet.tweetId === request.tweetId && usage.mediaIndex === 0) ?? null;
  }

  return null;
}

export async function resolveReplyComposerSubject(
  request: ReplyCompositionRequest,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
    progressGoal?: ReplyCompositionRequest["goal"] | null;
  }
): Promise<ReplyComposerSubject> {
  const dashboardUsage = findFirstUsageForRequest(request);

  if (dashboardUsage && dashboardUsage.analysis.status !== "complete" && dashboardUsage.tweet.tweetId) {
    options?.onProgress?.({
      stage: "analyzing",
      message: "Analyzing source tweet media before composing the reply",
      detail: dashboardUsage.usageId,
      goal: options?.progressGoal ?? request.goal
    });
    await analyzeAndIndexTweetUsage(dashboardUsage.tweet.tweetId, dashboardUsage.mediaIndex);
  }

  if (dashboardUsage?.usageId) {
    const detail = await getUsageDetail(dashboardUsage.usageId);
    if (!detail) {
      throw new Error(`Usage ${dashboardUsage.usageId} was not found`);
    }

    return buildSubjectFromUsageDetail(detail);
  }

  const tweetId = request.tweetId;
  if (!tweetId) {
    throw new Error("Reply composition requires either usageId or tweetId");
  }

  const tweet = findTweetById(tweetId);
  if (!tweet) {
    throw new Error(`Tweet ${tweetId} was not found`);
  }

  return {
    usageId: null,
    tweetId: tweet.tweetId,
    tweetUrl: tweet.tweetUrl,
    authorUsername: tweet.authorUsername,
    createdAt: tweet.createdAt,
    tweetText: tweet.text,
    mediaKind: tweet.media[0]?.mediaKind ?? "none",
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
      tweetUrl: normalizedUrl
    });
  }

  const subject = await resolveReplyComposerSubject({
    tweetId,
    goal: "insight",
    mode: "single"
  });
  const usage = findFirstUsageForRequest({ tweetId });

  return {
    normalizedUrl,
    tweetId,
    usageId: usage?.usageId ?? subject.usageId ?? null,
    source,
    analysisStatus: usage ? "complete" : "not_applicable",
    subject
  };
}
