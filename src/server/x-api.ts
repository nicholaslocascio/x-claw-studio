import { getXApiBaseUrl, getXApiUserId } from "@/src/lib/env";
import type { ExtractedTweet, TweetMedia } from "@/src/lib/types";
import { readXAuthRecord } from "@/src/server/x-auth";
import { getXAccessTokenForApi } from "@/src/server/x-auth";

const DEFAULT_TWEET_FIELDS = [
  "attachments",
  "author_id",
  "created_at",
  "entities",
  "id",
  "lang",
  "note_tweet",
  "public_metrics",
  "referenced_tweets",
  "text"
].join(",");
const DEFAULT_MEDIA_FIELDS = [
  "duration_ms",
  "media_key",
  "preview_image_url",
  "type",
  "url",
  "variants"
].join(",");
const DEFAULT_USER_FIELDS = ["id", "name", "profile_image_url", "username"].join(",");
const DEFAULT_EXPANSIONS = ["attachments.media_keys", "author_id"].join(",");

interface XApiPublicMetrics {
  like_count?: number;
  quote_count?: number;
  reply_count?: number;
  repost_count?: number;
  retweet_count?: number;
  impression_count?: number;
}

interface XApiTweet {
  id: string;
  author_id?: string;
  created_at?: string;
  text?: string;
  note_tweet?: {
    text?: string;
  };
  attachments?: {
    media_keys?: string[];
  };
  public_metrics?: XApiPublicMetrics;
}

interface XApiUser {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
}

interface XApiMediaVariant {
  bit_rate?: number;
  content_type?: string;
  url?: string;
}

interface XApiMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  variants?: XApiMediaVariant[];
}

interface XApiIncludes {
  media?: XApiMedia[];
  users?: XApiUser[];
}

interface XApiMeta {
  next_token?: string;
  newest_id?: string;
  oldest_id?: string;
  result_count?: number;
}

interface XApiTimelineResponse {
  data?: XApiTweet[];
  includes?: XApiIncludes;
  meta?: XApiMeta;
}

interface XApiPostLookupResponse {
  data?: XApiTweet;
  includes?: XApiIncludes;
}

interface XApiUsersMeResponse {
  data?: XApiUser;
}

interface XApiErrorBody {
  title?: string;
  detail?: string;
  type?: string;
}

export interface XApiTimelinePage {
  page: number;
  nextToken: string | null;
  newestId: string | null;
  oldestId: string | null;
  resultCount: number;
  tweets: ExtractedTweet[];
}

export interface FetchXHomeTimelineInput {
  maxPages: number;
  maxResults: number;
  sinceId?: string | null;
  untilId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  exclude?: Array<"replies" | "retweets">;
}

export interface FetchXHomeTimelineResult {
  userId: string;
  pages: XApiTimelinePage[];
  tweets: ExtractedTweet[];
}

export interface LookupXPostByIdResult {
  tweet: ExtractedTweet | null;
}

let cachedAuthenticatedUser: XApiUser | null = null;

function formatXApiError(
  status: number,
  body: XApiErrorBody | null,
  pathname: string
): Error {
  const pieces = [body?.title, body?.detail].filter(Boolean);
  let message = pieces.length > 0 ? pieces.join(": ") : `X API request failed with status ${status}`;

  if (pathname.includes("/reverse_chronological")) {
    message +=
      ". Home timeline access needs a user-context token. The current token appears to be application-only. Set X_BEARER_TOKEN to an OAuth 1.0a or OAuth 2.0 user-context token with reverse chronological timeline access.";
  }

  return new Error(message);
}

async function xApiGet<T>(pathname: string, params: URLSearchParams): Promise<T> {
  const url = new URL(`${getXApiBaseUrl()}${pathname}`);
  url.search = params.toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await getXAccessTokenForApi()}`
    }
  });

  const text = await response.text();
  let body: T | XApiErrorBody | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T | XApiErrorBody;
    } catch {
      body = {
        detail: text
      } satisfies XApiErrorBody;
    }
  }
  if (!response.ok) {
    throw formatXApiError(response.status, (body as XApiErrorBody | null) ?? null, pathname);
  }

  return body as T;
}

function createDefaultParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("expansions", DEFAULT_EXPANSIONS);
  params.set("tweet.fields", DEFAULT_TWEET_FIELDS);
  params.set("media.fields", DEFAULT_MEDIA_FIELDS);
  params.set("user.fields", DEFAULT_USER_FIELDS);
  return params;
}

function formatMetric(value: number | undefined): string | null {
  return Number.isFinite(value) ? String(value) : null;
}

function pickBestVideoVariant(media: XApiMedia): XApiMediaVariant | null {
  const variants = media.variants?.filter((variant) => variant.url && variant.content_type) ?? [];
  if (variants.length === 0) {
    return null;
  }

  const mp4Variants = variants
    .filter((variant) => variant.content_type === "video/mp4")
    .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  if (mp4Variants.length > 0) {
    return mp4Variants[0];
  }

  const hlsVariant = variants.find((variant) => variant.content_type === "application/x-mpegURL");
  return hlsVariant ?? variants[0] ?? null;
}

function mapMedia(media: XApiMedia): TweetMedia {
  if (media.type === "photo") {
    return {
      mediaKind: "image",
      sourceUrl: media.url ?? null,
      previewUrl: media.url ?? media.preview_image_url ?? null,
      posterUrl: null
    };
  }

  const bestVariant = pickBestVideoVariant(media);
  const mediaKind =
    bestVariant?.content_type === "application/x-mpegURL" ? "video_hls" : "video";

  return {
    mediaKind,
    sourceUrl: bestVariant?.url ?? media.url ?? null,
    previewUrl: media.preview_image_url ?? media.url ?? null,
    posterUrl: media.preview_image_url ?? null
  };
}

function buildTweetUrl(tweetId: string, username: string | null | undefined): string {
  if (username?.trim()) {
    return `https://x.com/${username}/status/${tweetId}`;
  }

  return `https://x.com/i/web/status/${tweetId}`;
}

function mapTweet(
  tweet: XApiTweet,
  includes: XApiIncludes | undefined,
  sourceName: string,
  articleIndex: number
): ExtractedTweet {
  const usersById = new Map((includes?.users ?? []).map((user) => [user.id, user]));
  const mediaByKey = new Map((includes?.media ?? []).map((media) => [media.media_key, media]));
  const author = tweet.author_id ? usersById.get(tweet.author_id) : null;
  const media = (tweet.attachments?.media_keys ?? [])
    .map((mediaKey) => mediaByKey.get(mediaKey))
    .filter((item): item is XApiMedia => Boolean(item))
    .map((item) => mapMedia(item));

  return {
    sourceName,
    tweetId: tweet.id ?? null,
    tweetUrl: tweet.id ? buildTweetUrl(tweet.id, author?.username) : null,
    authorHandle: author?.username ? `@${author.username}` : null,
    authorUsername: author?.username ?? null,
    authorDisplayName: author?.name ?? null,
    authorProfileImageUrl: author?.profile_image_url ?? null,
    createdAt: tweet.created_at ?? null,
    text: tweet.note_tweet?.text ?? tweet.text ?? null,
    metrics: {
      replies: formatMetric(tweet.public_metrics?.reply_count),
      reposts: formatMetric(tweet.public_metrics?.repost_count ?? tweet.public_metrics?.retweet_count),
      likes: formatMetric(tweet.public_metrics?.like_count),
      bookmarks: null,
      views: formatMetric(tweet.public_metrics?.impression_count)
    },
    media,
    extraction: {
      articleIndex,
      extractedAt: new Date().toISOString()
    }
  };
}

export async function getAuthenticatedXUser(): Promise<XApiUser> {
  if (cachedAuthenticatedUser) {
    return cachedAuthenticatedUser;
  }

  const response = await xApiGet<XApiUsersMeResponse>("/2/users/me", new URLSearchParams());
  if (!response.data?.id) {
    throw new Error("X API did not return an authenticated user id from /2/users/me.");
  }

  cachedAuthenticatedUser = response.data;
  return response.data;
}

export async function resolveAuthenticatedXUserId(): Promise<string> {
  const savedAuthUserId = readXAuthRecord()?.userId;
  if (savedAuthUserId) {
    return savedAuthUserId;
  }

  const envUserId = getXApiUserId();
  if (envUserId) {
    return envUserId;
  }

  const me = await getAuthenticatedXUser().catch(() => null);
  if (me?.id) {
    return me.id;
  }

  throw new Error(
    "Could not resolve the authenticated X user id. Set X_USER_ID in .env, or make sure the token can access /2/users/me."
  );
}

export async function fetchXHomeTimeline(input: FetchXHomeTimelineInput): Promise<FetchXHomeTimelineResult> {
  const userId = await resolveAuthenticatedXUserId();
  const maxPages = Math.max(1, Math.min(32, input.maxPages));
  const maxResults = Math.max(5, Math.min(100, input.maxResults));
  const pages: XApiTimelinePage[] = [];
  const seenTweetIds = new Set<string>();
  const tweets: ExtractedTweet[] = [];
  let nextToken: string | null = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const params = createDefaultParams();
    params.set("max_results", String(maxResults));
    if (input.sinceId) params.set("since_id", input.sinceId);
    if (input.untilId) params.set("until_id", input.untilId);
    if (input.startTime) params.set("start_time", input.startTime);
    if (input.endTime) params.set("end_time", input.endTime);
    if (input.exclude && input.exclude.length > 0) {
      params.set("exclude", input.exclude.join(","));
    }
    if (nextToken) {
      params.set("pagination_token", nextToken);
    }

    const response = await xApiGet<XApiTimelineResponse>(
      `/2/users/${userId}/timelines/reverse_chronological`,
      params
    );
    const mappedTweets = (response.data ?? []).map((tweet, index) =>
      mapTweet(tweet, response.includes, "x-api-home-timeline", pageIndex * maxResults + index)
    );

    for (const tweet of mappedTweets) {
      if (!tweet.tweetId || seenTweetIds.has(tweet.tweetId)) {
        continue;
      }

      seenTweetIds.add(tweet.tweetId);
      tweets.push(tweet);
    }

    nextToken = response.meta?.next_token ?? null;
    pages.push({
      page: pageIndex + 1,
      nextToken,
      newestId: response.meta?.newest_id ?? null,
      oldestId: response.meta?.oldest_id ?? null,
      resultCount: response.meta?.result_count ?? mappedTweets.length,
      tweets: mappedTweets
    });

    if (!nextToken) {
      break;
    }
  }

  return {
    userId,
    pages,
    tweets
  };
}

export async function lookupXPostById(tweetId: string): Promise<LookupXPostByIdResult> {
  const params = createDefaultParams();
  const response = await xApiGet<XApiPostLookupResponse>(`/2/tweets/${tweetId}`, params);
  const tweet = response.data ? mapTweet(response.data, response.includes, "x-api-post-lookup", 0) : null;

  return { tweet };
}
