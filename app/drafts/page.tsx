import Link from "next/link";
import { DraftOutputCard } from "@/src/components/draft-output-card";
import { MediaPreview } from "@/src/components/media-preview";
import type { UsageAnalysis } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";
import { listGeneratedDraftViews } from "@/src/server/generated-drafts";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatKindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

function formatStatusTone(status: string): string {
  if (status === "running") {
    return "tt-chip-accent";
  }

  if (status === "failed") {
    return "tt-chip-danger";
  }

  return "";
}

function buildAnalysisHighlights(analysis: UsageAnalysis | null | undefined): Array<{ label: string; value: string }> {
  if (!analysis || analysis.status !== "complete") {
    return [];
  }

  const pairs: Array<{ label: string; value: string | null | string[] }> = [
    { label: "Caption", value: analysis.caption_brief },
    { label: "Scene", value: analysis.scene_description },
    { label: "Tone", value: analysis.emotional_tone },
    { label: "Conveys", value: analysis.conveys },
    { label: "Role", value: analysis.rhetorical_role },
    { label: "Why It Works", value: analysis.why_it_works },
    { label: "Keywords", value: analysis.search_keywords.slice(0, 6) }
  ];

  return pairs
    .map((pair) => ({
      label: pair.label,
      value: Array.isArray(pair.value) ? pair.value.join(", ") : pair.value ?? ""
    }))
    .filter((pair) => pair.value.trim().length > 0)
    .slice(0, 5);
}

export default function DraftsPage() {
  const drafts = listGeneratedDraftViews({ limit: 100 });

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Drafts</div>
            <div className="type-cursor mt-2 font-[family:var(--font-label)] text-xs uppercase tracking-[0.22em] text-muted">
              &gt; Generated reply and tweet history
            </div>
          </div>
          <div className="window-dots">
            <span className="window-dot bg-orange" />
            <span className="window-dot bg-accent" />
            <span className="window-dot bg-cyan" />
          </div>
        </div>
        <div className="panel-body">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="section-title mt-1">Generated drafts</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                Each draft now shows the source tweet or topic, the asset in play, and the analysis context the composer had when it wrote.
              </p>
            </div>
            <Link href="/" className="tt-link">
              <span>Back to dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="tt-chip tt-chip-accent">{drafts.filter((item) => item.status === "running").length} running</span>
            <span className="tt-chip">{drafts.filter((item) => item.status === "complete").length} complete</span>
            <span className="tt-chip">{drafts.filter((item) => item.status === "failed").length} failed</span>
            <span className="tt-chip">{drafts.length} tracked</span>
          </div>

          <div className="grid gap-5">
            {drafts.map((draft) => {
              const sourceTweetUrl = getPreferredXStatusUrl(draft.sourceTweet?.tweetUrl);
              const sourceMedia = draft.sourceUsage ? draft.sourceUsage.tweet.media[draft.sourceUsage.mediaIndex] : null;
              const analysisHighlights = buildAnalysisHighlights(draft.sourceAssetSummary?.summary ?? draft.sourceUsage?.analysis);

              return (
                <article key={draft.draftId} className="terminal-window overflow-hidden">
                  <div className="window-bar">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="section-kicker">{formatKindLabel(draft.kind)}</span>
                      {draft.requestGoal ? <span className="tt-chip">{draft.requestGoal}</span> : null}
                      {draft.requestMode ? <span className="tt-chip">{draft.requestMode}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`tt-chip ${formatStatusTone(draft.status)}`}>{draft.status}</span>
                      <span className="tt-chip">{formatDate(draft.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="panel-body space-y-5">
                    <div className="flex flex-wrap gap-2">
                      {draft.usageId ? <span className="tt-chip">{draft.usageId}</span> : null}
                      {draft.tweetId ? <span className="tt-chip">{draft.tweetId}</span> : null}
                      {draft.topicId ? <span className="tt-chip">{draft.topicId}</span> : null}
                      {draft.sourceAsset?.assetId ? <span className="tt-chip">{draft.sourceAsset.assetId}</span> : null}
                      {draft.sourceAssetSummary ? <span className="tt-chip">{draft.sourceAssetSummary.completeAnalysisCount} analyses</span> : null}
                    </div>

                    {draft.progressMessage ? (
                      <div className="tt-subpanel-soft">
                        <div className="tt-data-label">Current Status</div>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{draft.progressMessage}</p>
                        {draft.progressDetail ? <p className="mt-2 text-xs uppercase tracking-[0.12em] text-cyan">{draft.progressDetail}</p> : null}
                      </div>
                    ) : null}

                    {draft.errorMessage ? <div className="tt-chip tt-chip-danger">{draft.errorMessage}</div> : null}

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
                      <section className="space-y-4">
                        <div className="tt-subpanel">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="tt-data-label">Source Context</div>
                            {sourceTweetUrl ? (
                              <a href={sourceTweetUrl} target="_blank" rel="noreferrer" className="tt-link">
                                <span>Open original tweet</span>
                              </a>
                            ) : null}
                          </div>

                          {draft.sourceAssetDisplayUrl || draft.sourceAssetVideoFilePath ? (
                            <div className="tt-media-frame mb-4 aspect-video overflow-hidden">
                              <MediaPreview
                                alt={draft.sourceTweet?.text ?? draft.topic?.label ?? "source media"}
                                imageUrl={draft.sourceAssetDisplayUrl}
                                videoFilePath={draft.sourceAssetVideoFilePath}
                              />
                            </div>
                          ) : null}

                          {draft.sourceTweet ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {draft.sourceTweet.authorUsername ? <span className="tt-chip">@{draft.sourceTweet.authorUsername}</span> : null}
                                <span className="tt-chip">{formatDate(draft.sourceTweet.createdAt)}</span>
                                {sourceMedia?.mediaKind ? <span className="tt-chip">{sourceMedia.mediaKind}</span> : null}
                              </div>
                              <p className="text-sm leading-7 text-slate-100">{draft.sourceTweet.text ?? "No tweet text saved."}</p>
                            </div>
                          ) : draft.topic ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <span className="tt-chip">{draft.topic.label}</span>
                                <span className="tt-chip">{draft.topic.tweetCount} tweets</span>
                                <span className="tt-chip">hotness {draft.topic.hotnessScore.toFixed(1)}</span>
                              </div>
                              {draft.topic.representativeTweets[0]?.text ? (
                                <p className="text-sm leading-7 text-slate-100">{draft.topic.representativeTweets[0].text}</p>
                              ) : null}
                              {draft.topic.suggestedAngles.length > 0 ? (
                                <p className="text-sm leading-7 text-slate-300">{draft.topic.suggestedAngles.slice(0, 2).join(" | ")}</p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="tt-placeholder">No source tweet or topic context saved for this draft.</div>
                          )}
                        </div>

                        <div className="tt-subpanel">
                          <div className="tt-data-label">Analysis</div>
                          {analysisHighlights.length > 0 ? (
                            <div className="mt-3 grid gap-3">
                              {analysisHighlights.map((item) => (
                                <div key={`${draft.draftId}-${item.label}`} className="border border-white/10 bg-black/10 p-3">
                                  <div className="text-xs uppercase tracking-[0.14em] text-cyan">{item.label}</div>
                                  <p className="mt-2 text-sm leading-6 text-slate-200">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="tt-placeholder mt-3">No completed analysis attached yet.</div>
                          )}
                        </div>
                      </section>

                      <section className="space-y-4">
                        {draft.outputs.length > 0 ? (
                          <div className="grid gap-4">
                            {draft.outputs.map((output, index) => (
                              <DraftOutputCard
                                key={`${draft.draftId}-${output.goal ?? "default"}-${index}`}
                                draftId={draft.draftId}
                                draftKind={draft.kind}
                                output={output}
                                outputIndex={index}
                                replyTargetUrl={draft.kind === "reply" ? draft.sourceTweet?.tweetUrl ?? null : null}
                                draftTitle={draft.kind === "reply" ? `${output.goal ?? "reply"} reply` : draft.topic?.label ?? draft.sourceAsset?.assetId ?? "draft"}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="tt-placeholder">No completed outputs yet.</div>
                        )}
                      </section>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
