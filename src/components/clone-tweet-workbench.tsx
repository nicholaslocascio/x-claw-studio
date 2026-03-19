"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyDraftRefToLeadingRunningDraft,
  buildLocalRunningDraft,
  fetchGeneratedDraftHistory,
  prependLocalRunningDraft
} from "@/src/components/compose-client";
import { ComposeRunReference } from "@/src/components/compose-run-reference";
import { DraftOutputCard } from "@/src/components/draft-output-card";
import type { CloneTweetResult, CloneTweetSourceLookupResult } from "@/src/lib/clone-tweet-composer";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import type { GeneratedDraftOutputRecord, GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

type SourceMode = "tweet_id" | "url" | "text";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function buildLiveOutput(result: CloneTweetResult): GeneratedDraftOutputRecord {
  return {
    goal: null,
    text: result.tweet.text,
    whyThisWorks: result.tweet.whyThisTweetWorks,
    mediaSelectionReason: result.tweet.mediaSelectionReason,
    postingNotes: result.tweet.postingNotes,
    selectedMediaLabel: result.selectedMedia?.sourceLabel ?? result.selectedMedia?.tweetText ?? null,
    selectedMediaSourceType: result.selectedMedia?.sourceType ?? null,
    selectedMediaCandidateId: result.selectedMedia?.candidateId ?? null,
    selectedMediaUsageId: result.selectedMedia?.usageId ?? null,
    selectedMediaAssetId: result.selectedMedia?.assetId ?? null,
    selectedMediaTweetId: result.selectedMedia?.tweetId ?? null,
    selectedMediaTweetUrl: result.selectedMedia?.tweetUrl ?? null,
    selectedMediaDisplayUrl: result.selectedMedia?.displayUrl ?? null,
    selectedMediaLocalFilePath: result.selectedMedia?.localFilePath ?? null,
    selectedMediaVideoFilePath: result.selectedMedia?.videoFilePath ?? null,
    selectedMediaCombinedScore: result.selectedMedia?.combinedScore ?? null,
    selectedMediaRankingScore: result.selectedMedia?.rankingScore ?? null,
    selectedMediaMatchReason: result.selectedMedia?.matchReason ?? null,
    selectedMediaAssetStarred: result.selectedMedia?.assetStarred ?? false,
    selectedMediaAssetUsageCount: result.selectedMedia?.assetUsageCount ?? null,
    selectedMediaDuplicateGroupUsageCount: result.selectedMedia?.duplicateGroupUsageCount ?? null,
    selectedMediaHotnessScore: result.selectedMedia?.hotnessScore ?? null,
    alternativeMedia: result.alternativeMedia.map((candidate) => ({
      candidateId: candidate.candidateId,
      usageId: candidate.usageId,
      assetId: candidate.assetId,
      tweetId: candidate.tweetId,
      tweetUrl: candidate.tweetUrl,
      authorUsername: candidate.authorUsername,
      tweetText: candidate.tweetText,
      displayUrl: candidate.displayUrl,
      localFilePath: candidate.localFilePath,
      videoFilePath: candidate.videoFilePath,
      sourceType: candidate.sourceType,
      sourceLabel: candidate.sourceLabel,
      combinedScore: candidate.combinedScore,
      rankingScore: candidate.rankingScore,
      matchReason: candidate.matchReason,
      assetStarred: candidate.assetStarred,
      assetUsageCount: candidate.assetUsageCount,
      duplicateGroupUsageCount: candidate.duplicateGroupUsageCount,
      hotnessScore: candidate.hotnessScore,
      sceneDescription: candidate.analysis?.sceneDescription ?? null,
      primaryEmotion: candidate.analysis?.primaryEmotion ?? null,
      conveys: candidate.analysis?.conveys ?? null
    }))
  };
}

export function CloneTweetWorkbench(props: {
  initialTweetId?: string;
  initialUrl?: string;
  initialText?: string;
}) {
  const initialMode: SourceMode = props.initialText?.trim()
    ? "text"
    : props.initialUrl?.trim()
      ? "url"
      : "tweet_id";
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialMode);
  const [tweetId, setTweetId] = useState(props.initialTweetId ?? "");
  const [xUrl, setXUrl] = useState(props.initialUrl ?? "");
  const [sourceText, setSourceText] = useState(props.initialText ?? "");
  const [resolved, setResolved] = useState<CloneTweetSourceLookupResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [styleMode, setStyleMode] = useState<"preserve" | "refresh" | "replace">("preserve");
  const [topicMode, setTopicMode] = useState<"preserve" | "refresh" | "replace">("refresh");
  const [mediaMode, setMediaMode] = useState<"auto" | "keep_source_media" | "search_new_media" | "text_only">("auto");
  const [toneHint, setToneHint] = useState("keep it platform-native");
  const [styleInstruction, setStyleInstruction] = useState("");
  const [topicInstruction, setTopicInstruction] = useState("");
  const [constraints, setConstraints] = useState("make it postable, not derivative");
  const [mustInclude, setMustInclude] = useState("");
  const [avoid, setAvoid] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  const [result, setResult] = useState<CloneTweetResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<Array<{ stage: string; message: string; detail?: string | null }>>([]);
  const [draftHistory, setDraftHistory] = useState<GeneratedDraftRecord[]>([]);
  const didAutoResolveRef = useRef(false);

  const preferredUrl = getPreferredXStatusUrl(resolved?.subject.tweetUrl ?? resolved?.normalizedUrl ?? null);
  const latestProgress = progressMessages.at(-1) ?? null;
  const liveOutput = useMemo(() => (result ? buildLiveOutput(result) : null), [result]);

  async function loadDraftHistory(nextTweetId?: string | null): Promise<void> {
    if (!nextTweetId) {
      setDraftHistory([]);
      return;
    }

    setDraftHistory(await fetchGeneratedDraftHistory({ kind: "clone_tweet", tweetId: nextTweetId, limit: 12 }));
  }

  const resolveSource = useCallback(async (nextMode = sourceMode): Promise<void> => {
    setIsResolving(true);
    setResolveError(null);
    setResult(null);

    try {
      const body =
        nextMode === "tweet_id"
          ? { tweetId: tweetId.trim() }
          : nextMode === "url"
            ? { xUrl: xUrl.trim() }
            : { sourceText: sourceText.trim() };
      const response = await fetch("/api/clone/source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load clone source");
      }

      setResolved(payload as CloneTweetSourceLookupResult);
      await loadDraftHistory((payload as CloneTweetSourceLookupResult).subject.tweetId);
    } catch (error) {
      setResolved(null);
      setDraftHistory([]);
      setResolveError(error instanceof Error ? error.message : "Failed to load clone source");
    } finally {
      setIsResolving(false);
    }
  }, [sourceMode, sourceText, tweetId, xUrl]);

  useEffect(() => {
    if (didAutoResolveRef.current) {
      return;
    }

    const shouldAutoResolve =
      (sourceMode === "tweet_id" && tweetId.trim()) ||
      (sourceMode === "url" && xUrl.trim()) ||
      (sourceMode === "text" && sourceText.trim());
    if (!shouldAutoResolve) {
      return;
    }

    didAutoResolveRef.current = true;
    void resolveSource(sourceMode);
  }, [resolveSource, sourceMode, sourceText, tweetId, xUrl]);

  useEffect(() => {
    setResolved(null);
    setResolveError(null);
    setResult(null);
    setRunError(null);
    setDraftHistory([]);
  }, [sourceMode]);

  async function composeClone(): Promise<void> {
    setIsRunning(true);
    setRunError(null);
    setResult(null);
    setProgressMessages([]);
    setDraftHistory((current) =>
      prependLocalRunningDraft(
        current,
        buildLocalRunningDraft({
          kind: "clone_tweet",
          tweetId: resolved?.subject.tweetId ?? null,
          requestMode: "single",
          progressMessage: "Starting clone composition"
        })
      )
    );

    const response = await fetch("/api/clone/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tweetId: sourceMode === "tweet_id" ? tweetId.trim() || undefined : undefined,
        xUrl: sourceMode === "url" ? xUrl.trim() || undefined : undefined,
        sourceText: sourceMode === "text" ? sourceText.trim() || undefined : undefined,
        styleMode,
        topicMode,
        mediaMode,
        toneHint,
        styleInstruction,
        topicInstruction,
        constraints,
        mustInclude,
        avoid,
        customInstructions
      })
    });

    if (!response.ok) {
      const body = await response.json();
      setRunError(body.error || "Clone composition failed");
      setIsRunning(false);
      await loadDraftHistory(resolved?.subject.tweetId);
      return;
    }

    try {
      await readNdjsonStream<
        | { type: "draft"; draft: { draftId: string; composeRunId: string; composeRunLogDir: string } }
        | { type: "progress"; stage: string; message: string; detail?: string | null }
        | { type: "result"; result: CloneTweetResult }
        | { type: "error"; error: string }
      >(response, (event) => {
        if (event.type === "draft") {
          setDraftHistory((current) => applyDraftRefToLeadingRunningDraft(current, event.draft));
          return;
        }

        if (event.type === "progress") {
          setProgressMessages((current) => [...current, event]);
          return;
        }

        if (event.type === "result") {
          setResult(event.result);
          return;
        }

        if (event.type === "error") {
          setRunError(event.error);
        }
      });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Clone stream was unavailable");
    }

    await loadDraftHistory(resolved?.subject.tweetId);
    setIsRunning(false);
  }

  return (
    <>
      <section className="relative z-10 mb-8 terminal-window overflow-hidden">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Clone Tweet</div>
            <div className="mt-2 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-muted">
              &gt; rewrite one tweet while steering style, topic, and media
            </div>
          </div>
          <div className="window-dots">
            <span className="window-dot bg-orange" />
            <span className="window-dot bg-accent" />
            <span className="window-dot bg-cyan" />
          </div>
        </div>
        <div className="panel-body">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="section-title mt-1">Clone a tweet into a new post</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                Start from a captured tweet, a pasted X status URL, or raw tweet text. Keep the voice, swap the topic, keep the topic, swap the voice, or tell it exactly how to bend. You can also reuse the source media or ask for new matching media.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/tweets" className="tt-link">
                <span>Tweet browser</span>
              </Link>
              <Link href="/drafts" className="tt-link">
                <span>Draft history</span>
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">1. Load source</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Pull a captured tweet, fetch one by URL through the existing X API path, or just paste tweet text directly.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">2. Bend the rewrite</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Choose what to preserve versus replace across style and topic, then add direction in plain language.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">3. Choose media</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Keep the original asset, search the local corpus for new matches, combine both pools, or force text-only.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className={`tt-link ${sourceMode === "tweet_id" ? "tt-chip-accent" : ""}`} onClick={() => setSourceMode("tweet_id")}>
              <span>Captured tweet</span>
            </button>
            <button type="button" className={`tt-link ${sourceMode === "url" ? "tt-chip-accent" : ""}`} onClick={() => setSourceMode("url")}>
              <span>Tweet URL</span>
            </button>
            <button type="button" className={`tt-link ${sourceMode === "text" ? "tt-chip-accent" : ""}`} onClick={() => setSourceMode("text")}>
              <span>Tweet text</span>
            </button>
            {latestProgress ? <span className="tt-chip tt-chip-accent">{latestProgress.message}</span> : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="terminal-window">
              <div className="window-bar">
                <div className="section-kicker">Source</div>
                <div className="window-dots">
                  <span className="window-dot bg-orange" />
                  <span className="window-dot bg-accent" />
                  <span className="window-dot bg-cyan" />
                </div>
              </div>
              <div className="panel-body space-y-4">
                {sourceMode === "tweet_id" ? (
                  <label className="tt-field">
                    <span className="tt-field-label">Tweet ID</span>
                    <input value={tweetId} onChange={(event) => setTweetId(event.target.value)} className="tt-input" placeholder="1946920445079706096" />
                  </label>
                ) : null}

                {sourceMode === "url" ? (
                  <label className="tt-field">
                    <span className="tt-field-label">X Status URL</span>
                    <input value={xUrl} onChange={(event) => setXUrl(event.target.value)} className="tt-input" placeholder="https://x.com/user/status/1234567890" />
                  </label>
                ) : null}

                {sourceMode === "text" ? (
                  <label className="tt-field">
                    <span className="tt-field-label">Tweet Text</span>
                    <textarea
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      rows={6}
                      className="tt-input min-h-36 resize-y"
                      placeholder="Paste the tweet text you want to clone and redirect."
                    />
                  </label>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="tt-button" disabled={isResolving} onClick={() => void resolveSource()}>
                    <span>{isResolving ? "Loading..." : "Load source"}</span>
                  </button>
                  {resolveError ? <span className="tt-chip tt-chip-danger">{resolveError}</span> : null}
                </div>
              </div>
            </div>

            <div className="terminal-window">
              <div className="window-bar">
                <div className="section-kicker">Rewrite Controls</div>
                <div className="tt-chip">{mediaMode}</div>
              </div>
              <div className="panel-body space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="tt-field">
                    <span className="tt-field-label">Style</span>
                    <select value={styleMode} onChange={(event) => setStyleMode(event.target.value as typeof styleMode)} className="tt-select">
                      <option value="preserve">Preserve</option>
                      <option value="refresh">Refresh</option>
                      <option value="replace">Replace</option>
                    </select>
                  </label>
                  <label className="tt-field">
                    <span className="tt-field-label">Topic</span>
                    <select value={topicMode} onChange={(event) => setTopicMode(event.target.value as typeof topicMode)} className="tt-select">
                      <option value="preserve">Preserve</option>
                      <option value="refresh">Refresh</option>
                      <option value="replace">Replace</option>
                    </select>
                  </label>
                  <label className="tt-field">
                    <span className="tt-field-label">Media</span>
                    <select value={mediaMode} onChange={(event) => setMediaMode(event.target.value as typeof mediaMode)} className="tt-select">
                      <option value="auto">Auto</option>
                      <option value="keep_source_media">Keep source media</option>
                      <option value="search_new_media">Search new media</option>
                      <option value="text_only">Text only</option>
                    </select>
                  </label>
                </div>

                <label className="tt-field">
                  <span className="tt-field-label">Tone Hint</span>
                  <input value={toneHint} onChange={(event) => setToneHint(event.target.value)} className="tt-input" />
                </label>

                <label className="tt-field">
                  <span className="tt-field-label">Style Direction</span>
                  <input value={styleInstruction} onChange={(event) => setStyleInstruction(event.target.value)} className="tt-input" placeholder="keep the same cadence but make it less smug" />
                </label>

                <label className="tt-field">
                  <span className="tt-field-label">Topic Direction</span>
                  <input value={topicInstruction} onChange={(event) => setTopicInstruction(event.target.value)} className="tt-input" placeholder="swap the topic from crypto to AI infra" />
                </label>

                <label className="tt-field">
                  <span className="tt-field-label">Constraints</span>
                  <input value={constraints} onChange={(event) => setConstraints(event.target.value)} className="tt-input" />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="tt-field">
                    <span className="tt-field-label">Must Include</span>
                    <input value={mustInclude} onChange={(event) => setMustInclude(event.target.value)} className="tt-input" placeholder="phrase, product, claim, number" />
                  </label>
                  <label className="tt-field">
                    <span className="tt-field-label">Avoid</span>
                    <input value={avoid} onChange={(event) => setAvoid(event.target.value)} className="tt-input" placeholder="phrases or angles to avoid" />
                  </label>
                </div>

                <label className="tt-field">
                  <span className="tt-field-label">Extra Instructions</span>
                  <textarea
                    value={customInstructions}
                    onChange={(event) => setCustomInstructions(event.target.value)}
                    rows={4}
                    className="tt-input min-h-28 resize-y"
                    placeholder="Any additional steering: sharper, more playful, less insider-y, keep the joke but flip the target..."
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="tt-button" disabled={isRunning || !resolved} onClick={() => void composeClone()}>
                    <span>{isRunning ? "Cloning..." : "Draft clone"}</span>
                  </button>
                  {runError ? <span className="tt-chip tt-chip-danger">{runError}</span> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {resolved ? (
        <section className="relative z-10 mb-8 terminal-window">
          <div className="window-bar">
            <div>
              <div className="section-kicker">Loaded Source</div>
              <div className="mt-2 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-muted">
                &gt; {resolved.subject.sourceKind}
              </div>
            </div>
            <div className="window-dots">
              <span className="window-dot bg-orange" />
              <span className="window-dot bg-accent" />
              <span className="window-dot bg-cyan" />
            </div>
          </div>
          <div className="panel-body">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`tt-chip ${resolved.source === "x_api" ? "tt-chip-accent" : ""}`}>{resolved.source}</span>
              <span className="tt-chip">{resolved.analysisStatus}</span>
              <span className="tt-chip">{resolved.subject.mediaKind}</span>
              <span className="tt-chip">{resolved.subject.sourceMedia.length} source media option{resolved.subject.sourceMedia.length === 1 ? "" : "s"}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="tt-subpanel">
                <div className="tt-data-label">Source Text</div>
                <div className="mt-3 text-lg leading-8 text-slate-100">{resolved.subject.tweetText?.trim() || "No source text loaded."}</div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                  {resolved.subject.authorUsername ? <span>@{resolved.subject.authorUsername}</span> : null}
                  <span>{formatDate(resolved.subject.createdAt)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {preferredUrl ? (
                    <a href={preferredUrl} target="_blank" rel="noreferrer" className="tt-link">
                      <span>Open source tweet</span>
                    </a>
                  ) : null}
                  {resolved.subject.tweetId ? (
                    <Link href={`/clone?tweetId=${encodeURIComponent(resolved.subject.tweetId)}`} className="tt-link">
                      <span>Permalink this source</span>
                    </Link>
                  ) : null}
                </div>
              </article>

              <article className="tt-subpanel-soft">
                <div className="tt-data-label">What We Know</div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                  <p><strong className="text-slate-100">Scene:</strong> {resolved.subject.analysis.sceneDescription ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Conveys:</strong> {resolved.subject.analysis.conveys ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Emotion:</strong> {resolved.subject.analysis.primaryEmotion ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Keywords:</strong> {resolved.subject.analysis.searchKeywords.join(", ") || "None"}</p>
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : null}

      {isRunning ? (
        <section className="relative z-10 mb-8 terminal-window">
          <div className="window-bar">
            <div className="section-kicker">Working</div>
            <div className="tt-chip tt-chip-accent">{latestProgress?.stage ?? "running"}</div>
          </div>
          <div className="panel-body grid gap-3">
            {progressMessages.map((event, index) => (
              <div key={`${event.stage}-${index}`} className="tt-subpanel-soft">
                <div className="tt-data-label">{event.stage}</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{event.message}</p>
                {event.detail ? <p className="mt-2 text-xs uppercase tracking-[0.12em] text-cyan">{event.detail}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result && liveOutput ? (
        <section className="relative z-10 mb-8 terminal-window">
          <div className="window-bar">
            <div>
              <div className="section-kicker">Latest Clone</div>
              <div className="mt-2 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-muted">
                &gt; {result.plan.styleDecision}
              </div>
            </div>
            <div className="window-dots">
              <span className="window-dot bg-orange" />
              <span className="window-dot bg-accent" />
              <span className="window-dot bg-cyan" />
            </div>
          </div>
          <div className="panel-body space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Angle</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{result.plan.angle}</p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Style Decision</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{result.plan.styleDecision}</p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Topic Decision</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{result.plan.topicDecision}</p>
              </div>
            </div>

            <DraftOutputCard
              draftId="live-clone"
              draftKind="clone_tweet"
              output={liveOutput}
              outputIndex={0}
              replyTargetUrl={null}
              draftTitle={resolved?.subject.tweetId ? `clone of ${resolved.subject.tweetId}` : "cloned tweet"}
            />
          </div>
        </section>
      ) : null}

      {draftHistory.length > 0 ? (
        <section className="relative z-10 mb-8 terminal-panel">
          <div className="panel-body">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="section-kicker">Recent Clone Drafts</div>
                <h2 className="section-title mt-3">Saved clone history for this source tweet</h2>
              </div>
              {resolved?.subject.tweetId ? <span className="tt-chip">{resolved.subject.tweetId}</span> : null}
            </div>

            <div className="grid gap-4">
              {draftHistory.slice(0, 4).map((draft) => (
                <article key={draft.draftId} className="tt-subpanel-soft">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="tt-chip">{draft.status}</span>
                      <span className="tt-chip">{formatDate(draft.updatedAt)}</span>
                    </div>
                    {draft.progressMessage ? <span className="tt-chip">{draft.progressMessage}</span> : null}
                  </div>
                  <ComposeRunReference draft={draft} className="mb-3" />
                  {draft.outputs[0] ? (
                    <DraftOutputCard
                      draftId={draft.draftId}
                      draftKind="clone_tweet"
                      output={draft.outputs[0]}
                      outputIndex={0}
                      replyTargetUrl={null}
                      draftTitle={resolved?.subject.tweetId ? `clone of ${resolved.subject.tweetId}` : "cloned tweet"}
                    />
                  ) : draft.errorMessage ? (
                    <div className="tt-chip tt-chip-danger">{draft.errorMessage}</div>
                  ) : (
                    <div className="tt-placeholder">No completed output saved yet.</div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
