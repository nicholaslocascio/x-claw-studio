import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { ExtractedTweet, TweetMedia, TweetMetrics } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseCountLabel(label: string, key: string): string | null {
  const pattern = new RegExp(`([\\d.,]+)\\s+${key}`, "i");
  const match = label.match(pattern);
  return match ? match[1] : null;
}

function extractMetrics($tweet: Cheerio<any>): TweetMetrics {
  const groupLabel =
    $tweet.find('[role="group"][aria-label*="views"]').attr("aria-label") ?? "";

  return {
    replies: parseCountLabel(groupLabel, "repl(?:y|ies)"),
    reposts: parseCountLabel(groupLabel, "reposts?"),
    likes: parseCountLabel(groupLabel, "likes?"),
    bookmarks: parseCountLabel(groupLabel, "bookmarks?"),
    views: parseCountLabel(groupLabel, "views")
  };
}

function extractTweetText($tweet: Cheerio<any>): string | null {
  const tweetText = $tweet.find('[data-testid="tweetText"]').first();
  if (tweetText.length > 0) {
    return cleanText(tweetText.text());
  }

  const textCandidates = $tweet
    .find("div[lang], span[lang]")
    .map((_, node) => cleanText(cheerio.load(node).text()))
    .get()
    .filter(Boolean);

  return textCandidates.join(" ").trim() || null;
}

function collectImageMedia($tweet: Cheerio<any>): TweetMedia[] {
  return $tweet
    .find('[data-testid="tweetPhoto"] img[src*="pbs.twimg.com/media/"]')
    .map((_, img) => {
      const src = img.attribs.src ?? null;

      return {
        mediaKind: "image" as const,
        sourceUrl: src,
        previewUrl: src,
        posterUrl: src
      };
    })
    .get();
}

function collectInlineVideoMedia($tweet: Cheerio<any>): TweetMedia[] {
  return $tweet
    .find('[data-testid="videoPlayer"] video')
    .map((_, video) => {
      const $video = cheerio.load(video);
      const posterUrl = video.attribs.poster ?? null;
      const sourceUrl =
        $video("source").first().attr("src") ??
        video.attribs.src ??
        posterUrl;
      const mediaKind: TweetMedia["mediaKind"] = sourceUrl?.startsWith("blob:")
        ? "video_blob"
        : "video";

      return {
        mediaKind,
        sourceUrl,
        previewUrl: posterUrl,
        posterUrl
      };
    })
    .get();
}

function collectVideoMediaFromHtml(articleHtml: string): TweetMedia[] {
  const urls = new Set<string>();
  const patterns = [
    /https:\/\/video\.twimg\.com\/[^"'&<\s]+/g,
    /https:\/\/pbs\.twimg\.com\/(?:ext_tw_video_thumb|amplify_video_thumb)\/[^"'&<\s]+/g
  ];

  for (const pattern of patterns) {
    const matches = articleHtml.match(pattern) || [];
    for (const match of matches) {
      urls.add(match.replace(/&amp;/g, "&"));
    }
  }

  const videoUrls = [...urls];
  const posterUrls = videoUrls.filter(
    (url) =>
      url.includes("ext_tw_video_thumb/") ||
      url.includes("amplify_video_thumb/")
  );

  return videoUrls
    .filter((url) => url.includes("video.twimg.com/"))
    .map((url) => ({
      mediaKind: url.includes(".m3u8") ? ("video_hls" as const) : ("video" as const),
      sourceUrl: url,
      previewUrl: posterUrls[0] ?? null,
      posterUrl: posterUrls[0] ?? null
    }));
}

export function extractTweetsFromHtml(
  html: string,
  sourceName = "unknown"
): ExtractedTweet[] {
  const $ = cheerio.load(html);
  const tweets: ExtractedTweet[] = [];

  $('article[data-testid="tweet"]').each((index, element) => {
    const $tweet = $(element);
    const articleHtml = $.html(element);

    const statusHref = $tweet.find('a[href*="/status/"]').first().attr("href") ?? null;
    const statusMatch = statusHref?.match(/\/([^/]+)\/status\/(\d+)/) ?? null;

    const handle =
      cleanText(
        $tweet
          .find('a[href^="/"] span')
          .filter((_, node) => $(node).text().startsWith("@"))
          .first()
          .text()
      ) || null;

    const displayName =
      cleanText(
        $tweet
          .find('[data-testid="User-Name"] span')
          .filter((_, node) => !$(node).text().startsWith("@"))
          .first()
          .text()
      ) || null;

    const profileImageUrl =
      $tweet
        .find('[data-testid="Tweet-User-Avatar"] img[src*="pbs.twimg.com"]')
        .first()
        .attr("src") ?? null;

    const timeEl = $tweet.find("time").first();
    const createdAt = timeEl.attr("datetime") ?? null;
    const text = extractTweetText($tweet);
    const metrics = extractMetrics($tweet);
    const media = [
      ...collectImageMedia($tweet),
      ...collectInlineVideoMedia($tweet),
      ...collectVideoMediaFromHtml(articleHtml)
    ];

    if (!statusMatch && media.length === 0 && !text) {
      return;
    }

    tweets.push({
      sourceName,
      tweetId: statusMatch?.[2] ?? null,
      tweetUrl: getPreferredXStatusUrl(statusHref ? `https://x.com${statusHref}` : null),
      authorUserId: null,
      authorHandle: handle,
      authorUsername: statusMatch?.[1] ? `@${statusMatch[1]}` : handle,
      authorDisplayName: displayName,
      authorProfileImageUrl: profileImageUrl,
      createdAt,
      text,
      metrics,
      media,
      extraction: {
        articleIndex: index,
        extractedAt: new Date().toISOString()
      }
    });
  });

  return tweets;
}
