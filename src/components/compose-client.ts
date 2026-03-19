"use client";

import type { GeneratedDraftKind, GeneratedDraftRecord } from "@/src/lib/generated-drafts";

type GeneratedDraftHistoryFilter = {
  kind: GeneratedDraftKind;
  usageId?: string | null;
  tweetId?: string | null;
  topicId?: string | null;
  limit?: number;
};

type LocalRunningDraftInput = {
  kind: GeneratedDraftKind;
  usageId?: string | null;
  tweetId?: string | null;
  topicId?: string | null;
  assetId?: string | null;
  requestGoal?: string | null;
  requestMode?: string | null;
  progressMessage: string;
};

type ProgressLike = {
  stage: string;
  message: string;
  detail?: string | null;
  goal?: string | null;
};

function isLocalRunningDraft(draftId: string): boolean {
  return draftId.startsWith("local-running-");
}

export async function fetchGeneratedDraftHistory(
  filter: GeneratedDraftHistoryFilter
): Promise<GeneratedDraftRecord[]> {
  const params = new URLSearchParams({
    kind: filter.kind,
    limit: String(filter.limit ?? 12)
  });
  if (filter.usageId) {
    params.set("usageId", filter.usageId);
  }
  if (filter.tweetId) {
    params.set("tweetId", filter.tweetId);
  }
  if (filter.topicId) {
    params.set("topicId", filter.topicId);
  }

  const response = await fetch(`/api/generated-drafts?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const body = await response.json();
  return body.drafts ?? [];
}

export function buildLocalRunningDraft(input: LocalRunningDraftInput): GeneratedDraftRecord {
  const now = new Date().toISOString();

  return {
    draftId: `local-running-${Date.now()}`,
    kind: input.kind,
    status: "running",
    createdAt: now,
    updatedAt: now,
    composeRunId: null,
    composeRunLogDir: null,
    usageId: input.usageId ?? null,
    tweetId: input.tweetId ?? null,
    topicId: input.topicId ?? null,
    assetId: input.assetId ?? null,
    requestGoal: input.requestGoal ?? null,
    requestMode: input.requestMode ?? null,
    progressStage: "starting",
    progressMessage: input.progressMessage,
    progressDetail: null,
    errorMessage: null,
    outputs: []
  };
}

export function prependLocalRunningDraft(
  current: GeneratedDraftRecord[],
  draft: GeneratedDraftRecord
): GeneratedDraftRecord[] {
  return [draft, ...current.filter((item) => !isLocalRunningDraft(item.draftId))];
}

export function applyDraftRefToLeadingRunningDraft(
  current: GeneratedDraftRecord[],
  draft: { draftId: string; composeRunId: string; composeRunLogDir: string }
): GeneratedDraftRecord[] {
  return current.map((item, index) =>
    index === 0 && isLocalRunningDraft(item.draftId)
      ? {
          ...item,
          draftId: draft.draftId,
          composeRunId: draft.composeRunId,
          composeRunLogDir: draft.composeRunLogDir
        }
      : item
  );
}

export function applyProgressToLeadingRunningDraft<TProgress extends ProgressLike>(
  current: GeneratedDraftRecord[],
  event: TProgress
): GeneratedDraftRecord[] {
  return current.map((item, index) =>
    index === 0 && isLocalRunningDraft(item.draftId)
      ? {
          ...item,
          updatedAt: new Date().toISOString(),
          progressStage: event.stage,
          progressMessage: event.message,
          progressDetail: event.detail ?? null,
          requestGoal: event.goal ?? item.requestGoal
        }
      : item
  );
}

export function markLeadingRunningDraftFailed(
  current: GeneratedDraftRecord[],
  errorMessage: string
): GeneratedDraftRecord[] {
  return current.map((item, index) =>
    index === 0 && isLocalRunningDraft(item.draftId)
      ? {
          ...item,
          status: "failed",
          updatedAt: new Date().toISOString(),
          errorMessage
        }
      : item
  );
}
