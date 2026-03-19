"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState, useEffect, useTransition } from "react";
import { AnalyzeUsageButton } from "@/src/components/analyze-usage-button";
import { AssetStarButton } from "@/src/components/asset-star-button";
import { MediaPreview } from "@/src/components/media-preview";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { TweetUsageRecord, UsageMatchFilter, UsagePage, UsageSort } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

const SORT_LABELS: Record<UsageSort, string> = {
  newest_desc: "Newest first",
  newest_asc: "Oldest first",
  duplicates_desc: "Most repeated first",
  duplicates_asc: "Least repeated first",
  hotness_desc: "Highest hotness first",
  hotness_asc: "Lowest hotness first"
};

const ReplyComposer = dynamic(
  () => import("@/src/components/reply-composer").then((module) => module.ReplyComposer),
  {
    loading: () => <div className="tt-placeholder mt-4">Loading reply composer...</div>
  }
);

const DEFAULT_REPEAT_MINIMUM = 2;

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
  return value ?? "Not analyzed yet";
}

function formatMediaAssetSyncStatus(status: string): string {
  if (status === "missing") {
    return "Missing";
  }

  if (status === "stale") {
    return "Out of date";
  }

  return "Indexed";
}

function normalizeRepeatMinimum(value: number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REPEAT_MINIMUM;
  }

  return Math.max(DEFAULT_REPEAT_MINIMUM, Math.floor(parsed));
}

function matchesStarredOrRepeatedFilter(usage: TweetUsageRecord, repeatMinimum: number): boolean {
  return usage.mediaAssetStarred || usage.duplicateGroupUsageCount >= repeatMinimum;
}

function matchesRepeatedFilter(usage: TweetUsageRecord, repeatMinimum: number): boolean {
  return usage.duplicateGroupUsageCount >= repeatMinimum;
}

type CopyTarget = "tweet" | "tweet_id" | "media_id" | "path";

export function UsageQueue(props: {
  usages: TweetUsageRecord[];
  initialMatchFilter?: UsageMatchFilter;
  initialRepeatMinimum?: number;
  sectionLabel?: string;
  sectionTitle?: string;
  compact?: boolean;
  initialHideDuplicateAssets?: boolean;
  initialQuery?: string;
  initialSortOrder?: UsageSort;
  pagination?: UsagePage;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRouting, startRouting] = useTransition();
  const [matchFilter, setMatchFilter] = useState<UsageMatchFilter>(props.pagination?.matchFilter ?? props.initialMatchFilter ?? "all");
  const [repeatMinimum, setRepeatMinimum] = useState(
    normalizeRepeatMinimum(props.pagination?.repeatMinimum ?? props.initialRepeatMinimum ?? DEFAULT_REPEAT_MINIMUM)
  );
  const [viewMode, setViewMode] = useState<"summary" | "detail">("detail");
  const [columnsPerRow, setColumnsPerRow] = useState(props.compact ? 3 : 6);
  const [expandedUsageIds, setExpandedUsageIds] = useState<string[]>([]);
  const [hideDuplicateAssets, setHideDuplicateAssets] = useState(props.pagination?.hideDuplicateAssets ?? props.initialHideDuplicateAssets ?? true);
  const [query, setQuery] = useState(props.pagination?.query ?? props.initialQuery ?? "");
  const [sortOrder, setSortOrder] = useState<UsageSort>(props.pagination?.sort ?? props.initialSortOrder ?? "newest_desc");
  const [openComposerUsageId, setOpenComposerUsageId] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<{ usageId: string; target: CopyTarget } | null>(null);
  const [finderState, setFinderState] = useState<{ usageId: string; status: "opening" | "opened" | "failed"; message?: string } | null>(null);
  const deferredQuery = useDeferredValue(query);
  const openComposerRef = useRef<HTMLDivElement | null>(null);
  const isPaginated = Boolean(props.pagination);
  const showsRepeatMinimum = matchFilter === "matched" || matchFilter === "starred_or_duplicates";

  const buildHref = useMemo(
    () =>
      (
        nextPage: number,
        nextQuery: string,
        nextFilter: UsageMatchFilter,
        nextRepeatMinimum: number,
        nextSort: UsageSort,
        nextHideDuplicateAssets: boolean
      ) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        const trimmedQuery = nextQuery.trim();
        if (trimmedQuery) {
          params.set("query", trimmedQuery);
        } else {
          params.delete("query");
        }

        if (nextFilter === "all") {
          params.delete("filter");
        } else {
          params.set("filter", nextFilter);
        }

        if (nextRepeatMinimum === DEFAULT_REPEAT_MINIMUM) {
          params.delete("repeatMin");
        } else {
          params.set("repeatMin", String(nextRepeatMinimum));
        }

        if (nextSort === "newest_desc") {
          params.delete("sort");
        } else {
          params.set("sort", nextSort);
        }

        if (nextHideDuplicateAssets) {
          params.delete("dedupe");
        } else {
          params.set("dedupe", "0");
        }

        if (nextPage <= 1) {
          params.delete("page");
        } else {
          params.set("page", String(nextPage));
        }

        const queryString = params.toString();
        return queryString ? `${pathname}?${queryString}` : pathname;
      },
    [pathname, searchParams]
  );

  useEffect(() => {
    if (!isPaginated) {
      return;
    }

    const nextQuery = deferredQuery.trim();
    const currentQuery = props.pagination?.query ?? "";
    const currentFilter = props.pagination?.matchFilter ?? props.initialMatchFilter ?? "all";
    const currentRepeatMinimum = normalizeRepeatMinimum(
      props.pagination?.repeatMinimum ?? props.initialRepeatMinimum ?? DEFAULT_REPEAT_MINIMUM
    );
    const currentSort = props.pagination?.sort ?? props.initialSortOrder ?? "newest_desc";
    const currentHideDuplicateAssets = props.pagination?.hideDuplicateAssets ?? props.initialHideDuplicateAssets ?? true;
    if (
      nextQuery === currentQuery &&
      matchFilter === currentFilter &&
      repeatMinimum === currentRepeatMinimum &&
      sortOrder === currentSort &&
      hideDuplicateAssets === currentHideDuplicateAssets
    ) {
      return;
    }

    startRouting(() => {
      router.replace(buildHref(1, nextQuery, matchFilter, repeatMinimum, sortOrder, hideDuplicateAssets), { scroll: false });
    });
  }, [
    buildHref,
    deferredQuery,
    hideDuplicateAssets,
    isPaginated,
    matchFilter,
    props.initialHideDuplicateAssets,
    props.initialMatchFilter,
    props.initialRepeatMinimum,
    props.initialSortOrder,
    props.pagination?.hideDuplicateAssets,
    props.pagination?.matchFilter,
    props.pagination?.query,
    props.pagination?.repeatMinimum,
    props.pagination?.sort,
    repeatMinimum,
    router,
    sortOrder
  ]);

  const counts = useMemo(
    () =>
      props.pagination?.counts ?? {
        all: props.usages.length,
        matched: props.usages.filter((usage) => matchesRepeatedFilter(usage, repeatMinimum)).length,
        phash: props.usages.filter((usage) => usage.phashMatchCount > 0).length,
        starred: props.usages.filter((usage) => usage.mediaAssetStarred).length,
        starred_or_duplicates: props.usages.filter((usage) => matchesStarredOrRepeatedFilter(usage, repeatMinimum)).length
      },
    [props.pagination?.counts, props.usages, repeatMinimum]
  );

  const visibleUsages = useMemo(() => {
    if (isPaginated) {
      return props.usages;
    }

    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const filtered = props.usages.filter((usage) => {
      if (matchFilter === "matched") {
        if (!matchesRepeatedFilter(usage, repeatMinimum)) {
          return false;
        }
      }

      if (matchFilter === "phash" && usage.phashMatchCount === 0) {
        return false;
      }

      if (matchFilter === "starred" && !usage.mediaAssetStarred) {
        return false;
      }

      if (matchFilter === "starred_or_duplicates" && !matchesStarredOrRepeatedFilter(usage, repeatMinimum)) {
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

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (sortOrder === "duplicates_desc" && left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
        return right.duplicateGroupUsageCount - left.duplicateGroupUsageCount;
      }

      if (sortOrder === "duplicates_asc" && left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
        return left.duplicateGroupUsageCount - right.duplicateGroupUsageCount;
      }

      if (sortOrder === "hotness_desc" && left.hotnessScore !== right.hotnessScore) {
        return right.hotnessScore - left.hotnessScore;
      }

      if (sortOrder === "hotness_asc" && left.hotnessScore !== right.hotnessScore) {
        return left.hotnessScore - right.hotnessScore;
      }

      const leftTimestamp = Date.parse(left.tweet.createdAt ?? left.tweet.extraction.extractedAt ?? "") || 0;
      const rightTimestamp = Date.parse(right.tweet.createdAt ?? right.tweet.extraction.extractedAt ?? "") || 0;
      if (leftTimestamp !== rightTimestamp) {
        return sortOrder === "newest_asc" ? leftTimestamp - rightTimestamp : rightTimestamp - leftTimestamp;
      }

      return left.usageId.localeCompare(right.usageId);
    });

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
  }, [deferredQuery, hideDuplicateAssets, isPaginated, matchFilter, props.usages, repeatMinimum, sortOrder]);

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

  useEffect(() => {
    if (!copiedState) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopiedState(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copiedState]);

  useEffect(() => {
    if (!finderState || finderState.status === "opening") {
      return;
    }

    const timeoutId = window.setTimeout(() => setFinderState(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [finderState]);

  async function copyValue(usageId: string, target: CopyTarget, value: string | null | undefined): Promise<void> {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedState({ usageId, target });
  }

  async function revealLocalPath(usageId: string, localPath: string | null | undefined): Promise<void> {
    if (!localPath) {
      return;
    }

    setFinderState({ usageId, status: "opening" });

    const response = await fetch("/api/media/reveal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: localPath })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setFinderState({
        usageId,
        status: "failed",
        message: payload?.error ?? "Could not open Finder"
      });
      return;
    }

    setFinderState({ usageId, status: "opened" });
  }

  return (
    <section className="relative z-10 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">{props.sectionLabel ?? "Usage Queue"}</div>
            <h2 className="section-title mt-3">{props.sectionTitle ?? "Review media usages without losing analysis context"}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Narrow the queue fast, then open detail only when an asset earns more attention.
            </p>
          </div>
          <div className="tt-chip tt-chip-accent">
            {props.pagination ? `${props.usages.length} shown of ${props.pagination.totalResults}` : `${visibleUsages.length} visible`}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={`tt-link ${matchFilter === "all" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("all")}>
            <span>All {counts.all}</span>
          </button>
          <button type="button" className={`tt-link ${matchFilter === "matched" ? "tt-chip-accent" : ""}`} onClick={() => setMatchFilter("matched")}>
            <span>Repeated {counts.matched}</span>
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
            <span>Starred or repeated {counts.starred_or_duplicates}</span>
          </button>
        </div>

        <div className="usage-toolbar mb-6">
          <div className="usage-toolbar-main">
            <label className="tt-field md:col-span-2 xl:col-span-2">
              <span className="tt-field-label">Search</span>
              <input
                type="text"
                className="tt-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by author, tweet text, or analysis"
              />
            </label>

            <label className="tt-field">
              <span className="tt-field-label">Card detail</span>
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
                onChange={(event) => setSortOrder(event.target.value as UsageSort)}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {showsRepeatMinimum ? (
              <label className="tt-field">
                <span className="tt-field-label">Min repeats</span>
                <input
                  type="number"
                  min={DEFAULT_REPEAT_MINIMUM}
                  step="1"
                  className="tt-input"
                  value={repeatMinimum}
                  onChange={(event) => setRepeatMinimum(normalizeRepeatMinimum(Number.parseInt(event.target.value, 10)))}
                />
              </label>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Review mode</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  {hideDuplicateAssets
                    ? "Showing one card per asset so the queue stays readable."
                    : "Showing every usage, including repeats."}
                </p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">{showsRepeatMinimum ? "Repeat threshold" : "Current layout"}</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  {showsRepeatMinimum
                    ? matchFilter === "starred_or_duplicates"
                      ? `Repeated items need at least ${repeatMinimum} usages. Starred items still stay visible.`
                      : `Only assets with at least ${repeatMinimum} usages stay in this view.`
                    : viewMode === "detail"
                      ? "Detail cards with analysis fields."
                      : "Summary cards with the shortest route to action."}
                </p>
              </div>
            </div>

            <details className="tt-disclosure">
              <summary>
                <span>View options</span>
                <span className="tt-chip">layout and bulk actions</span>
              </summary>
              <div className="tt-disclosure-body grid gap-3 md:grid-cols-2">
                <label className="tt-field">
                  <span className="tt-field-label">Hide repeat entries</span>
                  <div className="tt-subpanel-soft flex min-h-full items-center gap-3">
                    <input
                      type="checkbox"
                      checked={hideDuplicateAssets}
                      onChange={(event) => setHideDuplicateAssets(event.target.checked)}
                      className="tt-checkbox"
                    />
                    <span className="text-sm leading-6 text-slate-200">Show one card per asset instead of every repeated usage.</span>
                  </div>
                </label>

                <div className="tt-field">
                  <span className="tt-field-label">Card density</span>
                  <div className="tt-subpanel-soft space-y-3">
                    <div className="text-sm text-slate-200">Cards per row: {columnsPerRow}</div>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={columnsPerRow}
                      onChange={(event) => setColumnsPerRow(Number(event.target.value))}
                      className="accent-cyan"
                    />
                    <div className="flex flex-wrap items-center gap-3">
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
            </details>
          </div>
        </div>

        {props.pagination ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
              {isRouting ? "Refreshing results..." : `${props.pagination.totalResults} matches across ${props.pagination.totalPages} pages`}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHref(
                  props.pagination.page - 1,
                  props.pagination.query,
                  props.pagination.matchFilter,
                  props.pagination.repeatMinimum,
                  props.pagination.sort,
                  props.pagination.hideDuplicateAssets
                )}
                className={`tt-link ${!props.pagination.hasPreviousPage ? "pointer-events-none opacity-40" : ""}`}
                aria-disabled={!props.pagination.hasPreviousPage}
              >
                <span>Previous {props.pagination.pageSize}</span>
              </Link>
              <Link
                href={buildHref(
                  props.pagination.page + 1,
                  props.pagination.query,
                  props.pagination.matchFilter,
                  props.pagination.repeatMinimum,
                  props.pagination.sort,
                  props.pagination.hideDuplicateAssets
                )}
                className={`tt-link ${!props.pagination.hasNextPage ? "pointer-events-none opacity-40" : ""}`}
                aria-disabled={!props.pagination.hasNextPage}
              >
                <span>Next {props.pagination.pageSize}</span>
              </Link>
            </div>
          </div>
        ) : null}

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
              mediaAssetSyncStatus,
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
              const syncStatusLabel = formatMediaAssetSyncStatus(mediaAssetSyncStatus);
              const localPath = mediaPlayableFilePath ?? mediaLocalFilePath;

              return (
                <article key={usageId} className="neon-card min-w-0 p-3 sm:p-3.5">
                  <div className="tt-media-frame tt-media-frame-native">
                    <MediaPreview
                      alt={tweet.text ?? "tweet media"}
                      imageUrl={displayUrl}
                      videoFilePath={mediaPlayableFilePath}
                      fit="native"
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
                      <div className="usage-status-popover">
                        <button
                          type="button"
                          className={`usage-status-pill ${
                            mediaAssetSyncStatus === "missing" || mediaAssetSyncStatus === "stale" ? "usage-status-pill-accent" : ""
                          }`}
                          aria-label={`Status: ${media.mediaKind}, ${analysis.status}, ${syncStatusLabel}`}
                        >
                          <span>Status</span>
                        </button>
                        <div className="usage-status-popover-panel" role="tooltip">
                          <div>{media.mediaKind}</div>
                          <div>{analysis.status}</div>
                          <div>{syncStatusLabel}</div>
                        </div>
                      </div>
                      <span className={`tt-chip ${hotnessScore >= 4 ? "tt-chip-accent" : ""}`}>hotness {hotnessScore.toFixed(2)}</span>
                      <span className={`tt-chip ${phashMatchCount > 0 ? "tt-chip-accent" : ""}`}>
                        similar {phashMatchCount}
                      </span>
                      <span className={`tt-chip ${duplicateGroupUsageCount > 1 ? "tt-chip-accent" : ""}`}>
                        repeated {duplicateGroupUsageCount}
                      </span>
                      {mediaAssetStarred ? <span className="tt-chip tt-chip-accent">starred</span> : null}
                    </div>

                    {!isExpanded(usageId) ? (
                      <p className="usage-preview-text">{tweet.text || analysis.caption_brief || "No tweet text captured for this item."}</p>
                    ) : null}

                    {isExpanded(usageId) ? (
                      <div className="border-t border-border pt-2.5">
                        <p className="text-sm leading-6 text-slate-200">{tweet.text}</p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <span className="tt-chip">likes {tweet.metrics.likes ?? "-"}</span>
                          <span className="tt-chip">reposts {tweet.metrics.reposts ?? "-"}</span>
                          <span className="tt-chip">views {tweet.metrics.views ?? "-"}</span>
                          <span className="tt-chip">{analysis.status}</span>
                          <span className={`tt-chip ${mediaAssetSyncStatus === "missing" || mediaAssetSyncStatus === "stale" ? "tt-chip-accent" : ""}`}>
                            {syncStatusLabel}
                          </span>
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
                            <div className="copy-action-group">
                              <button
                                type="button"
                                className="tt-link"
                                onClick={() => void copyValue(usageId, "tweet", tweet.text)}
                                disabled={!tweet.text}
                              >
                                <span>{copiedState?.usageId === usageId && copiedState.target === "tweet" ? "Copied tweet" : "Copy"}</span>
                              </button>
                              <details className="copy-action-menu">
                                <summary className="copy-action-toggle" aria-label="Open copy options">
                                  <span aria-hidden="true">▾</span>
                                </summary>
                                <div className="copy-action-panel">
                                  <button
                                    type="button"
                                    className="copy-action-item"
                                    onClick={() => void copyValue(usageId, "tweet", tweet.text)}
                                    disabled={!tweet.text}
                                  >
                                    <span>{copiedState?.usageId === usageId && copiedState.target === "tweet" ? "Copied tweet" : "Copy tweet"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="copy-action-item"
                                    onClick={() => void copyValue(usageId, "tweet_id", tweet.tweetId)}
                                    disabled={!tweet.tweetId}
                                  >
                                    <span>{copiedState?.usageId === usageId && copiedState.target === "tweet_id" ? "Copied tweet id" : "Copy tweet id"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="copy-action-item"
                                    onClick={() => void copyValue(usageId, "media_id", mediaAssetId)}
                                    disabled={!mediaAssetId}
                                  >
                                    <span>{copiedState?.usageId === usageId && copiedState.target === "media_id" ? "Copied media id" : "Copy media id"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="copy-action-item"
                                    onClick={() => void copyValue(usageId, "path", localPath)}
                                    disabled={!localPath}
                                  >
                                    <span>{copiedState?.usageId === usageId && copiedState.target === "path" ? "Copied path" : "Copy path"}</span>
                                  </button>
                                </div>
                              </details>
                            </div>
                            <button
                              type="button"
                              className="tt-link"
                              onClick={() => void revealLocalPath(usageId, localPath)}
                              disabled={!localPath || (finderState?.usageId === usageId && finderState.status === "opening")}
                            >
                              <span>
                                {finderState?.usageId === usageId
                                  ? finderState.status === "opening"
                                    ? "Opening path"
                                    : finderState.status === "opened"
                                      ? "Opened path"
                                      : "Path error"
                                  : "Open local path"}
                              </span>
                            </button>
                            {tweetUrl ? (
                              <Link href={`/replies?url=${encodeURIComponent(tweetUrl)}`} className="tt-link">
                                <span>Open in compose</span>
                              </Link>
                            ) : null}
                            {tweet.tweetId ? (
                              <Link href={`/clone?tweetId=${encodeURIComponent(tweet.tweetId)}`} className="tt-link">
                                <span>Rewrite this tweet</span>
                              </Link>
                            ) : null}
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
                                <span>{isComposerOpen ? "Hide reply composer" : "Draft reply"}</span>
                              </button>
                            ) : null}
                          </div>
                          {finderState?.usageId === usageId && finderState.status === "failed" ? (
                            <div className="mt-2 text-sm text-orange">{finderState.message ?? "Could not open Finder"}</div>
                          ) : null}
                        </div>

                        {viewMode === "detail" ? (
                          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">What it conveys</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.conveys ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.conveys)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Intent</strong>
                              <div className={`mt-2 text-sm leading-7 ${!analysis.user_intent ? "text-muted" : "text-slate-200"}`}>
                                {renderField(analysis.user_intent)}
                              </div>
                            </div>
                            <div className="tt-subpanel-soft">
                              <strong className="tt-data-label">Role</strong>
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
                              <strong className="tt-data-label">Text and media</strong>
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
                                localFilePath: mediaLocalFilePath,
                                playableFilePath: mediaPlayableFilePath,
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
