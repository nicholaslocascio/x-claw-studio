import { getCapturedTweetData } from "@/src/server/data";
import type { ExtractedTweet } from "@/src/lib/types";

export function findTweetById(tweetId: string): ExtractedTweet | null {
  const data = getCapturedTweetData();
  return data.capturedTweets.find((entry) => entry.tweet.tweetId === tweetId)?.tweet ?? null;
}

export function findTweetUsage(tweetId: string, mediaIndex = 0): {
  tweet: ExtractedTweet;
  mediaIndex: number;
} | null {
  const tweet = findTweetById(tweetId);
  if (!tweet) {
    return null;
  }

  if (!tweet.media[mediaIndex]) {
    return null;
  }

  return { tweet, mediaIndex };
}
