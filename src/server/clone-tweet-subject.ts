import type { ExtractedTweet, TweetUsageRecord } from "@/src/lib/types";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import type {
  CloneTweetRequest,
  CloneTweetSourceLookupResult,
  CloneTweetSubject
} from "@/src/lib/clone-tweet-composer";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import { extractTweetIdFromStatusUrl, normalizeXStatusUrl } from "@/src/lib/x-status-url";
import { getLightweightUsageData } from "@/src/server/data";
import { findTweetById } from "@/src/server/tweet-repository";
import { resolveReplyComposerSubject } from "@/src/server/reply-composer-subject";
import { runXApiCapture } from "@/src/server/x-api-capture";

function buildSourceMediaCandidate(
  tweet: ExtractedTweet,
  mediaIndex: number,
  usage: TweetUsageRecord | null
): ReplyMediaCandidate | null {
  const media = tweet.media[mediaIndex] ?? null;
  if (!media) {
    return null;
  }

  return {
    candidateId: `source:${tweet.tweetId ?? "tweet"}:${mediaIndex}`,
    usageId: usage?.usageId ?? null,
    assetId: usage?.mediaAssetId ?? null,
    tweetId: tweet.tweetId,
    tweetUrl: tweet.tweetUrl,
    authorUsername: tweet.authorUsername,
    createdAt: tweet.createdAt,
    tweetText: tweet.text,
    displayUrl: resolveMediaDisplayUrl({
      localFilePath: usage?.mediaLocalFilePath ?? null,
      posterUrl: media.posterUrl,
      previewUrl: media.previewUrl,
      sourceUrl: media.sourceUrl
    }),
    localFilePath: usage?.mediaLocalFilePath ?? null,
    videoFilePath: usage?.mediaPlayableFilePath ?? null,
    mediaKind: media.mediaKind,
    combinedScore: 1,
    rankingScore: 1,
    assetStarred: usage?.mediaAssetStarred ?? false,
    assetUsageCount: usage?.mediaAssetUsageCount ?? null,
    duplicateGroupUsageCount: usage?.duplicateGroupUsageCount ?? null,
    hotnessScore: usage?.hotnessScore ?? null,
    matchReason: "reuse media attached to the source tweet",
    sourceType: "source_tweet",
    sourceLabel: tweet.text,
    analysis: usage
      ? {
          captionBrief: usage.analysis.caption_brief ?? null,
          sceneDescription: usage.analysis.scene_description ?? null,
          primaryEmotion: usage.analysis.primary_emotion ?? null,
          conveys: usage.analysis.conveys ?? null,
          rhetoricalRole: usage.analysis.rhetorical_role ?? null,
          culturalReference: usage.analysis.cultural_reference ?? null,
          analogyTarget: usage.analysis.analogy_target ?? null,
          searchKeywords: usage.analysis.search_keywords ?? []
        }
      : null
  };
}

function buildSourceMedia(tweetId: string | null | undefined, tweet: ExtractedTweet | null): ReplyMediaCandidate[] {
  if (!tweet) {
    return [];
  }

  const usageByMediaIndex = new Map<number, TweetUsageRecord>();
  if (tweetId) {
    for (const usage of getLightweightUsageData()) {
      if (usage.tweet.tweetId === tweetId) {
        usageByMediaIndex.set(usage.mediaIndex, usage);
      }
    }
  }

  return tweet.media
    .map((_, mediaIndex) => buildSourceMediaCandidate(tweet, mediaIndex, usageByMediaIndex.get(mediaIndex) ?? null))
    .filter((candidate): candidate is ReplyMediaCandidate => Boolean(candidate));
}

async function buildResolvedSubject(
  input: Pick<CloneTweetRequest, "tweetId"> & {
    sourceKind: CloneTweetSubject["sourceKind"];
  }
): Promise<CloneTweetSubject> {
  const replySubject = await resolveReplyComposerSubject({
    tweetId: input.tweetId,
    goal: "insight",
    mode: "single"
  });
  const tweet = input.tweetId ? findTweetById(input.tweetId) : null;

  return {
    ...replySubject,
    sourceKind: input.sourceKind,
    sourceMedia: buildSourceMedia(input.tweetId, tweet)
  };
}

export async function resolveCloneTweetSubject(request: CloneTweetRequest): Promise<CloneTweetSubject> {
  if (request.sourceText?.trim()) {
    return {
      usageId: null,
      tweetId: null,
      tweetUrl: null,
      authorUsername: null,
      createdAt: null,
      tweetText: request.sourceText.trim(),
      mediaKind: "none",
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
      },
      sourceKind: "tweet_text",
      sourceMedia: []
    };
  }

  if (request.tweetId) {
    return buildResolvedSubject({
      tweetId: request.tweetId,
      sourceKind: "captured_tweet"
    });
  }

  if (!request.xUrl) {
    throw new Error("Clone tweet composition requires a tweet id, tweet URL, or source text");
  }

  const normalizedUrl = normalizeXStatusUrl(request.xUrl);
  if (!normalizedUrl) {
    throw new Error("Tweet lookup URL must be a single tweet status URL on x.com or twitter.com");
  }

  const tweetId = extractTweetIdFromStatusUrl(normalizedUrl);
  if (!tweetId) {
    throw new Error(`Could not extract a tweet id from ${normalizedUrl}`);
  }

  const existingTweet = findTweetById(tweetId);
  if (!existingTweet) {
    await runXApiCapture({
      mode: "tweet_lookup",
      tweetUrl: normalizedUrl,
      postProcessMode: "deferred"
    });
  }

  return buildResolvedSubject({
    tweetId,
    sourceKind: "tweet_url"
  });
}

export async function resolveCloneTweetSource(input: {
  tweetId?: string;
  xUrl?: string;
  sourceText?: string;
}): Promise<CloneTweetSourceLookupResult> {
  const normalizedUrl = input.xUrl ? normalizeXStatusUrl(input.xUrl) : null;
  const tweetId = input.tweetId ?? extractTweetIdFromStatusUrl(normalizedUrl);
  const source = input.sourceText?.trim() ? "text" : findTweetById(tweetId ?? "") ? "local" : normalizedUrl ? "x_api" : "local";
  const subject = await resolveCloneTweetSubject({
    tweetId: input.tweetId,
    xUrl: input.xUrl,
    sourceText: input.sourceText,
    styleMode: "preserve",
    topicMode: "refresh",
    mediaMode: "auto"
  });

  return {
    normalizedUrl,
    tweetId: subject.tweetId ?? tweetId ?? null,
    usageId: subject.usageId ?? null,
    source,
    analysisStatus: subject.usageId ? "complete" : "not_applicable",
    subject
  };
}
