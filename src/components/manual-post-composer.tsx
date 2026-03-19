"use client";

import { useEffect, useState } from "react";
import {
  applyDraftRefToLeadingRunningDraft,
  buildLocalRunningDraft,
  fetchGeneratedDraftHistory,
  prependLocalRunningDraft
} from "@/src/components/compose-client";
import { ComposeRunReference } from "@/src/components/compose-run-reference";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import type { GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import type { ManualPostProgressEvent, ManualPostResult } from "@/src/lib/manual-post-composer";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";

export function ManualPostComposer() {
  const [briefText, setBriefText] = useState("");
  const [toneHint, setToneHint] = useState("sharp and feed-native");
  const [targetAudience, setTargetAudience] = useState("");
  const [angleHint, setAngleHint] = useState("");
  const [constraints, setConstraints] = useState("make it postable, not essay-like");
  const [mustInclude, setMustInclude] = useState("");
  const [avoid, setAvoid] = useState("");
  const [result, setResult] = useState<ManualPostResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingTrendBrief, setIsLoadingTrendBrief] = useState(false);
  const [trendBriefMeta, setTrendBriefMeta] = useState<{
    timeframeHours: number;
    generatedAt: string;
    topicCount: number;
    tweetCount: number;
    topics: Array<{
      label: string;
      kind: string;
      hotnessScore: number;
      recentTweetCount24h: number;
      tweetCount: number;
      mostRecentAt: string | null;
      whyNow: string;
    }>;
    tweets: Array<{
      authorUsername: string | null;
      text: string;
      likes: number;
      topicLabel: string | null;
      createdAt: string | null;
    }>;
  } | null>(null);
  const [trendTimeframeHours, setTrendTimeframeHours] = useState(48);
  const [progressEvents, setProgressEvents] = useState<ManualPostProgressEvent[]>([]);
  const [draftHistory, setDraftHistory] = useState<GeneratedDraftRecord[]>([]);
  const latestProgress = progressEvents.at(-1) ?? null;

  async function loadDraftHistory(): Promise<void> {
    setDraftHistory(await fetchGeneratedDraftHistory({ kind: "manual_post", limit: 12 }));
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const drafts = await fetchGeneratedDraftHistory({ kind: "manual_post", limit: 12 });
      if (!cancelled) {
        setDraftHistory(drafts);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchTrendBrief(): Promise<string | null> {
    setIsLoadingTrendBrief(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/manual-post/trends?timeframeHours=${trendTimeframeHours}`, {
        method: "GET",
        cache: "no-store"
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to build trend brief");
      }

      const nextBriefText = typeof body.briefText === "string" ? body.briefText : "";
      if (!nextBriefText.trim()) {
        throw new Error("Trend brief came back empty");
      }

      setBriefText(nextBriefText);
      setTrendBriefMeta({
        timeframeHours: typeof body.timeframeHours === "number" ? body.timeframeHours : 48,
        generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : new Date().toISOString(),
        topicCount: typeof body.topicCount === "number" ? body.topicCount : 0,
        tweetCount: typeof body.tweetCount === "number" ? body.tweetCount : 0,
        topics: Array.isArray(body.topics) ? body.topics : [],
        tweets: Array.isArray(body.tweets) ? body.tweets : []
      });
      return nextBriefText;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to build trend brief";
      setErrorMessage(message);
      return null;
    } finally {
      setIsLoadingTrendBrief(false);
    }
  }

  async function compose(briefOverride?: string): Promise<void> {
    const nextBriefText = (briefOverride ?? briefText).trim();
    const isTrendDigestRequest = Boolean(trendBriefMeta);
    if (!nextBriefText) {
      setErrorMessage("Paste notes or load the last 48 hours first.");
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setResult(null);
    setProgressEvents([]);
    setDraftHistory((current) =>
      prependLocalRunningDraft(
        current,
        buildLocalRunningDraft({
          kind: "manual_post",
          requestMode: "single",
          progressMessage: "Starting manual-post composition"
        })
      )
    );

    const response = await fetch("/api/manual-post/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefText: nextBriefText,
        sourceMode: isTrendDigestRequest ? "trend_digest" : undefined,
        toneHint,
        targetAudience,
        angleHint,
        constraints,
        mustInclude,
        avoid,
        trendContext:
          isTrendDigestRequest && trendBriefMeta
            ? {
                timeframeHours: trendBriefMeta.timeframeHours,
                generatedAt: trendBriefMeta.generatedAt,
                topicCount: trendBriefMeta.topicCount,
                tweetCount: trendBriefMeta.tweetCount,
                topics: trendBriefMeta.topics,
                tweets: trendBriefMeta.tweets
              }
            : undefined
      })
    });

    if (!response.ok) {
      const body = await response.json();
      const message = body.error || "Manual-post composition failed";
      setErrorMessage(message);
      setIsRunning(false);
      await loadDraftHistory();
      return;
    }

    try {
      await readNdjsonStream<
        | { type: "draft"; draft: { draftId: string; composeRunId: string; composeRunLogDir: string } }
        | ({ type: "progress" } & ManualPostProgressEvent)
        | { type: "result"; result: ManualPostResult }
        | { type: "error"; error: string }
      >(response, (event) => {
        if (event.type === "draft") {
          setDraftHistory((current) => applyDraftRefToLeadingRunningDraft(current, event.draft));
          return;
        }

        if (event.type === "progress") {
          setProgressEvents((current) => [...current, event]);
          return;
        }

        if (event.type === "result") {
          setResult(event.result);
          return;
        }

        if (event.type === "error") {
          setErrorMessage(event.error);
        }
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Manual-post stream was unavailable");
    }

    await loadDraftHistory();
    setIsRunning(false);
  }

  async function composeFromTrends(): Promise<void> {
    if (isRunning) {
      return;
    }

    const nextBriefText = await fetchTrendBrief();
    if (!nextBriefText) {
      return;
    }

    await compose(nextBriefText);
  }

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">New post</div>
            <h2 className="section-title mt-3">Turn notes into a post</h2>
            <p className="page-intro mt-3 max-w-3xl">
              Paste rough notes, context, or ideas and turn them into a draft you can refine.
            </p>
          </div>
          {latestProgress ? <span className="tt-chip tt-chip-accent">{latestProgress.message}</span> : null}
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
                <span className="tt-field-label">Notes</span>
                <textarea
                  value={briefText}
                  onChange={(event) => setBriefText(event.target.value)}
                  rows={10}
                  className="tt-input min-h-52 resize-y"
                  placeholder="Paste notes, bullets, links, context, or ideas..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Tone</span>
                <input value={toneHint} onChange={(event) => setToneHint(event.target.value)} className="tt-input" />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Trend Window</span>
                <select
                  value={trendTimeframeHours}
                  onChange={(event) => setTrendTimeframeHours(Number(event.target.value))}
                  className="tt-select"
                >
                  <option value={24}>Last 24 hours</option>
                  <option value={48}>Last 48 hours</option>
                  <option value={72}>Last 72 hours</option>
                </select>
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Audience</span>
                <input
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                  className="tt-input"
                  placeholder="Founders, devtools buyers, crypto traders..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Angle</span>
                <textarea
                  value={angleHint}
                  onChange={(event) => setAngleHint(event.target.value)}
                  rows={4}
                  className="tt-input min-h-28 resize-y"
                  placeholder="What should the post emphasize?"
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Constraints</span>
                <input value={constraints} onChange={(event) => setConstraints(event.target.value)} className="tt-input" />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Must Include</span>
                <input
                  value={mustInclude}
                  onChange={(event) => setMustInclude(event.target.value)}
                  className="tt-input"
                  placeholder="Specific phrase, number, or claim to keep"
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Avoid</span>
                <input
                  value={avoid}
                  onChange={(event) => setAvoid(event.target.value)}
                  className="tt-input"
                  placeholder="Words, claims, or tone to avoid"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button className="tt-button" onClick={() => void compose()} disabled={isRunning || isLoadingTrendBrief || !briefText.trim()}>
                  <span>{isRunning ? "Composing..." : "Draft post"}</span>
                </button>
                <button
                  type="button"
                  className="tt-button tt-button-secondary"
                  onClick={() => void fetchTrendBrief()}
                  disabled={isRunning || isLoadingTrendBrief}
                >
                  <span>{isLoadingTrendBrief ? "Loading trends..." : "Load last 48h trends"}</span>
                </button>
                <button
                  type="button"
                  className="tt-button tt-button-secondary"
                  onClick={() => void composeFromTrends()}
                  disabled={isRunning || isLoadingTrendBrief}
                >
                  <span>Draft from last 48h</span>
                </button>
                <span className="tt-chip">
                  {briefText.trim() ? `${briefText.trim().length} chars` : "paste a brief"}
                </span>
                {trendBriefMeta ? (
                  <span className="tt-chip tt-chip-accent">
                    {trendBriefMeta.timeframeHours}h trends · {trendBriefMeta.topicCount} topics · {trendBriefMeta.tweetCount} tweets
                  </span>
                ) : null}
              </div>

              {trendBriefMeta ? (
                <div className="tt-subpanel-soft">
                  <div className="tt-data-label">Trend digest loaded</div>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Built from {trendBriefMeta.topicCount} topics and {trendBriefMeta.tweetCount} high-signal tweets.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {trendBriefMeta.topics.slice(0, 6).map((topic) => (
                      <span key={topic.label} className="tt-chip">
                        {topic.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {errorMessage ? (
                <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200">
                  {errorMessage}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            {result ? (
              <article className="terminal-window overflow-hidden">
                <div className="window-bar">
                  <div className="section-kicker">Current draft</div>
                  <div className="window-dots">
                    <span className="window-dot bg-orange" />
                    <span className="window-dot bg-accent" />
                    <span className="window-dot bg-cyan" />
                  </div>
                </div>
                <div className="panel-body space-y-4">
                  <div className="tt-subpanel-soft">
                    <div className="text-lg leading-8 text-slate-100">{result.tweet.text}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="tt-subpanel-soft">
                      <div className="tt-data-label">Why it works</div>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{result.tweet.whyThisTweetWorks}</p>
                    </div>
                    <div className="tt-subpanel-soft">
                      <div className="tt-data-label">Why this media was chosen</div>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{result.tweet.mediaSelectionReason}</p>
                    </div>
                  </div>

                  {result.selectedMedia ? (
                    <div className="tt-subpanel-soft">
                      <div className="tt-data-label">Selected media</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[12rem_1fr]">
                        <div className="tt-media-frame aspect-video">
                          <MediaPreview
                            alt={result.selectedMedia.tweetText ?? "selected media"}
                            imageUrl={result.selectedMedia.displayUrl}
                            videoFilePath={result.selectedMedia.videoFilePath}
                          />
                        </div>
                        <div className="space-y-2 text-sm leading-6 text-slate-200">
                          <p>{result.selectedMedia.tweetText ?? result.selectedMedia.sourceLabel ?? "Selected local candidate"}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="tt-chip">{result.selectedMedia.sourceType}</span>
                            {result.selectedMedia.authorUsername ? <span className="tt-chip">@{result.selectedMedia.authorUsername}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <PostToXButton
                    mode="new_post"
                    text={result.tweet.text}
                    mediaFilePath={result.selectedMedia?.videoFilePath ?? result.selectedMedia?.localFilePath ?? null}
                    draftTitle="manual post"
                    scratchpadText={
                      [
                        briefText.trim(),
                        targetAudience.trim() ? `audience: ${targetAudience.trim()}` : null,
                        angleHint.trim() ? `angle: ${angleHint.trim()}` : null,
                        constraints.trim() ? `constraints: ${constraints.trim()}` : null,
                        mustInclude.trim() ? `must include: ${mustInclude.trim()}` : null,
                        avoid.trim() ? `avoid: ${avoid.trim()}` : null
                      ]
                        .filter(Boolean)
                        .join("\n\n")
                    }
                  />
                </div>
              </article>
            ) : (
              <article className="tt-subpanel-soft">
                <div className="tt-data-label">How It Works</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  The server plans a posting move from your pasted notes, searches the local media corpus with short retrieval queries, then writes one new post with optional media.
                </p>
              </article>
            )}

            {draftHistory.length > 0 ? (
              <article className="tt-subpanel-soft">
                <div className="tt-data-label">Recent Drafts</div>
                <div className="mt-3 space-y-3">
                  {draftHistory.slice(0, 4).map((draft) => {
                    const output = draft.outputs[0] ?? null;
                    if (!output) {
                      return (
                      <div key={draft.draftId} className="border border-white/10 bg-black/10 p-3 text-sm text-slate-300">
                          {draft.progressMessage ?? draft.status}
                          <ComposeRunReference draft={draft} className="mt-2" />
                        </div>
                      );
                    }

                    return (
                      <div key={draft.draftId} className="border border-white/10 bg-black/10 p-3">
                        <div className="text-sm leading-6 text-slate-100">{output.text}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="tt-chip">{draft.status}</span>
                          {output.selectedMediaSourceType ? <span className="tt-chip">{output.selectedMediaSourceType}</span> : null}
                        </div>
                        <ComposeRunReference draft={draft} className="mt-2" />
                      </div>
                    );
                  })}
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
