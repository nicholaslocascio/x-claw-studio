import { NextResponse } from "next/server";
import { normalizeXStatusUrl } from "@/src/lib/x-status-url";
import { triggerTask } from "@/src/server/run-control";
import type { RunTask } from "@/src/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    task?: RunTask;
    xStatusUrl?: string | null;
    topicBatchLimit?: number | null;
  };
  const task = body.task;
  const xStatusUrl = body.xStatusUrl ? normalizeXStatusUrl(body.xStatusUrl) : null;
  const topicBatchLimit =
    typeof body.topicBatchLimit === "number" && Number.isInteger(body.topicBatchLimit) && body.topicBatchLimit > 0
      ? body.topicBatchLimit
      : null;

  if (
    task !== "crawl_timeline" &&
    task !== "crawl_x_api" &&
    task !== "capture_x_api_timeline" &&
    task !== "capture_x_api_tweet" &&
    task !== "capture_x_api_tweet_and_compose_replies" &&
    task !== "analyze_missing" &&
    task !== "analyze_topics" &&
    task !== "rebuild_media_assets" &&
    task !== "backfill_media_native_types"
  ) {
    return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  }

  if (body.xStatusUrl && !xStatusUrl) {
    return NextResponse.json({ error: "Tweet lookup URL must be a single tweet status URL on x.com or twitter.com" }, { status: 400 });
  }

  const entry = triggerTask(task, "manual", {
    xStatusUrl,
    topicBatchLimit
  });
  return NextResponse.json(entry);
}
