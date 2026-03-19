"use client";

import Link from "next/link";
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
import { DraftOutputCard } from "@/src/components/draft-output-card";
import type { GeneratedDraftOutputRecord, GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import type {
  ReplyCompositionBatchResult,
  ReplyCompositionGoal,
  ReplyCompositionMode,
  ReplyCompositionProgressEvent,
  ReplyCompositionResult,
  ReplyComposerSubject
} from "@/src/lib/reply-composer";

const GOAL_OPTIONS: Array<{ value: ReplyCompositionGoal; label: string }> = [
  { value: "insight", label: "Add insight" },
  { value: "consequence", label: "Show consequence" },
  { value: "support", label: "Support / reinforce" },
  { value: "critique", label: "Counter / critique" },
  { value: "signal_boost", label: "Signal boost" }
];

function isBatchResult(
  value: ReplyCompositionResult | ReplyCompositionBatchResult
): value is ReplyCompositionBatchResult {
  return "mode" in value && value.mode === "all_goals";
}

function buildDraftOutputFromReplyResult(result: ReplyCompositionResult): GeneratedDraftOutputRecord {
  return {
    goal: result.request.goal,
    text: result.reply.text,
    whyThisWorks: result.reply.whyThisReplyWorks,
    mediaSelectionReason: result.reply.mediaSelectionReason,
    postingNotes: result.reply.postingNotes,
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

export function ReplyComposer(props: {
  usageId?: string;
  tweetId?: string | null;
  subject: ReplyComposerSubject;
}) {
  const maxGoalConcurrency = GOAL_OPTIONS.length;
  const [goal, setGoal] = useState<ReplyCompositionGoal>("insight");
  const [maxConcurrency, setMaxConcurrency] = useState(Math.min(2, maxGoalConcurrency));
  const [toneHint, setToneHint] = useState("sharp but grounded");
  const [angleHint, setAngleHint] = useState("");
  const [constraints, setConstraints] = useState("keep it tight and postable");
  const [results, setResults] = useState<ReplyCompositionResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ReplyCompositionProgressEvent[]>([]);
  const [runMode, setRunMode] = useState<ReplyCompositionMode>("single");
  const [draftHistory, setDraftHistory] = useState<GeneratedDraftRecord[]>([]);

  const latestProgress = progressEvents.at(-1) ?? null;
  const completedGoals = latestProgress?.completedGoals ?? 0;
  const totalGoals = latestProgress?.totalGoals ?? (runMode === "all_goals" ? GOAL_OPTIONS.length : 1);
  const runningGoals = latestProgress?.runningGoals ?? (runMode === "all_goals" && isRunning ? 1 : 0);
  const queuedGoals = latestProgress?.queuedGoals ?? Math.max(0, totalGoals - completedGoals - runningGoals);

  async function loadDraftHistory(): Promise<void> {
    setDraftHistory(
      await fetchGeneratedDraftHistory({
        kind: "reply",
        usageId: props.usageId,
        tweetId: props.usageId ? null : props.tweetId,
        limit: 12
      })
    );
  }

  useEffect(() => {
    let isCancelled = false;

    async function run(): Promise<void> {
      const drafts = await fetchGeneratedDraftHistory({
        kind: "reply",
        usageId: props.usageId,
        tweetId: props.usageId ? null : props.tweetId,
        limit: 12
      });
      if (!isCancelled) {
        setDraftHistory(drafts);
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [props.tweetId, props.usageId]);

  async function composeReply(mode: ReplyCompositionMode): Promise<void> {
    setErrorMessage(null);
    setResults([]);
    setProgressEvents([]);
    setIsRunning(true);
    setRunMode(mode);
    setDraftHistory((current) =>
      prependLocalRunningDraft(
        current,
        buildLocalRunningDraft({
          kind: "reply",
          usageId: props.usageId ?? null,
          tweetId: props.tweetId ?? props.subject.tweetId,
          requestGoal: goal,
          requestMode: mode,
          progressMessage: "Starting reply composition"
        })
      )
    );
    const response = await fetch("/api/reply/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageId: props.usageId,
        tweetId: props.tweetId ?? props.subject.tweetId,
        goal,
        mode,
        toneHint,
        angleHint,
        constraints,
        maxConcurrency: mode === "all_goals" ? maxConcurrency : undefined
      })
    });

    if (!response.ok) {
      const body = await response.json();
      setErrorMessage(body.error || "Reply composition failed");
      setIsRunning(false);
      await loadDraftHistory();
      return;
    }

    try {
      await readNdjsonStream<
        | { type: "draft"; draft: { draftId: string; composeRunId: string; composeRunLogDir: string } }
        | ({ type: "progress" } & ReplyCompositionProgressEvent)
        | { type: "result"; result: ReplyCompositionResult | ReplyCompositionBatchResult }
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
          if (isBatchResult(event.result)) {
            setResults(event.result.results);
          } else {
            setResults([event.result]);
          }
          return;
        }

        if (event.type === "error") {
          setErrorMessage(event.error);
          setDraftHistory((current) => markLeadingRunningDraftFailed(current, event.error));
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reply stream was unavailable";
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
            <div className="section-kicker">Reply Composer</div>
            <h2 className="section-title mt-3">Draft a reply and pair it with matching media</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="tt-chip">{props.subject.analysis.primaryEmotion ?? "unknown mood"}</span>
            <span className="tt-chip">{props.subject.analysis.conveys ?? "unknown signal"}</span>
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
                <span className="tt-field-label">Response Goal</span>
                <select value={goal} onChange={(event) => setGoal(event.target.value as ReplyCompositionGoal)} className="tt-select">
                  {GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Tone Hint</span>
                <input
                  value={toneHint}
                  onChange={(event) => setToneHint(event.target.value)}
                  className="tt-input"
                  placeholder="dry, supportive, clinical, amused..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Angle Hint</span>
                <textarea
                  value={angleHint}
                  onChange={(event) => setAngleHint(event.target.value)}
                  rows={4}
                  className="tt-input min-h-28 resize-y"
                  placeholder="What angle should the reply emphasize?"
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Constraints</span>
                <input
                  value={constraints}
                  onChange={(event) => setConstraints(event.target.value)}
                  className="tt-input"
                  placeholder="short, no dunking, avoid jargon..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">All-Goals Concurrency</span>
                <input
                  type="number"
                  min={1}
                  max={maxGoalConcurrency}
                  value={maxConcurrency}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10);
                    if (Number.isNaN(nextValue)) {
                      setMaxConcurrency(1);
                      return;
                    }

                    setMaxConcurrency(Math.max(1, Math.min(maxGoalConcurrency, nextValue)));
                  }}
                  className="tt-input"
                />
              </label>

              <div className="tt-subpanel-soft">
                <p className="tt-copy">
                  The server asks `gemini` for a reply plan, runs `x-media-analyst search facets` with those queries, then asks `gemini` again to choose the best candidate and draft the final reply. `Compose all goals` reuses the same subject context once, then fans out across goals up to this concurrency cap. If source analysis is still catching up, drafting continues from tweet text and whatever saved context is already available.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="tt-button"
                  onClick={() => void composeReply("single")}
                  disabled={isRunning}
                >
                  <span>{isRunning && runMode === "single" ? "Composing..." : "Compose reply"}</span>
                </button>
                <button
                  className="tt-button"
                  onClick={() => void composeReply("all_goals")}
                  disabled={isRunning}
                >
                  <span>{isRunning && runMode === "all_goals" ? "Composing all..." : "Compose all goals"}</span>
                </button>
                {latestProgress ? <span className="tt-chip tt-chip-accent">{latestProgress.message}</span> : null}
                {errorMessage ? <span className="tt-chip tt-chip-danger">{errorMessage}</span> : null}
              </div>
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Subject Context</div>
              <div className="tt-chip">{props.subject.authorUsername ?? "unknown author"}</div>
            </div>
            <div className="panel-body space-y-4">
              <div className="tt-subpanel">
                <p className="text-sm leading-7 text-slate-200">{props.subject.tweetText ?? "No tweet text"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="tt-chip">{props.subject.mediaKind}</span>
                {props.subject.analysis.culturalReference ? (
                  <span className="tt-chip">{props.subject.analysis.culturalReference}</span>
                ) : null}
                {props.subject.analysis.analogyTarget ? (
                  <span className="tt-chip">{props.subject.analysis.analogyTarget}</span>
                ) : null}
              </div>
              <div className="tt-subpanel-soft">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="tt-data-label">Conveys</div>
                    <div className="mt-2 text-sm text-slate-200">{props.subject.analysis.conveys ?? "unknown"}</div>
                  </div>
                  <div>
                    <div className="tt-data-label">Rhetorical role</div>
                    <div className="mt-2 text-sm text-slate-200">{props.subject.analysis.rhetoricalRole ?? "unknown"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isRunning ? (
          <div className="mt-6 terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Working</div>
              <div className="tt-chip tt-chip-accent">{latestProgress?.stage ?? "running"}</div>
            </div>
            <div className="panel-body grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Current Step</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{latestProgress?.message ?? "Starting compose pipeline"}</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {runMode === "all_goals"
                    ? `${runningGoals} running, ${queuedGoals} queued, ${completedGoals} of ${totalGoals} completed`
                    : "Running selected goal"}
                </p>
                {latestProgress?.detail ? (
                  <p className="mt-3 break-words font-[family:var(--font-mono)] text-xs uppercase tracking-[0.12em] text-cyan">
                    {latestProgress.detail}
                  </p>
                ) : null}
                {runMode === "all_goals" ? (
                  <div className="mt-4 h-3 overflow-hidden border border-cyan/40 bg-black/40">
                    <div
                      className="h-full bg-cyan transition-all duration-300 ease-linear"
                      style={{ width: `${Math.max(8, Math.round((completedGoals / Math.max(1, totalGoals)) * 100))}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3">
                {progressEvents.map((event, index) => (
                  <div key={`${event.stage}-${index}`} className="tt-subpanel-soft">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="tt-data-label">{event.goal ? `${event.goal} • ${event.stage}` : event.stage}</div>
                      <div className="tt-chip tt-chip-accent">
                        {typeof event.runningGoals === "number" && typeof event.queuedGoals === "number"
                          ? `${event.runningGoals} run / ${event.queuedGoals} queue`
                          : `step ${index + 1}`}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{event.message}</p>
                    {event.detail ? (
                      <p className="mt-2 break-words font-[family:var(--font-mono)] text-xs uppercase tracking-[0.12em] text-cyan">
                        {event.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="section-kicker">Reply Options</div>
                <h2 className="section-title mt-3">
                  {results.length === 1 ? "Single reply/media pairing" : `${results.length} reply/media pairings to compare`}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  Each result now keeps a much larger local media candidate set. The shared draft card shows the first 8 options by default, with a toggle to expand the full saved pool when you need it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {results.map((item) => (
                  <span key={item.request.goal} className="tt-chip">
                    {item.request.goal}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {results.map((item, index) => (
                <article key={`${item.request.goal}-${item.reply.text}`} className="terminal-window">
                  <div className="window-bar">
                    <div className="section-kicker">{item.request.goal}</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="tt-chip">{item.provider}</span>
                      <span className="tt-chip">{item.search.resultCount} unique saved</span>
                      {typeof item.search.rawResultCount === "number" ? (
                        <span className="tt-chip">{item.search.rawResultCount} raw hits</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="panel-body space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Angle</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.plan.angle}</p>
                      </div>
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Why It Works</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.reply.whyThisReplyWorks}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(item.search.queryOutcomes ?? item.search.queries.map((query) => ({ query, resultCount: 0 }))).map((entry) => (
                        <span key={`${item.request.goal}-${entry.query}`} className="tt-chip">
                          {entry.query} {entry.resultCount > 0 ? `(${entry.resultCount})` : ""}
                        </span>
                      ))}
                    </div>

                    <DraftOutputCard
                      draftId={`live-reply-${index}-${item.request.goal}`}
                      draftKind="reply"
                      output={buildDraftOutputFromReplyResult(item)}
                      outputIndex={0}
                      replyTargetUrl={item.subject.tweetUrl}
                      draftTitle={`${item.request.goal} reply`}
                      regenerateReplyRequest={{
                        usageId: item.request.usageId ?? null,
                        tweetId: item.request.tweetId ?? null,
                        goal: item.request.goal
                      }}
                      onRegenerated={async () => {
                        await loadDraftHistory();
                      }}
                    />

                    {item.search.warning ? <div className="tt-chip tt-chip-danger">{item.search.warning}</div> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 terminal-window">
          <div className="window-bar">
            <div className="section-kicker">Recent Reply Drafts</div>
            <Link href="/drafts" className="tt-link">
              <span>Open all drafts</span>
            </Link>
          </div>
          <div className="panel-body">
            {draftHistory.length === 0 ? (
              <div className="tt-placeholder">No saved reply drafts yet.</div>
            ) : (
              <div className="grid gap-3">
                {draftHistory.map((draft) => (
                  <div key={draft.draftId} className="tt-subpanel-soft">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`tt-chip ${draft.status === "running" ? "tt-chip-accent" : draft.status === "failed" ? "tt-chip-danger" : ""}`}>
                        {draft.status}
                      </span>
                      {draft.requestGoal ? <span className="tt-chip">{draft.requestGoal}</span> : null}
                      <span className="tt-chip">
                        {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.updatedAt))}
                      </span>
                    </div>
                    {draft.progressMessage ? <p className="text-sm leading-6 text-slate-300">{draft.progressMessage}</p> : null}
                    <ComposeRunReference draft={draft} />
                    {draft.errorMessage ? <p className="mt-2 text-sm leading-6 text-rose-300">{draft.errorMessage}</p> : null}
                    {draft.outputs.map((output, index) => (
                      <div key={`${draft.draftId}-${index}`} className="mt-3">
                        <DraftOutputCard
                          draftId={draft.draftId}
                          draftKind="reply"
                          output={output}
                          outputIndex={index}
                          replyTargetUrl={props.subject.tweetUrl}
                          draftTitle={output.goal ? `${output.goal} reply` : "reply draft"}
                          regenerateReplyRequest={{
                            usageId: draft.usageId,
                            tweetId: draft.tweetId,
                            goal: draft.requestGoal ?? output.goal
                          }}
                          onRegenerated={async () => {
                            await loadDraftHistory();
                          }}
                        />
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
