"use client";

import { useMemo, useState } from "react";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import type { GeneratedDraftMediaCandidateRecord, GeneratedDraftOutputRecord } from "@/src/lib/generated-drafts";
import { buildLocalMediaUrl } from "@/src/lib/media-display";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

interface DraftOutputCardProps {
  draftId: string;
  draftKind: "reply" | "topic_post" | "media_post";
  output: GeneratedDraftOutputRecord;
  outputIndex: number;
  replyTargetUrl: string | null;
  draftTitle: string | null;
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
    combinedScore: 1,
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

export function DraftOutputCard(props: DraftOutputCardProps) {
  const mediaOptions = useMemo(() => buildMediaOptions(props.output), [props.output]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(
    mediaOptions[0]?.candidateId ?? null
  );

  const activeMedia = mediaOptions.find((candidate) => candidate.candidateId === activeCandidateId) ?? mediaOptions[0] ?? null;
  const activeMediaFilePath = activeMedia?.videoFilePath ?? activeMedia?.localFilePath ?? null;

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
          <div className="tt-data-label">Why This Works</div>
          <p className="mt-2 text-sm leading-6 text-slate-200">{props.output.whyThisWorks}</p>
        </div>
        <div className="tt-subpanel-soft">
          <div className="tt-data-label">Media Logic</div>
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
                {activeMedia.primaryEmotion ? <span className="tt-chip">{activeMedia.primaryEmotion}</span> : null}
                {activeMedia.conveys ? <span className="tt-chip">{activeMedia.conveys}</span> : null}
              </div>
              <p className="text-sm leading-6 text-slate-100">
                {activeMedia.label ?? activeMedia.sceneDescription ?? "No saved description"}
              </p>
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
      ) : null}

      {mediaOptions.length > 0 ? (
        <div className="mt-4 tt-subpanel-soft">
          <div className="tt-data-label">All Media Options</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {mediaOptions.map((candidate) => {
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
                    />
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {candidate.isOriginalSelection ? <span className="tt-chip tt-chip-accent">original</span> : <span className="tt-chip">alternate</span>}
                    <span className="tt-chip">
                      {candidate.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                    </span>
                    {candidate.authorUsername ? <span className="tt-chip">@{candidate.authorUsername}</span> : null}
                    {!candidate.isOriginalSelection ? <span className="tt-chip">{candidate.combinedScore.toFixed(2)}</span> : null}
                  </div>
                  <p className="text-sm leading-6 text-slate-200">
                    {candidate.label ?? candidate.sceneDescription ?? "No saved description"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {props.output.postingNotes ? (
        <div className="mt-4 border border-white/10 bg-black/10 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-cyan">Posting Notes</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{props.output.postingNotes}</p>
        </div>
      ) : null}
    </div>
  );
}
