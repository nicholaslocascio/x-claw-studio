"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import type { GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import type {
  ReplyCompositionBatchResult,
  ReplyCompositionGoal,
  ReplyCompositionMode,
  ReplyCompositionProgressEvent,
  ReplyCompositionResult,
  ReplyComposerSubject
} from "@/src/lib/reply-composer";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

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
    const params = new URLSearchParams({
      kind: "reply",
      limit: "12"
    });
    if (props.usageId) {
      params.set("usageId", props.usageId);
    } else if (props.tweetId) {
      params.set("tweetId", props.tweetId);
    }

    const response = await fetch(`/api/generated-drafts?${params.toString()}`);
    if (!response.ok) {
      return;
    }

    const body = await response.json();
    setDraftHistory(body.drafts ?? []);
  }

  useEffect(() => {
    let isCancelled = false;

    async function run(): Promise<void> {
      const params = new URLSearchParams({
        kind: "reply",
        limit: "12"
      });
      if (props.usageId) {
        params.set("usageId", props.usageId);
      } else if (props.tweetId) {
        params.set("tweetId", props.tweetId);
      }

      const response = await fetch(`/api/generated-drafts?${params.toString()}`);
      if (!response.ok || isCancelled) {
        return;
      }

      const body = await response.json();
      if (!isCancelled) {
        setDraftHistory(body.drafts ?? []);
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
    setDraftHistory((current) => [
      {
        draftId: `local-running-${Date.now()}`,
        kind: "reply",
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageId: props.usageId ?? null,
        tweetId: props.tweetId ?? props.subject.tweetId,
        topicId: null,
        assetId: null,
        requestGoal: goal,
        requestMode: mode,
        progressStage: "starting",
        progressMessage: "Starting reply composition",
        progressDetail: null,
        errorMessage: null,
        outputs: []
      },
      ...current.filter((item) => !item.draftId.startsWith("local-running-"))
    ]);
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
        | ({ type: "progress" } & ReplyCompositionProgressEvent)
        | { type: "result"; result: ReplyCompositionResult | ReplyCompositionBatchResult }
        | { type: "error"; error: string }
      >(response, (event) => {
        if (event.type === "progress") {
          setProgressEvents((current) => [...current, event]);
          setDraftHistory((current) =>
            current.map((item, index) =>
              index === 0 && item.draftId.startsWith("local-running-")
                ? {
                    ...item,
                    updatedAt: new Date().toISOString(),
                    progressStage: event.stage,
                    progressMessage: event.message,
                    progressDetail: event.detail ?? null,
                    requestGoal: event.goal ?? item.requestGoal
                  }
                : item
            )
          );
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
          setDraftHistory((current) =>
            current.map((item, index) =>
              index === 0 && item.draftId.startsWith("local-running-")
                ? {
                    ...item,
                    status: "failed",
                    updatedAt: new Date().toISOString(),
                    errorMessage: event.error
                  }
                : item
            )
          );
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reply stream was unavailable";
      setErrorMessage(message);
      setDraftHistory((current) =>
        current.map((item, index) =>
          index === 0 && item.draftId.startsWith("local-running-")
            ? {
                ...item,
                status: "failed",
                updatedAt: new Date().toISOString(),
                errorMessage: message
              }
            : item
        )
      );
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
                  The server asks `gemini` for a reply plan, runs `x-media-analyst search facets` with those queries, then asks `gemini` again to choose the best candidate and draft the final reply. `Compose all goals` reuses the same subject context once, then fans out across goals up to this concurrency cap.
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
              {results.map((item) => (
                <article key={`${item.request.goal}-${item.reply.text}`} className="terminal-window">
                  <div className="window-bar">
                    <div className="section-kicker">{item.request.goal}</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="tt-chip">{item.provider}</span>
                      <span className="tt-chip">{item.search.resultCount} candidates</span>
                    </div>
                  </div>
                  <div className="panel-body space-y-4">
                    <div className="tt-subpanel">
                      <p className="text-base leading-7 text-slate-100">{item.reply.text}</p>
                    </div>

                    <PostToXButton
                      mode="reply"
                      text={item.reply.text}
                      mediaFilePath={item.selectedMedia?.videoFilePath ?? item.selectedMedia?.localFilePath ?? null}
                      replyToTweetUrl={item.subject.tweetUrl}
                      draftTitle={`${item.request.goal} reply`}
                      scratchpadText={item.reply.postingNotes ?? item.reply.whyThisReplyWorks}
                    />

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
                      {item.search.queries.map((query) => (
                        <span key={`${item.request.goal}-${query}`} className="tt-chip">
                          {query}
                        </span>
                      ))}
                    </div>

                    {item.selectedMedia ? (
                      <>
                        <div className="tt-media-frame aspect-video">
                          <MediaPreview
                            alt={item.selectedMedia.tweetText ?? `${item.request.goal} reply media`}
                            imageUrl={item.selectedMedia.displayUrl}
                            videoFilePath={item.selectedMedia.videoFilePath}
                          />
                        </div>
                        <div className="tt-subpanel-soft">
                          <div className="tt-data-label">Selected Media</div>
                          <p className="mt-2 text-sm leading-6 text-slate-200">
                            {item.selectedMedia.tweetText ?? item.selectedMedia.analysis?.sceneDescription ?? "No candidate text"}
                          </p>
                          <p className="mt-3 text-sm leading-6 text-slate-200">{item.reply.mediaSelectionReason}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="tt-chip">
                            {item.selectedMedia.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                          </span>
                          <span className="tt-chip">{item.selectedMedia.authorUsername ?? "unknown author"}</span>
                          {item.selectedMedia.analysis?.primaryEmotion ? (
                            <span className="tt-chip">{item.selectedMedia.analysis.primaryEmotion}</span>
                          ) : null}
                          {item.selectedMedia.analysis?.conveys ? (
                            <span className="tt-chip">{item.selectedMedia.analysis.conveys}</span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {item.selectedMedia.usageId ? (
                            <Link href={`/usage/${item.selectedMedia.usageId}`} className="tt-link">
                              <span>Open source usage</span>
                            </Link>
                          ) : null}
                          {getPreferredXStatusUrl(item.selectedMedia.tweetUrl) ? (
                            <a
                              href={getPreferredXStatusUrl(item.selectedMedia.tweetUrl) as string}
                              target="_blank"
                              rel="noreferrer"
                              className="tt-link"
                            >
                              <span>Open source tweet</span>
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="tt-subpanel">
                        <p className="text-sm leading-7 text-slate-200">No strong media match was selected. This option is text-only.</p>
                      </div>
                    )}

                    {item.reply.postingNotes ? (
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Posting Notes</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.reply.postingNotes}</p>
                      </div>
                    ) : null}

                    {item.search.warning ? <div className="tt-chip tt-chip-danger">{item.search.warning}</div> : null}

                    {item.alternativeMedia.length > 0 ? (
                      <details className="tt-subpanel-soft">
                        <summary className="cursor-pointer list-none font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-cyan">
                          Alternatives ({item.alternativeMedia.length})
                        </summary>
                        <div className="tt-alternatives-list">
                          {item.alternativeMedia.map((candidate) => (
                            <div key={candidate.candidateId} className="tt-alternative-card">
                              <div className="tt-media-frame mb-3 aspect-video">
                                <MediaPreview
                                  alt={candidate.tweetText ?? "alternate reply media"}
                                  imageUrl={candidate.displayUrl}
                                  videoFilePath={candidate.videoFilePath}
                                />
                              </div>
                              <div className="mb-2 flex flex-wrap gap-2">
                                <span className="tt-chip">
                                  {candidate.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                                </span>
                                <span className="tt-chip">{candidate.authorUsername ?? "unknown"}</span>
                                <span className="tt-chip">{candidate.combinedScore.toFixed(2)}</span>
                              </div>
                              <p className="text-sm leading-6 text-slate-200">
                                {candidate.analysis?.sceneDescription ?? candidate.tweetText ?? "No description"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
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
                    {draft.errorMessage ? <p className="mt-2 text-sm leading-6 text-rose-300">{draft.errorMessage}</p> : null}
                    {draft.outputs.map((output, index) => (
                      <div key={`${draft.draftId}-${index}`} className="mt-3 border border-white/10 bg-black/10 p-3">
                        <div className="mb-2 flex flex-wrap gap-2">
                          {output.goal ? <span className="tt-chip">{output.goal}</span> : null}
                          {output.selectedMediaSourceType ? <span className="tt-chip">{output.selectedMediaSourceType}</span> : null}
                        </div>
                        <p className="text-sm leading-7 text-slate-100">{output.text}</p>
                        {output.mediaSelectionReason ? <p className="mt-2 text-sm leading-6 text-slate-300">{output.mediaSelectionReason}</p> : null}
                        <div className="mt-3">
                          <PostToXButton
                            mode="reply"
                            text={output.text}
                            mediaFilePath={output.selectedMediaVideoFilePath ?? output.selectedMediaLocalFilePath ?? null}
                            replyToTweetUrl={props.subject.tweetUrl}
                            draftTitle={output.goal ? `${output.goal} reply` : "reply draft"}
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
