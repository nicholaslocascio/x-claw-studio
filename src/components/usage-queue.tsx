"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState, useEffect } from "react";
import { AnalyzeUsageButton } from "@/src/components/analyze-usage-button";
import { AssetStarButton } from "@/src/components/asset-star-button";
import { MediaPreview } from "@/src/components/media-preview";
import { ReplyComposer } from "@/src/components/reply-composer";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { TweetUsageRecord } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function renderField(value: string | null): string {
  return value ?? "Pending";
}

function getUsageTimestampMs(usage: TweetUsageRecord): number {
  const timestamp = usage.tweet.createdAt ?? usage.tweet.extraction.extractedAt ?? null;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareUsages(
  left: TweetUsageRecord,
  right: TweetUsageRecord,
  sortOrder: "newest" | "duplicates" | "hotness"
): number {
  if (sortOrder === "duplicates" && left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
    return right.duplicateGroupUsageCount - left.duplicateGroupUsageCount;
  }

  if (sortOrder === "hotness" && left.hotnessScore !== right.hotnessScore) {
    return right.hotnessScore - left.hotnessScore;
  }

  if (getUsageTimestampMs(left) !== getUsageTimestampMs(right)) {
    return getUsageTimestampMs(right) - getUsageTimestampMs(left);
  }

  if (left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
    return right.duplicateGroupUsageCount - left.duplicateGroupUsageCount;
  }

  if (left.hotnessScore !== right.hotnessScore) {
    return right.hotnessScore - left.hotnessScore;
  }

  return left.usageId.localeCompare(right.usageId);
}

export function UsageQueue(props: {
  usages: TweetUsageRecord[];
  initialMatchFilter?: "all" | "matched" | "phash" | "starred" | "starred_or_duplicates";
  sectionLabel?: string;
  sectionTitle?: string;
  compact?: boolean;
  initialHideDuplicateAssets?: boolean;
}) {
  const [matchFilter, setMatchFilter] = useState<"all" | "matched" | "phash" | "starred" | "starred_or_duplicates">(props.initialMatchFilter ?? "all");
  const [viewMode, setViewMode] = useState<"summary" | "detail">("detail");
  const [columnsPerRow, setColumnsPerRow] = useState(props.compact ? 3 : 3);
  const [expandedUsageIds, setExpandedUsageIds] = useState<string[]>([]);
  const [hideDuplicateAssets, setHideDuplicateAssets] = useState(props.initialHideDuplicateAssets ?? true);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "duplicates" | "hotness">("newest");
  const [openComposerUsageId, setOpenComposerUsageId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const openComposerRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(
    () => ({
      all: props.usages.length,
      matched: props.usages.filter((usage) => usage.mediaAssetUsageCount > 1 || usage.phashMatchCount > 0).length,
      phash: props.usages.filter((usage) => usage.phashMatchCount > 0).length,
      starred: props.usages.filter((usage) => usage.mediaAssetStarred).length,
      starred_or_duplicates: props.usages.filter((usage) => usage.mediaAssetStarred || usage.mediaAssetUsageCount > 1 || usage.phashMatchCount > 0).length
    }),
    [props.usages]
  );

  const visibleUsages = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const filtered = props.usages.filter((usage) => {
      if (matchFilter === "matched") {
        if (!(usage.mediaAssetUsageCount > 1 || usage.phashMatchCount > 0)) {
          return false;
        }
      }

      if (matchFilter === "phash" && usage.phashMatchCount === 0) {
        return false;
      }

      if (matchFilter === "starred" && !usage.mediaAssetStarred) {
        return false;
      }

      if (matchFilter === "starred_or_duplicates" && !(usage.mediaAssetStarred || usage.mediaAssetUsageCount > 1 || usage.phashMatchCount > 0)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        usage.tweet.authorUsername,
        usage.tweet.text,
        usage.analysis.status,
        usage.analysis.caption_brief,
        usage.analysis.scene_description
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    const sorted = [...filtered].sort((left, right) => compareUsages(left, right, sortOrder));

    if (!hideDuplicateAssets) {
      return sorted;
    }

    const dedupedByGroup = new Map<string, TweetUsageRecord>();
    for (const usage of sorted) {
      const duplicateKey = usage.duplicateGroupId ?? usage.mediaAssetId ?? usage.usageId;
      if (!dedupedByGroup.has(duplicateKey)) {
        dedupedByGroup.set(duplicateKey, usage);
      }
    }

    return Array.from(dedupedByGroup.values());
  }, [deferredQuery, hideDuplicateAssets, matchFilter, props.usages, sortOrder]);

  function isExpanded(usageId: string): boolean {
    return expandedUsageIds.includes(usageId);
  }

  function toggleExpanded(usageId: string): void {
    if (expandedUsageIds.includes(usageId)) {
      setExpandedUsageIds((current) => current.filter((id) => id !== usageId));
      setOpenComposerUsageId((openId) => (openId === usageId ? null : openId));
      return;
    }

    setExpandedUsageIds((current) => [...current, usageId]);
  }

  function expandAll(): void {
    setExpandedUsageIds(visibleUsages.map((usage) => usage.usageId));
  }

  function collapseAll(): void {
    setExpandedUsageIds([]);
    setOpenComposerUsageId(null);
  }

  useEffect(() => {
    if (!openComposerUsageId || !openComposerRef.current) {
      return;
    }

    openComposerRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    const focusTarget = openComposerRef.current.querySelector<HTMLElement>(
      "select, input, textarea, button, a[href]"
    );
    focusTarget?.focus({ preventScroll: true });
  }, [openComposerUsageId]);

  return (
    <section className="relative z-10 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">{props.sectionLabel ?? "Usage Queue"}</div>
            <h2 className="section-title mt-3">{props.sectionTitle ?? "Review media usages without losing analysis context"}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Filter the queue to the slice you need, search by author or tweet text, then expand only the cards worth deeper review.
            </p>
          </div>
          <div className="tt-chip tt-chip-accent">{visibleUsages.length} visible</div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={`tt-link ${matchFilter === "all" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("all")}>
            <span>All {counts.all}</span>
          </button>
          <button type="button" className={`tt-link ${matchFilter === "matched" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("matched")}>
            <span>Matched {counts.matched}</span>
          </button>
          <button type="button" className={`tt-link ${matchFilter === "phash" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("phash")}>
            <span>Similar {counts.phash}</span>
          </button>
          <button type="button" className={`tt-link ${matchFilter === "starred" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("starred")}>
            <span>Starred {counts.starred}</span>
          </button>
          <button
            type="button"
            className={`tt-link ${matchFilter === "starred_or_duplicates" ? "tt-chip-accent" : ""}`}
            onClick={() => setMatchFilter("starred_or_duplicates")}
          >
            <span>Starred or duplicates {counts.starred_or_duplicates}</span>
          </button>
        </div>

        <div className="usage-toolbar mb-6">
          <div className="usage-toolbar-main">
            <label className="tt-field md:col-span-2">
              <span className="tt-field-label">Search</span>
              <input
                type="text"
                className="tt-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by author, tweet text, or analysis text"
              />
            </label>

            <label className="tt-field">
              <span className="tt-field-label">View</span>
              <select
                className="tt-select"
                value={viewMode}
                onChange={(event) => setViewMode(event.target.value as "summary" | "detail")}
              >
                <option value="detail">Detail</option>
                <option value="summary">Summary</option>
              </select>
            </label>

            <label className="tt-field">
              <span className="tt-field-label">Sort</span>
              <select
                className="tt-select"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as "newest" | "duplicates" | "hotness")}
              >
                <option value="newest">Newest</option>
                <option value="duplicates">Most duplicates</option>
                <option value="hotness">Hotness</option>
              </select>
            </label>

            <label className="tt-field">
              <span className="tt-field-label">Per Row: {columnsPerRow}</span>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={columnsPerRow}
                onChange={(event) => setColumnsPerRow(Number(event.target.value))}
                className="accent-cyan"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="tt-field">
              <span className="tt-field-label">Duplicates</span>
              <div className="tt-subpanel-soft flex min-h-full items-center gap-3">
                <input
                  type="checkbox"
                  checked={hideDuplicateAssets}
                  onChange={(event) => setHideDuplicateAssets(event.target.checked)}
                  className="tt-checkbox"
                />
                <span className="text-sm leading-6 text-slate-200">Hide repeated items so one asset appears once in the queue.</span>
              </div>
            </label>

            <div className="tt-field">
              <span className="tt-field-label">Expansion</span>
              <div className="tt-subpanel-soft flex flex-wrap items-center gap-3">
                <button type="button" className="tt-link" onClick={expandAll}>
                  <span>Expand all</span>
                </button>
                <button type="button" className="tt-link" onClick={collapseAll}>
                  <span>Collapse all</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="usage-grid"
          style={{ ["--usage-grid-columns" as string]: `repeat(${columnsPerRow}, minmax(0, 1fr))` }}
        >
          {visibleUsages.map(
            ({
              usageId,
              tweet,
              mediaIndex,
              analysis,
              phashMatchCount,
              mediaAssetUsageCount,
              mediaLocalFilePath,
              mediaPlayableFilePath,
              mediaAssetId,
              mediaAssetStarred,
              duplicateGroupUsageCount,
              hotnessScore
            }) => {
              const media = tweet.media[mediaIndex];
              const displayUrl = resolveMediaDisplayUrl({
                localFilePath: mediaLocalFilePath,
                posterUrl: media.posterUrl,
                previewUrl: media.previewUrl,
                sourceUrl: media.sourceUrl
              });
              const tweetUrl = getPreferredXStatusUrl(tweet.tweetUrl);
              const composerPanelId = `usage-reply-composer-${usageId}`;
              const isComposerOpen = openComposerUsageId === usageId;

              return (
                <article key={usageId} className="neon-card min-w-0 p-3 sm:p-3.5">
                  <div className={`tt-media-frame ${props.compact ? "aspect-[6/5]" : "aspect-square"}`}>
                    <MediaPreview
                      alt={tweet.text ?? "tweet media"}
                      imageUrl={displayUrl}
                      videoFilePath={mediaPlayableFilePath}
                    />
                    {mediaAssetId ? (
                      <div className="absolute right-1.5 top-1.5 z-10">
                        <AssetStarButton
                          assetId={mediaAssetId}
                          starred={mediaAssetStarred}
                          className={mediaAssetStarred ? "tt-icon-button tt-icon-button-secondary bg-[#121826]/90" : "tt-icon-button bg-[#121826]/90"}
                          wrapperClassName="flex items-center"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className={`${props.compact ? "mt-1.5" : "mt-2"} space-y-1.5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`status-dot ${analysis.status === "complete" ? "bg-accent" : "bg-orange"}`} />
                          <h3 className="truncate text-base font-semibold text-slate-100">
                            {tweet.authorUsername ? `@${tweet.authorUsername}` : "Unknown author"}
                          </h3>
                        </div>
                        <div className="mt-2 text-sm text-slate-400">{formatDate(tweet.createdAt)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className="tt-icon-button"
                          aria-label={isExpanded(usageId) ? "Collapse details" : "Expand details"}
                          title={isExpanded(usageId) ? "Collapse details" : "Expand details"}
                          onClick={() => toggleExpanded(usageId)}
                        >
                          <span aria-hidden="true">{isExpanded(usageId) ? "−" : "+"}</span>
                          <span className="sr-only">{isExpanded(usageId) ? "Collapse details" : "Expand details"}</span>
                        </button>
                        <Link
                          href={`/usage/${usageId}`}
                          className="tt-icon-button tt-icon-button-accent"
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open detail"
                          title="Open detail"
                        >
                          <span aria-hidden="true">↗</span>
                          <span className="sr-only">Open detail</span>
                        </Link>
                      </div>
                    </div>

                    <div className="usage-card-meta">
                      <span className="tt-chip">{media.mediaKind}</span>
                      <span className="tt-chip">{analysis.status}</span>
                      <span className={`tt-chip ${duplicateGroupUsageCount > 1 ? "tt-chip-accent" : ""}`}>
                        duplicates {duplicateGroupUsageCount}
                      </span>
                      <span className={`tt-chip ${hotnessScore >= 4 ? "tt-chip-accent" : ""}`}>
                        hot {hotnessScore.toFixed(2)}
                      </span>
                      <span className={`tt-chip ${phashMatchCount > 0 ? "tt-chip-accent" : ""}`}>
                        similar {phashMatchCount}
                      </span>
                      <span className={`tt-chip ${mediaAssetStarred ? "tt-chip-accent" : ""}`}>
                        {mediaAssetStarred ? "starred" : "not starred"}
                      </span>
                    </div>

                    {!isExpanded(usageId) ? (
                      <p className="usage-preview-text">{tweet.text || analysis.caption_brief || "No tweet text captured for this usage."}</p>
                    ) : null}

                    {isExpanded(usageId) ? (
                      <div className="border-t border-border pt-2.5">
                        <p className="text-sm leading-6 text-slate-200">{tweet.text}</p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <span className="tt-chip">likes {tweet.metrics.likes ?? "-"}</span>
                          <span className="tt-chip">reposts {tweet.metrics.reposts ?? "-"}</span>
                          <span className="tt-chip">views {tweet.metrics.views ?? "-"}</span>
                          <span className="tt-chip">{analysis.status}</span>
                          <span className={`tt-chip ${hotnessScore >= 4 ? "tt-chip-accent" : ""}`}>hotness {hotnessScore.toFixed(2)}</span>
                          <span className={`tt-chip ${phashMatchCount > 0 ? "tt-chip-accent" : ""}`}>
                            similar matches {phashMatchCount}
                          </span>
                          <span className="tt-chip">asset usages {mediaAssetUsageCount}</span>
                        </div>

                        <div className="mt-2.5">
                          <div className="flex flex-wrap gap-2">
                            <AnalyzeUsageButton
                              tweetId={tweet.tweetId}
                              mediaIndex={mediaIndex}
                              className="tt-button"
                            />
                            {tweet.tweetId ? (
                              <button
                                type="button"
                                className="tt-link"
                                aria-controls={composerPanelId}
                                aria-expanded={isComposerOpen}
                                onClick={() => {
                                  setExpandedUsageIds((current) => (current.includes(usageId) ? current : [...current, usageId]));
                                  setOpenComposerUsageId((current) => (current === usageId ? null : usageId));
                                }}
                              >
                                <span>{isComposerOpen ? "Hide response generator" : "Generate response"}</span>
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {viewMode === "detail" ? (
                          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Conveys</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.conveys ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.conveys)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">User Intent</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.user_intent ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.user_intent)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Rhetorical Role</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.rhetorical_role ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.rhetorical_role)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Metaphor</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.metaphor ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.metaphor)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Text Media Relationship</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.text_media_relationship ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.text_media_relationship)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Why It Works</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.why_it_works ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.why_it_works)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="tt-subpanel mt-2.5 text-sm leading-6 text-slate-300">
                            {analysis.caption_brief ?? analysis.scene_description ?? "Open detail view for full analysis and similarity match context."}
                          </div>
                        )}

                        {isComposerOpen && tweet.tweetId ? (
                          <div
                            id={composerPanelId}
                            ref={openComposerRef}
                            className="mt-4 scroll-mt-24 border-t border-white/10 pt-4"
                          >
                            <ReplyComposer
                              usageId={usageId}
                              tweetId={tweet.tweetId}
                              subject={{
                                usageId,
                                tweetId: tweet.tweetId,
                                tweetUrl,
                                authorUsername: tweet.authorUsername,
                                createdAt: tweet.createdAt,
                                tweetText: tweet.text,
                                mediaKind: media.mediaKind,
                                analysis: {
                                  captionBrief: analysis.caption_brief,
                                  sceneDescription: analysis.scene_description,
                                  primaryEmotion: analysis.primary_emotion,
                                  conveys: analysis.conveys,
                                  userIntent: analysis.user_intent,
                                  rhetoricalRole: analysis.rhetorical_role,
                                  textMediaRelationship: analysis.text_media_relationship,
                                  culturalReference: analysis.cultural_reference,
                                  analogyTarget: analysis.analogy_target,
                                  searchKeywords: analysis.search_keywords
                                }
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            }
          )}
        </div>
      </div>
    </section>
  );
}
