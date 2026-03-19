"use client";

import { useEffect, useState } from "react";
import {
  applyDraftRefToLeadingRunningDraft,
  applyProgressToLeadingRunningDraft,
  buildLocalRunningDraft,
  fetchGeneratedDraftHistory,
  markLeadingRunningDraftFailed,
  prependLocalRunningDraft
} from "@/src/components/compose-client";
import { ComposeRunReference } from "@/src/components/compose-run-reference";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import type { GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import type { MediaPostProgressEvent, MediaPostResult } from "@/src/lib/media-post-composer";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function MediaTweetComposer(props: {
  usageId: string;
  assetId: string | null;
  mediaKind: string;
  mediaDisplayUrl: string | null;
  videoFilePath: string | null;
  tweetText: string | null;
  analysis: {
    conveys: string | null;
    primaryEmotion: string | null;
    rhetoricalRole: string | null;
  };
  relatedTopics: Array<{
    label: string;
    hotnessScore: number;
    stance: string;
    sentiment: string;
    whyNow: string | null;
  }>;
}) {
  const [toneHint, setToneHint] = useState("sharp and native to the platform");
  const [angleHint, setAngleHint] = useState("");
  const [constraints, setConstraints] = useState("make the asset feel current");
  const [result, setResult] = useState<MediaPostResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progressEvents, setProgressEvents] = useState<MediaPostProgressEvent[]>([]);
  const [draftHistory, setDraftHistory] = useState<GeneratedDraftRecord[]>([]);
  const latestProgress = progressEvents.at(-1) ?? null;

  async function loadDraftHistory(): Promise<void> {
    setDraftHistory(await fetchGeneratedDraftHistory({ kind: "media_post", usageId: props.usageId, limit: 12 }));
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const drafts = await fetchGeneratedDraftHistory({ kind: "media_post", usageId: props.usageId, limit: 12 });
      if (!cancelled) {
        setDraftHistory(drafts);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.usageId]);

  async function compose(): Promise<void> {
    setIsRunning(true);
    setErrorMessage(null);
    setResult(null);
    setProgressEvents([]);
    setDraftHistory((current) =>
      prependLocalRunningDraft(
        current,
        buildLocalRunningDraft({
          kind: "media_post",
          usageId: props.usageId,
          assetId: props.assetId,
          requestMode: "single",
          progressMessage: "Starting media composition"
        })
      )
    );

    const response = await fetch("/api/media/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageId: props.usageId,
        toneHint,
        angleHint,
        constraints
      })
    });

    if (!response.ok) {
      const body = await response.json();
      const message = body.error || "Media composition failed";
      setErrorMessage(message);
      setDraftHistory((current) => markLeadingRunningDraftFailed(current, message));
      setIsRunning(false);
      await loadDraftHistory();
      return;
    }

    try {
      await readNdjsonStream<
        | { type: "draft"; draft: { draftId: string; composeRunId: string; composeRunLogDir: string } }
        | ({ type: "progress" } & MediaPostProgressEvent)
        | { type: "result"; result: MediaPostResult }
        | { type: "error"; error: string }
      >(response, (event) => {
        if (event.type === "draft") {
          setDraftHistory((current) => applyDraftRefToLeadingRunningDraft(current, event.draft));
          return;
        }

        if (event.type === "progress") {
          setProgressEvents((current) => [...current, event]);
          setDraftHistory((current) => applyProgressToLeadingRunningDraft(current, event));
          return;
        }

        if (event.type === "result") {
          setResult(event.result);
          return;
        }

        if (event.type === "error") {
          setErrorMessage(event.error);
          setDraftHistory((current) => markLeadingRunningDraftFailed(current, event.error));
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media composition stream was unavailable";
      setErrorMessage(message);
      setDraftHistory((current) => markLeadingRunningDraftFailed(current, message));
    }

    await loadDraftHistory();
    setIsRunning(false);
  }

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Media Composer</div>
            <h2 className="section-title mt-3">Draft a new tweet from this asset</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.assetId ? <span className="tt-chip tt-chip-accent">{props.assetId}</span> : null}
            <span className="tt-chip">{props.mediaKind}</span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Compose Brief</div>
              <div className="window-dots">
                <span className="window-dot bg-orange" />
                <span className="window-dot bg-accent" />
                <span className="window-dot bg-cyan" />
              </div>
            </div>
            <div className="panel-body space-y-4">
              <label className="tt-field">
                <span className="tt-field-label">Tone Hint</span>
                <input value={toneHint} onChange={(event) => setToneHint(event.target.value)} className="tt-input" />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Angle Hint</span>
                <textarea
                  value={angleHint}
                  onChange={(event) => setAngleHint(event.target.value)}
                  rows={4}
                  className="tt-input min-h-28 resize-y"
                  placeholder="Lean into the strongest joke, tie it to one hot topic, make it more product-specific..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Constraints</span>
                <input value={constraints} onChange={(event) => setConstraints(event.target.value)} className="tt-input" />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button className="tt-button" onClick={() => void compose()} disabled={isRunning}>
                  <span>{isRunning ? "Composing..." : "Draft tweet"}</span>
                </button>
                {latestProgress ? <span className="tt-chip tt-chip-accent">{latestProgress.message}</span> : null}
                {errorMessage ? <span className="tt-chip tt-chip-danger">{errorMessage}</span> : null}
              </div>
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Asset Context</div>
              <div className="tt-chip">{props.analysis.conveys ?? "unknown signal"}</div>
            </div>
            <div className="panel-body space-y-4">
              {props.mediaDisplayUrl ? (
                <div className="tt-media-frame aspect-video">
                  <MediaPreview alt={props.tweetText ?? "media asset"} imageUrl={props.mediaDisplayUrl} videoFilePath={props.videoFilePath} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {props.analysis.primaryEmotion ? <span className="tt-chip">{props.analysis.primaryEmotion}</span> : null}
                {props.analysis.rhetoricalRole ? <span className="tt-chip">{props.analysis.rhetoricalRole}</span> : null}
              </div>
              <div className="tt-subpanel">
                <p className="text-sm leading-7 text-slate-200">{props.tweetText ?? "No original tweet text."}</p>
              </div>
              {props.relatedTopics.length > 0 ? (
                <div className="tt-subpanel-soft">
                  <div className="tt-data-label">Relevant Topics</div>
                  <div className="mt-2 space-y-2">
                    {props.relatedTopics.slice(0, 3).map((topic) => (
                      <div key={`${topic.label}-${topic.hotnessScore}`} className="text-sm leading-6 text-slate-200">
                        <div className="text-xs uppercase tracking-[0.12em] text-cyan">
                          {topic.label} · hot {topic.hotnessScore.toFixed(1)} · {topic.stance} · {topic.sentiment}
                        </div>
                        {topic.whyNow ? <p className="mt-1 text-slate-300">{topic.whyNow}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isRunning ? (
          <div className="mt-6 terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Working</div>
              <div className="tt-chip tt-chip-accent">{latestProgress?.stage ?? "running"}</div>
            </div>
            <div className="panel-body grid gap-3">
              {progressEvents.map((event, index) => (
                <div key={`${event.stage}-${index}`} className="tt-subpanel-soft">
                  <div className="tt-data-label">{event.stage}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{event.message}</p>
                  {event.detail ? <p className="mt-2 text-xs uppercase tracking-[0.12em] text-cyan">{event.detail}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="terminal-window">
              <div className="window-bar">
                <div className="section-kicker">Draft</div>
                <div className="tt-chip tt-chip-accent">{result.subject.assetId ?? result.subject.usageId}</div>
              </div>
              <div className="panel-body space-y-4">
                <div className="tt-subpanel">
                  <p className="text-base leading-8 text-slate-100">{result.tweet.text}</p>
                </div>
                <PostToXButton
                  mode="new_post"
                  text={result.tweet.text}
                  mediaFilePath={result.selectedMedia?.videoFilePath ?? result.selectedMedia?.localFilePath ?? props.videoFilePath}
                  draftTitle={props.assetId ? `asset ${props.assetId}` : "media draft"}
                  scratchpadText={result.tweet.postingNotes ?? result.tweet.whyThisTweetWorks}
                />
                <div className="flex flex-wrap gap-2">
                  {result.plan.supportingTopics.map((topic) => (
                    <span key={topic} className="tt-chip">
                      {topic}
                    </span>
                  ))}
                </div>
                <div className="tt-subpanel-soft">
                  <div className="tt-data-label">Media Selection</div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{result.tweet.mediaSelectionReason}</p>
                </div>
                <div className="tt-subpanel-soft">
                  <div className="tt-data-label">Why It Works</div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{result.tweet.whyThisTweetWorks}</p>
                  {result.tweet.postingNotes ? (
                    <p className="mt-2 text-sm leading-6 text-slate-300">{result.tweet.postingNotes}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="terminal-window">
              <div className="window-bar">
                <div className="section-kicker">Selected Media</div>
                <div className="tt-chip">{result.search.resultCount} candidates</div>
              </div>
              <div className="panel-body space-y-4">
                {result.selectedMedia ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <span className="tt-chip">
                        {result.selectedMedia.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                      </span>
                      {result.selectedMedia.sourceLabel ? <span className="tt-chip">{result.selectedMedia.sourceLabel}</span> : null}
                      <span className="tt-chip">{formatDate(result.selectedMedia.createdAt)}</span>
                    </div>
                    {result.selectedMedia.displayUrl ? (
                      <div className="tt-media-frame aspect-video">
                        <MediaPreview
                          alt={result.selectedMedia.tweetText ?? "selected media"}
                          imageUrl={result.selectedMedia.displayUrl}
                          videoFilePath={result.selectedMedia.videoFilePath}
                        />
                      </div>
                    ) : null}
                    <p className="text-sm leading-7 text-slate-200">{result.selectedMedia.tweetText ?? "No tweet text"}</p>
                  </>
                ) : (
                  <div className="tt-placeholder">No alternate media selected. The current asset stays in place.</div>
                )}
                <div className="tt-subpanel-soft">
                  <div className="tt-data-label">Planned Angle</div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{result.plan.angle}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{result.plan.postIntent}</p>
                  {result.search.warning ? <p className="mt-2 text-sm leading-6 text-rose-300">{result.search.warning}</p> : null}
                </div>
                {result.alternativeMedia.length > 0 ? (
                  <div className="tt-subpanel-soft">
                    <div className="tt-data-label">Alternatives</div>
                    <div className="mt-2 space-y-2">
                      {result.alternativeMedia.map((candidate) => (
                        <div key={candidate.candidateId} className="text-sm leading-6 text-slate-200">
                          <div className="text-xs uppercase tracking-[0.12em] text-cyan">
                            {candidate.matchReason ?? "candidate"} · {candidate.combinedScore.toFixed(3)}
                          </div>
                          <div className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-slate-400">
                            {candidate.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                            {candidate.sourceLabel ? ` · ${candidate.sourceLabel}` : ""}
                          </div>
                          <p className="mt-1">{candidate.tweetText ?? "No tweet text"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 terminal-window">
          <div className="window-bar">
            <div className="section-kicker">Recent Media Drafts</div>
            <a href="/drafts" className="tt-link">
              <span>Open all drafts</span>
            </a>
          </div>
          <div className="panel-body">
            {draftHistory.length === 0 ? (
              <div className="tt-placeholder">No saved media drafts yet.</div>
            ) : (
              <div className="grid gap-3">
                {draftHistory.map((draft) => (
                  <div key={draft.draftId} className="tt-subpanel-soft">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`tt-chip ${draft.status === "running" ? "tt-chip-accent" : draft.status === "failed" ? "tt-chip-danger" : ""}`}>
                        {draft.status}
                      </span>
                      <span className="tt-chip">{formatDate(draft.updatedAt)}</span>
                    </div>
                    {draft.progressMessage ? <p className="text-sm leading-6 text-slate-300">{draft.progressMessage}</p> : null}
                    <ComposeRunReference draft={draft} />
                    {draft.outputs.map((output, index) => (
                      <div key={`${draft.draftId}-${index}`} className="mt-3 border border-white/10 bg-black/10 p-3">
                        <p className="text-sm leading-7 text-slate-100">{output.text}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{output.whyThisWorks}</p>
                        <div className="mt-3">
                          <PostToXButton
                            mode="new_post"
                            text={output.text}
                            mediaFilePath={output.selectedMediaVideoFilePath ?? output.selectedMediaLocalFilePath ?? null}
                            draftTitle={props.assetId ? `asset ${props.assetId}` : "media draft"}
                            scratchpadText={output.postingNotes ?? output.whyThisWorks}
                            draftId={draft.draftId}
                            outputIndex={index}
                            initialSavedAt={output.typefullySavedAt}
                            initialPrivateUrl={output.typefullyPrivateUrl}
                            initialShareUrl={output.typefullyShareUrl}
                            initialDraftStatus={output.typefullyStatus}
                            initialDraftId={output.typefullyDraftId}
                            initialError={output.typefullyError}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
