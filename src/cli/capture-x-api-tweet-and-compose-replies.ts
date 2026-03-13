import "@/src/lib/env";
import { runXApiCapture } from "@/src/server/x-api-capture";
import { generateAllReplyDraftsForTweet } from "@/src/server/reply-composer-job";

function readMaxConcurrency(): number | undefined {
  const rawValue = process.env.REPLY_COMPOSER_MAX_CONCURRENCY;
  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    throw new Error("REPLY_COMPOSER_MAX_CONCURRENCY must be a positive integer when set.");
  }

  return parsedValue;
}

async function run(): Promise<void> {
  const captureResult = await runXApiCapture({
    mode: "tweet_lookup"
  });

  const tweetId = captureResult.topTweet?.tweetId;
  if (!tweetId) {
    throw new Error("Focused tweet capture finished, but no top tweet with an id was found for reply drafting.");
  }

  console.log(`Starting all-goals reply drafting for tweet ${tweetId}`);
  const result = await generateAllReplyDraftsForTweet(
    {
      tweetId,
      maxConcurrency: readMaxConcurrency(),
      toneHint: "sharp but grounded",
      constraints: "keep it tight and postable"
    },
    {
      onProgress(event) {
        console.log(
          [
            "reply-compose:",
            `stage=${event.stage}`,
            event.goal ? `goal=${event.goal}` : null,
            `message=${event.message}`,
            event.detail ? `detail=${event.detail}` : null,
            typeof event.completedGoals === "number" ? `completed=${event.completedGoals}` : null,
            typeof event.runningGoals === "number" ? `running=${event.runningGoals}` : null,
            typeof event.queuedGoals === "number" ? `queued=${event.queuedGoals}` : null,
            typeof event.totalGoals === "number" ? `total=${event.totalGoals}` : null
          ]
            .filter(Boolean)
            .join(" ")
        );
      }
    }
  );

  console.log(`Reply drafting complete. tweetId=${tweetId} drafts=${result.results.length}`);
}

run().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
