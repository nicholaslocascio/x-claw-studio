"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import type { GeneratedDraftMediaCandidateRecord, GeneratedDraftOutputRecord } from "@/src/lib/generated-drafts";
import { buildLocalMediaUrl } from "@/src/lib/media-display";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

interface DraftOutputCardProps {
  draftId: string;
  draftKind: "reply" | "topic_post" | "media_post" | "manual_post" | "clone_tweet";
  output: GeneratedDraftOutputRecord;
  outputIndex: number;
  replyTargetUrl: string | null;
  draftTitle: string | null;
  initialVisibleMediaOptions?: number;
  regenerateReplyRequest?: {
    usageId?: string | null;
    tweetId?: string | null;
    goal?: string | null;
  } | null;
  onRegenerated?: (() => Promise<void> | void) | null;
}

interface DraftMediaOption extends GeneratedDraftMediaCandidateRecord {
  isOriginalSelection: boolean;
  label: string | null;
}

function buildSelectedOption(output: GeneratedDraftOutputRecord): DraftMediaOption | null {
  const hasMedia =
    Boolean(output.selectedMediaDisplayUrl) ||
    Boolean(output.selectedMediaLocalFilePath) ||
    Boolean(output.selectedMediaVideoFilePath);

  if (!hasMedia) {
    return null;
  }

  return {
    candidateId: output.selectedMediaCandidateId ?? "selected-media",
    usageId: output.selectedMediaUsageId ?? null,
    assetId: output.selectedMediaAssetId ?? null,
    tweetId: output.selectedMediaTweetId ?? null,
    tweetUrl: output.selectedMediaTweetUrl ?? null,
    authorUsername: null,
    tweetText: output.selectedMediaLabel ?? null,
    displayUrl: output.selectedMediaDisplayUrl ?? null,
    localFilePath: output.selectedMediaLocalFilePath ?? null,
    videoFilePath: output.selectedMediaVideoFilePath ?? null,
    sourceType: output.selectedMediaSourceType ?? "usage_facet",
    sourceLabel: output.selectedMediaLabel ?? null,
    combinedScore: output.selectedMediaCombinedScore ?? 1,
    rankingScore: output.selectedMediaRankingScore ?? null,
    matchReason: output.selectedMediaMatchReason ?? null,
    assetStarred: output.selectedMediaAssetStarred ?? false,
    assetUsageCount: output.selectedMediaAssetUsageCount ?? null,
    duplicateGroupUsageCount: output.selectedMediaDuplicateGroupUsageCount ?? null,
    hotnessScore: output.selectedMediaHotnessScore ?? null,
    sceneDescription: null,
    primaryEmotion: null,
    conveys: null,
    isOriginalSelection: true,
    label: output.selectedMediaLabel ?? null
  };
}

function buildPreviewUrl(candidate: DraftMediaOption): string | null {
  if (candidate.localFilePath) {
    return buildLocalMediaUrl(candidate.localFilePath);
  }

  return candidate.displayUrl;
}

function buildMediaOptions(output: GeneratedDraftOutputRecord): DraftMediaOption[] {
  const selected = buildSelectedOption(output);
  const alternatives = (output.alternativeMedia ?? []).map((candidate) => ({
    ...candidate,
    isOriginalSelection: false,
    label: candidate.sourceLabel ?? candidate.tweetText ?? null
  }));

  const merged = selected ? [selected, ...alternatives] : alternatives;
  const seen = new Set<string>();

  return merged.filter((candidate) => {
    const key =
      candidate.candidateId ||
      candidate.videoFilePath ||
      candidate.localFilePath ||
      candidate.displayUrl ||
      candidate.tweetUrl ||
      candidate.assetId ||
      Math.random().toString(36);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatCandidateScore(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function buildRevisionSelectedMediaContext(candidate: DraftMediaOption | null): string | undefined {
  if (!candidate) {
    return undefined;
  }

  const parts = [
    candidate.label ? `label: ${candidate.label}` : null,
    candidate.sourceType ? `source_type: ${candidate.sourceType}` : null,
    candidate.assetId ? `asset_id: ${candidate.assetId}` : null,
    candidate.usageId ? `usage_id: ${candidate.usageId}` : null,
    candidate.tweetId ? `tweet_id: ${candidate.tweetId}` : null,
    candidate.authorUsername ? `author: @${candidate.authorUsername}` : null,
    candidate.sceneDescription ? `scene: ${candidate.sceneDescription}` : null,
    candidate.primaryEmotion ? `emotion: ${candidate.primaryEmotion}` : null,
    candidate.conveys ? `conveys: ${candidate.conveys}` : null,
    candidate.matchReason ? `match_reason: ${candidate.matchReason}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function DraftOutputCard(props: DraftOutputCardProps) {
  const router = useRouter();
  const mediaOptions = useMemo(() => buildMediaOptions(props.output), [props.output]);
  const initialVisibleMediaOptions = Math.max(1, props.initialVisibleMediaOptions ?? 8);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(
    mediaOptions[0]?.candidateId ?? null
  );
  const [showAllMediaOptions, setShowAllMediaOptions] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationMessage, setRegenerationMessage] = useState<string | null>(null);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);

  const activeMedia = mediaOptions.find((candidate) => candidate.candidateId === activeCandidateId) ?? mediaOptions[0] ?? null;
  const activeMediaFilePath = activeMedia?.videoFilePath ?? activeMedia?.localFilePath ?? null;
  const visibleMediaOptions = showAllMediaOptions ? mediaOptions : mediaOptions.slice(0, initialVisibleMediaOptions);
  const hiddenMediaOptionCount = Math.max(0, mediaOptions.length - visibleMediaOptions.length);
  const canRegenerateReply =
    props.draftKind === "reply" &&
    Boolean(props.regenerateReplyRequest?.goal) &&
    Boolean(props.regenerateReplyRequest?.usageId || props.regenerateReplyRequest?.tweetId);

  async function regenerateReply(): Promise<void> {
    if (!canRegenerateReply || !revisionFeedback.trim()) {
      return;
    }

    setIsRegenerating(true);
    setRegenerationError(null);
    setRegenerationMessage("Starting regeneration");

    try {
      const response = await fetch("/api/reply/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          usageId: props.regenerateReplyRequest?.usageId ?? undefined,
          tweetId: props.regenerateReplyRequest?.tweetId ?? undefined,
          goal: props.regenerateReplyRequest?.goal,
          mode: "single",
          revisionFeedback: revisionFeedback.trim(),
          revisionOriginalReplyText: props.output.text,
          revisionSelectedMediaContext: buildRevisionSelectedMediaContext(activeMedia)
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to regenerate reply");
      }

      await readNdjsonStream<
        | { type: "progress"; message: string }
        | { type: "result" }
        | { type: "error"; error: string }
      >(response, (event) => {
        if (event.type === "progress") {
          setRegenerationMessage(event.message);
          return;
        }

        if (event.type === "error") {
          throw new Error(event.error);
        }
      });

      setRevisionFeedback("");
      setRegenerationMessage("Regenerated and saved as a new draft");
      if (props.onRegenerated) {
        await props.onRegenerated();
      } else {
        router.refresh();
      }
    } catch (error) {
      setRegenerationError(error instanceof Error ? error.message : "Failed to regenerate reply");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="tt-subpanel">
      <div className="mb-3 flex flex-wrap gap-2">
        {props.output.goal ? <span className="tt-chip">{props.output.goal}</span> : null}
        {activeMedia?.sourceType ? <span className="tt-chip">{activeMedia.sourceType}</span> : null}
        {mediaOptions.length > 0 ? <span className="tt-chip">{mediaOptions.length} media option{mediaOptions.length === 1 ? "" : "s"}</span> : null}
        {activeMedia ? <span className="tt-chip">media attached</span> : <span className="tt-chip">text only</span>}
      </div>

      <p className="text-sm leading-7 text-slate-100">{props.output.text}</p>

      <div className="mt-4">
        <PostToXButton
          mode={props.draftKind === "reply" ? "reply" : "new_post"}
          text={props.output.text}
          mediaFilePath={activeMediaFilePath}
          replyToTweetUrl={props.replyTargetUrl}
          draftTitle={props.draftTitle}
          scratchpadText={props.output.postingNotes ?? props.output.whyThisWorks}
          draftId={props.draftId}
          outputIndex={props.outputIndex}
          initialSavedAt={props.output.typefullySavedAt}
          initialPrivateUrl={props.output.typefullyPrivateUrl}
          initialShareUrl={props.output.typefullyShareUrl}
          initialDraftStatus={props.output.typefullyStatus}
          initialDraftId={props.output.typefullyDraftId}
          initialError={props.output.typefullyError}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="tt-subpanel-soft">
          <div className="tt-data-label">Reply Note</div>
          <p className="mt-2 text-sm leading-6 text-slate-200">{props.output.whyThisWorks}</p>
        </div>
        <div className="tt-subpanel-soft">
          <div className="tt-data-label">Pairing Note</div>
          <p className="mt-2 text-sm leading-6 text-slate-200">{props.output.mediaSelectionReason ?? "No media rationale saved."}</p>
        </div>
      </div>

      {activeMedia ? (
        <div className="mt-4 tt-subpanel-soft">
          <div className="tt-data-label">Current Publish Pick</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
            <div className="tt-media-frame aspect-[4/3] overflow-hidden">
              <MediaPreview
                alt={activeMedia.label ?? "selected media"}
                imageUrl={buildPreviewUrl(activeMedia)}
                videoFilePath={activeMedia.videoFilePath}
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {activeMedia.isOriginalSelection ? <span className="tt-chip tt-chip-accent">original pick</span> : <span className="tt-chip">alternate pick</span>}
                {activeMedia.assetId ? <span className="tt-chip">{activeMedia.assetId}</span> : null}
                {activeMedia.usageId ? <span className="tt-chip">{activeMedia.usageId}</span> : null}
                {activeMedia.assetStarred ? <span className="tt-chip tt-chip-accent">starred</span> : null}
                {typeof activeMedia.assetUsageCount === "number" && activeMedia.assetUsageCount > 0 ? (
                  <span className="tt-chip">{activeMedia.assetUsageCount} tweets</span>
                ) : null}
                {typeof activeMedia.duplicateGroupUsageCount === "number" && activeMedia.duplicateGroupUsageCount > 1 ? (
                  <span className="tt-chip">dup x{activeMedia.duplicateGroupUsageCount}</span>
                ) : null}
                {formatCandidateScore(activeMedia.hotnessScore) ? <span className="tt-chip">hot {formatCandidateScore(activeMedia.hotnessScore)}</span> : null}
                {formatCandidateScore(activeMedia.rankingScore) ? <span className="tt-chip">rank {formatCandidateScore(activeMedia.rankingScore)}</span> : null}
                {formatCandidateScore(activeMedia.combinedScore) ? <span className="tt-chip">base {formatCandidateScore(activeMedia.combinedScore)}</span> : null}
                {activeMedia.primaryEmotion ? <span className="tt-chip">{activeMedia.primaryEmotion}</span> : null}
                {activeMedia.conveys ? <span className="tt-chip">{activeMedia.conveys}</span> : null}
              </div>
              <p className="text-sm leading-6 text-slate-100">
                {activeMedia.label ?? activeMedia.sceneDescription ?? "No saved description"}
              </p>
              {activeMedia.matchReason ? <p className="text-xs leading-5 text-slate-400">{activeMedia.matchReason}</p> : null}
              <div className="flex flex-wrap gap-3">
                {activeMedia.usageId ? (
                  <Link href={`/usage/${activeMedia.usageId}`} className="tt-link inline-flex">
                    <span>Open asset analysis</span>
                  </Link>
                ) : null}
                {activeMedia.tweetUrl ? (
                  <a
                    href={getPreferredXStatusUrl(activeMedia.tweetUrl) ?? activeMedia.tweetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="tt-link inline-flex"
                  >
                    <span>Open media source</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mediaOptions.length > 0 ? (
        <details className="mt-4 tt-disclosure">
          <summary>
            <span>Media options</span>
            <span className="tt-chip">{mediaOptions.length} candidates</span>
          </summary>
          <div className="tt-disclosure-body">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="tt-data-label">Choose the publish asset</div>
              {mediaOptions.length > initialVisibleMediaOptions ? (
                <button
                  type="button"
                  className="tt-link"
                  onClick={(event) => {
                    event.preventDefault();
                    setShowAllMediaOptions((current) => !current);
                  }}
                >
                  <span>
                    {showAllMediaOptions ? `Show first ${initialVisibleMediaOptions}` : `Show all ${mediaOptions.length}`}
                  </span>
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleMediaOptions.map((candidate) => {
                const isActive = activeMedia?.candidateId === candidate.candidateId;

                return (
                  <button
                    key={candidate.candidateId}
                    type="button"
                    onClick={() => setActiveCandidateId(candidate.candidateId)}
                    className={`border p-3 text-left transition ${isActive ? "border-cyan bg-cyan/10" : "border-white/10 bg-black/10 hover:border-cyan/60"}`}
                  >
                    <div className="tt-media-frame mb-3 aspect-video overflow-hidden">
                      <MediaPreview
                        alt={candidate.label ?? "media option"}
                        imageUrl={buildPreviewUrl(candidate)}
                        videoFilePath={candidate.videoFilePath}
                        playOnClick={false}
                      />
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {candidate.isOriginalSelection ? <span className="tt-chip tt-chip-accent">original</span> : <span className="tt-chip">alternate</span>}
                      <span className="tt-chip">
                        {candidate.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                      </span>
                      {candidate.authorUsername ? <span className="tt-chip">@{candidate.authorUsername}</span> : null}
                      {candidate.assetStarred ? <span className="tt-chip tt-chip-accent">starred</span> : null}
                      {typeof candidate.duplicateGroupUsageCount === "number" && candidate.duplicateGroupUsageCount > 1 ? (
                        <span className="tt-chip">dup x{candidate.duplicateGroupUsageCount}</span>
                      ) : null}
                      {formatCandidateScore(candidate.hotnessScore) ? <span className="tt-chip">hot {formatCandidateScore(candidate.hotnessScore)}</span> : null}
                      {formatCandidateScore(candidate.rankingScore) ? <span className="tt-chip">rank {formatCandidateScore(candidate.rankingScore)}</span> : null}
                      {!candidate.isOriginalSelection ? <span className="tt-chip">base {candidate.combinedScore.toFixed(2)}</span> : null}
                    </div>
                    <p className="text-sm leading-6 text-slate-200">
                      {candidate.label ?? candidate.sceneDescription ?? "No saved description"}
                    </p>
                    {candidate.matchReason ? <p className="mt-2 text-xs leading-5 text-slate-400">{candidate.matchReason}</p> : null}
                  </button>
                );
              })}
            </div>
            {!showAllMediaOptions && hiddenMediaOptionCount > 0 ? (
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                {hiddenMediaOptionCount} more hidden
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {props.output.postingNotes ? (
        <div className="mt-4 tt-subpanel-soft">
          <div className="tt-data-label">Posting notes</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{props.output.postingNotes}</p>
        </div>
      ) : null}

      {canRegenerateReply ? (
        <details className="mt-4 tt-disclosure">
          <summary>
            <span>Regenerate with feedback</span>
            <span className="tt-chip">secondary action</span>
          </summary>
          <div className="tt-disclosure-body">
            <textarea
              value={revisionFeedback}
              onChange={(event) => setRevisionFeedback(event.target.value)}
              rows={3}
              className="tt-input min-h-24 resize-y"
              placeholder="Say what to change: sharper, less mean, use a different angle, pick a different kind of media, avoid repeating the same phrase..."
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="tt-button"
                onClick={() => void regenerateReply()}
                disabled={isRegenerating || !revisionFeedback.trim()}
              >
                <span>{isRegenerating ? "Regenerating..." : "Regenerate reply"}</span>
              </button>
              {regenerationMessage ? <span className="tt-chip tt-chip-accent">{regenerationMessage}</span> : null}
              {regenerationError ? <span className="tt-chip tt-chip-danger">{regenerationError}</span> : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
