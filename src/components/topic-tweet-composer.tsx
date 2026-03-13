"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { MediaPreview } from "@/src/components/media-preview";
import { PostToXButton } from "@/src/components/post-to-x-button";
import { ReplyComposer } from "@/src/components/reply-composer";
import type { GeneratedDraftRecord } from "@/src/lib/generated-drafts";
import { readNdjsonStream } from "@/src/lib/ndjson-stream";
import type { GroundedTopicNews, TopicClusterRecord } from "@/src/lib/types";
import type {
  TopicPostBatchResult,
  TopicPostGoal,
  TopicPostMode,
  TopicPostProgressEvent,
  TopicPostResult
} from "@/src/lib/topic-composer";

const GOAL_OPTIONS: Array<{ value: TopicPostGoal; label: string }> = [
  { value: "insight", label: "Add insight" },
  { value: "consequence", label: "Show consequence" },
  { value: "contrarian", label: "Go contrarian" },
  { value: "product", label: "Product lens" },
  { value: "signal_boost", label: "Signal boost" }
];

type TopicComposeMode = "new_post" | "reply_to_example";

function isBatchResult(value: TopicPostResult | TopicPostBatchResult): value is TopicPostBatchResult {
  return "mode" in value && value.mode === "all_goals";
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function TopicTweetComposer(props: {
  topics: Array<TopicClusterRecord & { groundedNews?: GroundedTopicNews | null }>;
  initialTopicId?: string;
  initialComposeMode?: TopicComposeMode;
  initialReplyTweetId?: string;
  autoComposeOnMount?: boolean;
}) {
  const maxGoalConcurrency = GOAL_OPTIONS.length;
  const initialTopicId = props.topics.some((topic) => topic.topicId === props.initialTopicId)
    ? props.initialTopicId
    : props.topics[0]?.topicId ?? "";
  const [topicId, setTopicId] = useState(initialTopicId);
  const [composeMode, setComposeMode] = useState<TopicComposeMode>(props.initialComposeMode ?? "new_post");
  const [goal, setGoal] = useState<TopicPostGoal>("insight");
  const [maxConcurrency, setMaxConcurrency] = useState(Math.min(2, maxGoalConcurrency));
  const [toneHint, setToneHint] = useState("sharp and specific");
  const [angleHint, setAngleHint] = useState("");
  const [constraints, setConstraints] = useState("keep it punchy and postable");
  const [results, setResults] = useState<TopicPostResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progressEvents, setProgressEvents] = useState<TopicPostProgressEvent[]>([]);
  const [runMode, setRunMode] = useState<TopicPostMode>("single");
  const [draftHistory, setDraftHistory] = useState<GeneratedDraftRecord[]>([]);
  const autoComposeKeyRef = useRef<string | null>(null);

  const selectedTopic = useMemo(() => props.topics.find((topic) => topic.topicId === topicId) ?? null, [props.topics, topicId]);
  const replyCandidates = useMemo(
    () => selectedTopic?.representativeTweets.filter((tweet) => tweet.tweetId) ?? [],
    [selectedTopic]
  );
  const [selectedReplyTweetId, setSelectedReplyTweetId] = useState<string>(props.initialReplyTweetId ?? "");
  const effectiveReplyTweetId = useMemo(() => {
    if (replyCandidates.some((tweet) => tweet.tweetId === selectedReplyTweetId)) {
      return selectedReplyTweetId;
    }

    if (props.initialReplyTweetId && replyCandidates.some((tweet) => tweet.tweetId === props.initialReplyTweetId)) {
      return props.initialReplyTweetId;
    }

    return replyCandidates[0]?.tweetId ?? "";
  }, [props.initialReplyTweetId, replyCandidates, selectedReplyTweetId]);
  const selectedReplyTweet = replyCandidates.find((tweet) => tweet.tweetId === effectiveReplyTweetId) ?? replyCandidates[0] ?? null;
  const latestProgress = progressEvents.at(-1) ?? null;
  const completedGoals = latestProgress?.completedGoals ?? 0;
  const totalGoals = latestProgress?.totalGoals ?? (runMode === "all_goals" ? GOAL_OPTIONS.length : 1);
  const runningGoals = latestProgress?.runningGoals ?? (runMode === "all_goals" && isRunning ? 1 : 0);
  const queuedGoals = latestProgress?.queuedGoals ?? Math.max(0, totalGoals - completedGoals - runningGoals);

  async function loadDraftHistory(): Promise<void> {
    const params = new URLSearchParams({
      kind: "topic_post",
      topicId: topicId ?? "",
      limit: "12"
    });
    const response = await fetch(`/api/generated-drafts?${params.toString()}`);
    if (!response.ok) {
      return;
    }

    const body = await response.json();
    setDraftHistory(body.drafts ?? []);
  }

  async function compose(mode: TopicPostMode): Promise<void> {
    setIsRunning(true);
    setErrorMessage(null);
    setResults([]);
    setProgressEvents([]);
    setRunMode(mode);
    setDraftHistory((current) => [
      {
        draftId: `local-running-${Date.now()}`,
        kind: "topic_post",
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageId: null,
        tweetId: null,
        topicId: topicId ?? null,
        assetId: null,
        requestGoal: goal,
        requestMode: mode,
        progressStage: "starting",
        progressMessage: "Starting topic composition",
        progressDetail: null,
        errorMessage: null,
        outputs: []
      },
      ...current.filter((item) => !item.draftId.startsWith("local-running-"))
    ]);

    const response = await fetch("/api/topics/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId,
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
      const message = body.error || "Topic composition failed";
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
      setIsRunning(false);
      await loadDraftHistory();
      return;
    }

    try {
      await readNdjsonStream<
        | ({ type: "progress" } & TopicPostProgressEvent)
        | { type: "result"; result: TopicPostResult | TopicPostBatchResult }
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
      const message = error instanceof Error ? error.message : "Topic composition stream was unavailable";
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

  const syncInitialTopicId = useEffectEvent(() => {
    if (!initialTopicId || initialTopicId === topicId) {
      return;
    }

    setTopicId(initialTopicId);
  });

  const runAutoCompose = useEffectEvent(() => {
    const key = `${initialTopicId}:single`;
    if (autoComposeKeyRef.current === key) {
      return;
    }

    autoComposeKeyRef.current = key;
    void compose("single");
  });

  useEffect(() => {
    syncInitialTopicId();
  }, [initialTopicId, topicId]);

  useEffect(() => {
    if (!props.autoComposeOnMount || !initialTopicId || composeMode !== "new_post") {
      return;
    }

    runAutoCompose();
  }, [composeMode, initialTopicId, props.autoComposeOnMount]);

  useEffect(() => {
    if (composeMode !== "new_post" || !topicId) {
      return;
    }

    let isCancelled = false;

    async function run(): Promise<void> {
      const params = new URLSearchParams({
        kind: "topic_post",
        topicId: topicId ?? "",
        limit: "12"
      });
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
  }, [composeMode, topicId]);

  return (
    <section id="topic-composer" className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Topic Composer</div>
            <h2 className="section-title mt-3">Draft a new tweet from a topic and pair it with local media</h2>
          </div>
          {selectedTopic ? <div className="tt-chip tt-chip-accent">{selectedTopic.label}</div> : null}
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
                <span className="tt-field-label">Topic</span>
                <select value={topicId} onChange={(event) => setTopicId(event.target.value)} className="tt-select">
                  {props.topics.map((topic) => (
                    <option key={topic.topicId} value={topic.topicId}>
                      {topic.label} · hot {topic.hotnessScore.toFixed(1)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Compose Mode</span>
                <select
                  value={composeMode}
                  onChange={(event) => setComposeMode(event.target.value as TopicComposeMode)}
                  className="tt-select"
                >
                  <option value="new_post">Write a new tweet</option>
                  <option value="reply_to_example">Reply to a linked example</option>
                </select>
              </label>

              {composeMode === "reply_to_example" ? (
                <label className="tt-field">
                  <span className="tt-field-label">Example Tweet</span>
                  <select
                    value={selectedReplyTweet?.tweetId ?? ""}
                    onChange={(event) => setSelectedReplyTweetId(event.target.value)}
                    className="tt-select"
                    disabled={replyCandidates.length === 0}
                  >
                    {replyCandidates.length > 0 ? (
                      replyCandidates.map((tweet) => (
                        <option key={tweet.tweetKey} value={tweet.tweetId ?? ""}>
                          @{tweet.authorUsername ?? "unknown"} · {(tweet.text ?? "No tweet text").slice(0, 90)}
                        </option>
                      ))
                    ) : (
                      <option value="">No replyable example tweets</option>
                    )}
                  </select>
                </label>
              ) : null}

              {composeMode === "new_post" ? (
                <>
              <label className="tt-field">
                <span className="tt-field-label">Response Type</span>
                <select value={goal} onChange={(event) => setGoal(event.target.value as TopicPostGoal)} className="tt-select">
                  {GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

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
                  placeholder="Take the second-order angle, make it more contrarian, focus on product not company..."
                />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">Constraints</span>
                <input value={constraints} onChange={(event) => setConstraints(event.target.value)} className="tt-input" />
              </label>

              <label className="tt-field">
                <span className="tt-field-label">All-Types Concurrency</span>
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
                </>
              ) : null}

              <div className="tt-subpanel-soft">
                <p className="tt-copy">
                  {composeMode === "new_post"
                    ? "The server plans a topic angle, searches the local media corpus, then drafts one or several tweet and media pairings so you can compare directions. `Draft all types` loads the topic once, then fans out across goals up to this concurrency cap."
                    : "Pick one of the topic's representative tweets and reuse the existing reply composer directly from this view."}
                </p>
              </div>

              {composeMode === "new_post" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button className="tt-button" onClick={() => void compose("single")} disabled={isRunning || !topicId}>
                    <span>{isRunning && runMode === "single" ? "Composing..." : "Draft tweet"}</span>
                  </button>
                  <button className="tt-button" onClick={() => void compose("all_goals")} disabled={isRunning || !topicId}>
                    <span>{isRunning && runMode === "all_goals" ? "Composing all..." : "Draft all types"}</span>
                  </button>
                  {latestProgress ? <span className="tt-chip tt-chip-accent">{latestProgress.message}</span> : null}
                  {errorMessage ? <span className="tt-chip tt-chip-danger">{errorMessage}</span> : null}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {selectedReplyTweet ? (
                    <span className="tt-chip tt-chip-accent">replying to @{selectedReplyTweet.authorUsername ?? "unknown"}</span>
                  ) : (
                    <span className="tt-chip tt-chip-danger">No example tweets available to reply to</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Topic Context</div>
              <div className="tt-chip">{selectedTopic?.tweetCount ?? 0} tweets</div>
            </div>
            <div className="panel-body space-y-4">
              {selectedTopic ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <span className="tt-chip">hot {selectedTopic.hotnessScore.toFixed(1)}</span>
                    <span className="tt-chip">{selectedTopic.recentTweetCount24h} in 24h</span>
                    <span className="tt-chip">{selectedTopic.isStale ? "stale" : "fresh"}</span>
                  </div>
                  <div className="tt-subpanel">
                    <div className="tt-data-label">Suggested Angles</div>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-200">
                      {selectedTopic.suggestedAngles.slice(0, 3).map((angle) => (
                        <li key={angle}>{angle}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="tt-subpanel-soft">
                    <div className="tt-data-label">Representative Tweets</div>
                    <div className="mt-2 space-y-2">
                      {selectedTopic.representativeTweets.slice(0, 2).map((tweet) => (
                        <div key={tweet.tweetKey} className="text-sm leading-6 text-slate-200">
                          <div className="text-xs uppercase tracking-[0.12em] text-cyan">
                            @{tweet.authorUsername ?? "unknown"} · {formatDate(tweet.createdAt)}
                          </div>
                          <p className="mt-1">{tweet.text ?? "No tweet text"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedTopic.groundedNews ? (
                    <div className="tt-subpanel-soft">
                      <div className="tt-data-label">Grounded News</div>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{selectedTopic.groundedNews.summary}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="tt-placeholder">No topic selected.</div>
              )}
            </div>
          </div>
        </div>

        {composeMode === "new_post" && isRunning ? (
          <div className="mt-6 terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Working</div>
              <div className="tt-chip tt-chip-accent">{latestProgress?.stage ?? "running"}</div>
            </div>
            <div className="panel-body grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Current Step</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{latestProgress?.message ?? "Starting topic compose pipeline"}</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {runMode === "all_goals"
                    ? `${runningGoals} running, ${queuedGoals} queued, ${completedGoals} of ${totalGoals} completed`
                    : "Running selected type"}
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
                  <div key={`${event.goal ?? "topic"}-${event.stage}-${index}`} className="tt-subpanel-soft">
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

        {composeMode === "reply_to_example" && selectedReplyTweet?.tweetId ? (
          <div className="mt-6">
            <ReplyComposer
              tweetId={selectedReplyTweet.tweetId}
              subject={{
                usageId: null,
                tweetId: selectedReplyTweet.tweetId,
                tweetUrl: null,
                authorUsername: selectedReplyTweet.authorUsername,
                createdAt: selectedReplyTweet.createdAt,
                tweetText: selectedReplyTweet.text,
                mediaKind: "none",
                analysis: {
                  captionBrief: null,
                  sceneDescription: null,
                  primaryEmotion: null,
                  conveys: null,
                  userIntent: null,
                  rhetoricalRole: null,
                  textMediaRelationship: null,
                  culturalReference: null,
                  analogyTarget: null,
                  searchKeywords: []
                }
              }}
            />
          </div>
        ) : null}

        {composeMode === "new_post" && results.length > 0 ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="section-kicker">Draft Options</div>
                <h2 className="section-title mt-3">
                  {results.length === 1 ? "Single topic tweet/media pairing" : `${results.length} topic tweet/media pairings to compare`}
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
                <article key={`${item.request.goal}-${item.tweet.text}`} className="terminal-window">
                  <div className="window-bar">
                    <div className="section-kicker">{item.request.goal}</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="tt-chip">{item.provider}</span>
                      <span className="tt-chip">{item.search.resultCount} candidates</span>
                    </div>
                  </div>
                  <div className="panel-body space-y-4">
                    <div className="tt-subpanel">
                      <p className="text-base leading-8 text-slate-100">{item.tweet.text}</p>
                    </div>

                    <PostToXButton
                      mode="new_post"
                      text={item.tweet.text}
                      mediaFilePath={item.selectedMedia?.videoFilePath ?? item.selectedMedia?.localFilePath ?? null}
                      draftTitle={selectedTopic ? `${selectedTopic.label} draft` : "topic draft"}
                      scratchpadText={item.tweet.postingNotes ?? item.tweet.whyThisTweetWorks}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Angle</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.plan.angle}</p>
                      </div>
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Why It Works</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.tweet.whyThisTweetWorks}</p>
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
                        {item.selectedMedia.displayUrl ? (
                          <div className="tt-media-frame aspect-video">
                            <MediaPreview
                              alt={item.selectedMedia.tweetText ?? `${item.request.goal} topic media`}
                              imageUrl={item.selectedMedia.displayUrl}
                              videoFilePath={item.selectedMedia.videoFilePath}
                            />
                          </div>
                        ) : null}
                        <div className="tt-subpanel-soft">
                          <div className="tt-data-label">Selected Media</div>
                          <p className="mt-2 text-sm leading-6 text-slate-200">
                            {item.selectedMedia.tweetText ?? item.selectedMedia.analysis?.sceneDescription ?? "No candidate text"}
                          </p>
                          <p className="mt-3 text-sm leading-6 text-slate-200">{item.tweet.mediaSelectionReason}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="tt-chip">
                            {item.selectedMedia.sourceType === "meme_template" ? "imported meme template" : "captured media"}
                          </span>
                          {item.selectedMedia.sourceLabel ? <span className="tt-chip">{item.selectedMedia.sourceLabel}</span> : null}
                          {item.selectedMedia.analysis?.primaryEmotion ? (
                            <span className="tt-chip">{item.selectedMedia.analysis.primaryEmotion}</span>
                          ) : null}
                          {item.selectedMedia.analysis?.conveys ? (
                            <span className="tt-chip">{item.selectedMedia.analysis.conveys}</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="tt-subpanel">
                        <p className="text-sm leading-7 text-slate-200">No strong media match was selected. This option is text-only.</p>
                      </div>
                    )}

                    {item.tweet.postingNotes ? (
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Posting Notes</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{item.tweet.postingNotes}</p>
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

        {composeMode === "new_post" ? (
          <div className="mt-6 terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Recent Topic Drafts</div>
              <a href="/drafts" className="tt-link">
                <span>Open all drafts</span>
              </a>
            </div>
            <div className="panel-body">
              {draftHistory.length === 0 ? (
                <div className="tt-placeholder">No saved topic drafts yet.</div>
              ) : (
                <div className="grid gap-3">
                  {draftHistory.map((draft) => (
                    <div key={draft.draftId} className="tt-subpanel-soft">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`tt-chip ${draft.status === "running" ? "tt-chip-accent" : draft.status === "failed" ? "tt-chip-danger" : ""}`}>
                          {draft.status}
                        </span>
                        {draft.requestGoal ? <span className="tt-chip">{draft.requestGoal}</span> : null}
                        <span className="tt-chip">{formatDate(draft.updatedAt)}</span>
                      </div>
                      {draft.progressMessage ? <p className="text-sm leading-6 text-slate-300">{draft.progressMessage}</p> : null}
                      {draft.outputs.map((output, index) => (
                        <div key={`${draft.draftId}-${index}`} className="mt-3 border border-white/10 bg-black/10 p-3">
                          <p className="text-sm leading-7 text-slate-100">{output.text}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{output.whyThisWorks}</p>
                          <div className="mt-3">
                            <PostToXButton
                              mode="new_post"
                              text={output.text}
                              mediaFilePath={output.selectedMediaVideoFilePath ?? output.selectedMediaLocalFilePath ?? null}
                              draftTitle={selectedTopic ? `${selectedTopic.label} draft` : "topic draft"}
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
        ) : null}
      </div>
    </section>
  );
}
