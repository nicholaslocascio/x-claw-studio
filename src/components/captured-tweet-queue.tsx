"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AssetStarButton } from "@/src/components/asset-star-button";
import { MediaPreview } from "@/src/components/media-preview";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { CapturedTweetFilter, CapturedTweetPage, CapturedTweetRecord, CapturedTweetSort } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

const SORT_LABELS: Record<CapturedTweetSort, string> = {
  newest_desc: "Newest first",
  newest_asc: "Oldest first"
};

const ReplyComposer = dynamic(
  () => import("@/src/components/reply-composer").then((module) => module.ReplyComposer),
  {
    loading: () => <div className="tt-placeholder mt-4">Loading reply composer...</div>
  }
);

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getTweetTimestampMs(tweet: CapturedTweetRecord["tweet"]): number {
  const timestamp = tweet.createdAt ?? tweet.extraction.extractedAt ?? null;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CapturedTweetQueue(props: {
  tweets: CapturedTweetRecord[];
  initialTweetFilter?: CapturedTweetFilter;
  initialQuery?: string;
  pagination?: CapturedTweetPage;
  countOverrides?: Record<CapturedTweetFilter, number>;
  sectionLabel?: string;
  sectionTitle?: string;
  sectionDescription?: string;
  visibleCountLabelOverride?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRouting, startRouting] = useTransition();
  const [tweetFilter, setTweetFilter] = useState<CapturedTweetFilter>(props.pagination?.tweetFilter ?? props.initialTweetFilter ?? "with_media");
  const [query, setQuery] = useState(props.pagination?.query ?? props.initialQuery ?? "");
  const [sort, setSort] = useState<CapturedTweetSort>(props.pagination?.sort ?? "newest_desc");
  const [openComposerTweetKey, setOpenComposerTweetKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const openComposerRef = useRef<HTMLDivElement | null>(null);
  const isPaginated = Boolean(props.pagination);

  const buildHref = useMemo(
    () =>
      (nextPage: number, nextQuery: string, nextFilter: CapturedTweetFilter, nextSort: CapturedTweetSort) => {
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

        if (nextSort === "newest_desc") {
          params.delete("sort");
        } else {
          params.set("sort", nextSort);
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
    const currentFilter = props.pagination?.tweetFilter ?? "all";
    const currentSort = props.pagination?.sort ?? "newest_desc";

    if (nextQuery === currentQuery && tweetFilter === currentFilter && sort === currentSort) {
      return;
    }

    startRouting(() => {
      router.replace(buildHref(1, nextQuery, tweetFilter, sort), { scroll: false });
    });
  }, [buildHref, deferredQuery, isPaginated, props.pagination?.query, props.pagination?.sort, props.pagination?.tweetFilter, router, sort, tweetFilter]);

  const counts = useMemo(
    () =>
      props.countOverrides ??
      props.pagination?.counts ?? {
        with_media: props.tweets.filter((entry) => entry.hasMedia).length,
        without_media: props.tweets.filter((entry) => !entry.hasMedia).length,
        all: props.tweets.length
      },
    [props.countOverrides, props.pagination?.counts, props.tweets]
  );

  const visibleTweets = useMemo(() => {
    if (isPaginated) {
      return props.tweets;
    }

    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return [...props.tweets]
      .filter((entry) => {
        if (tweetFilter === "with_media" && !entry.hasMedia) {
          return false;
        }

        if (tweetFilter === "without_media" && entry.hasMedia) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          entry.tweet.authorUsername,
          entry.tweet.authorDisplayName,
          entry.tweet.text
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) =>
        sort === "newest_asc"
          ? getTweetTimestampMs(left.tweet) - getTweetTimestampMs(right.tweet)
          : getTweetTimestampMs(right.tweet) - getTweetTimestampMs(left.tweet)
      );
  }, [deferredQuery, isPaginated, props.tweets, sort, tweetFilter]);

  const visibleCountLabel =
    props.visibleCountLabelOverride ??
    (props.pagination
      ? `${props.tweets.length} shown of ${props.pagination.totalResults}`
      : `${visibleTweets.length} visible`);

  useEffect(() => {
    if (!openComposerTweetKey || !openComposerRef.current) {
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
  }, [openComposerTweetKey]);

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">{props.sectionLabel ?? "Captured tweets"}</div>
            <h2 className="section-title mt-3">{props.sectionTitle ?? "Browse saved tweets."}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              {props.sectionDescription ??
                "The default view stays focused on tweets with media, but text-only posts remain visible when you need full capture context."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tt-chip tt-chip-accent">{visibleCountLabel}</div>
            {props.pagination ? (
              <div className="tt-chip">
                Page {props.pagination.page} of {props.pagination.totalPages}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`tt-link ${tweetFilter === "with_media" ? "tt-chip-accent" : ""}`}
            onClick={() => setTweetFilter("with_media")}
          >
            <span>With media {counts.with_media}</span>
          </button>
          <button
            type="button"
            className={`tt-link ${tweetFilter === "without_media" ? "tt-chip-accent" : ""}`}
            onClick={() => setTweetFilter("without_media")}
          >
            <span>Text only {counts.without_media}</span>
          </button>
          <button
            type="button"
            className={`tt-link ${tweetFilter === "all" ? "tt-chip-accent" : ""}`}
            onClick={() => setTweetFilter("all")}
          >
            <span>All {counts.all}</span>
          </button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="tt-field">
            <span className="tt-field-label">Search tweets</span>
            <input
              type="text"
              className="tt-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by author or tweet text"
            />
          </label>

          <label className="tt-field">
            <span className="tt-field-label">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as CapturedTweetSort)} className="tt-select">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {props.pagination ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
              {isRouting ? "Refreshing results..." : `${props.pagination.totalResults} matches across ${props.pagination.totalPages} pages`}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHref(props.pagination.page - 1, props.pagination.query, props.pagination.tweetFilter, props.pagination.sort)}
                className={`tt-link ${!props.pagination.hasPreviousPage ? "pointer-events-none opacity-40" : ""}`}
                aria-disabled={!props.pagination.hasPreviousPage}
              >
                <span>Previous {props.pagination.pageSize}</span>
              </Link>
              <Link
                href={buildHref(props.pagination.page + 1, props.pagination.query, props.pagination.tweetFilter, props.pagination.sort)}
                className={`tt-link ${!props.pagination.hasNextPage ? "pointer-events-none opacity-40" : ""}`}
                aria-disabled={!props.pagination.hasNextPage}
              >
                <span>Next {props.pagination.pageSize}</span>
              </Link>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {visibleTweets.map((entry) => {
            const firstMedia = entry.tweet.media[0] ?? null;
            const tweetUrl = getPreferredXStatusUrl(entry.tweet.tweetUrl);
            const composerPanelId = `reply-composer-${entry.tweetKey}`;
            const isComposerOpen = openComposerTweetKey === entry.tweetKey;
            const previewUrl = firstMedia
              ? resolveMediaDisplayUrl({
                  localFilePath: null,
                  posterUrl: firstMedia.posterUrl,
                  previewUrl: firstMedia.previewUrl,
                  sourceUrl: firstMedia.sourceUrl
                })
              : null;

            return (
              <article key={entry.tweetKey} className="neon-card min-w-0">
                {firstMedia ? (
                  <div className="tt-media-frame mb-4 aspect-[16/9]">
                    <MediaPreview
                      alt={entry.tweet.text ?? "tweet preview"}
                      imageUrl={previewUrl}
                    />
                    {entry.firstMediaAssetId ? (
                      <div className="absolute right-1.5 top-1.5 z-10">
                        <AssetStarButton
                          assetId={entry.firstMediaAssetId}
                          starred={entry.firstMediaAssetStarred}
                          className={
                            entry.firstMediaAssetStarred
                              ? "tt-icon-button tt-icon-button-secondary bg-[#121826]/90"
                              : "tt-icon-button bg-[#121826]/90"
                          }
                          wrapperClassName="flex items-center"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mb-4 border border-dashed border-white/15 bg-black/10 px-4 py-6 text-sm leading-6 text-slate-400">
                    Text-only tweet saved. No media review item is created for this post.
                  </div>
                )}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-100">
                      {entry.tweet.authorUsername ?? entry.tweet.authorDisplayName ?? "Unknown author"}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{formatDate(entry.tweet.createdAt)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`tt-chip ${entry.hasMedia ? "tt-chip-accent" : ""}`}>
                      {entry.mediaCount} media
                    </span>
                    <span className="tt-chip">analyzed {entry.analyzedMediaCount}</span>
                    {entry.hasMedia ? (
                      <span
                        className={`tt-chip ${
                          entry.mediaAssetSyncStatus === "missing" || entry.mediaAssetSyncStatus === "stale"
                            ? "tt-chip-accent"
                            : ""
                        }`}
                      >
                        {entry.mediaAssetSyncStatus === "missing"
                          ? "Missing"
                          : entry.mediaAssetSyncStatus === "stale"
                            ? "Out of date"
                            : "Indexed"}
                      </span>
                    ) : null}
                    {entry.hasMedia ? <span className="tt-chip">indexed {entry.indexedMediaCount ?? 0}</span> : null}
                    {(entry.staleMediaCount ?? 0) > 0 ? <span className="tt-chip tt-chip-accent">stale {entry.staleMediaCount}</span> : null}
                    {(entry.missingMediaCount ?? 0) > 0 ? <span className="tt-chip tt-chip-accent">missing {entry.missingMediaCount}</span> : null}
                    {entry.firstMediaAssetId && entry.firstMediaAssetStarred ? <span className="tt-chip tt-chip-accent">starred</span> : null}
                  </div>
                </div>

                {entry.topicLabels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.topicLabels.map((label) => (
                      <span key={`${entry.tweetKey}:${label}`} className="tt-chip">
                        {label}
                      </span>
                    ))}
                    {entry.topTopicLabel ? (
                      <span className={`tt-chip ${entry.topTopicHotnessScore >= 4 ? "tt-chip-accent" : ""}`}>
                        top hot {entry.topTopicHotnessScore.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-4 text-sm leading-7 text-slate-200">
                  {entry.tweet.text ?? "No tweet text captured."}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tweetUrl ? (
                    <Link href={tweetUrl} className="tt-link" target="_blank" rel="noreferrer">
                      <span>Open on X</span>
                    </Link>
                  ) : null}
                  {tweetUrl ? (
                    <Link href={`/replies?url=${encodeURIComponent(tweetUrl)}`} className="tt-link">
                      <span>Open in reply builder</span>
                    </Link>
                  ) : null}
                  {entry.tweet.tweetId ? (
                    <Link href={`/clone?tweetId=${encodeURIComponent(entry.tweet.tweetId)}`} className="tt-link">
                      <span>Open in clone builder</span>
                    </Link>
                  ) : null}
                  {entry.tweet.tweetId ? (
                    <button
                      type="button"
                      className="tt-button"
                      aria-controls={composerPanelId}
                      aria-expanded={isComposerOpen}
                      onClick={() =>
                        setOpenComposerTweetKey((current) => (current === entry.tweetKey ? null : entry.tweetKey))
                      }
                    >
                      <span>{isComposerOpen ? "Hide reply composer" : "Compose reply"}</span>
                    </button>
                  ) : null}
                  {entry.hasMedia && entry.tweet.tweetId ? (
                    <Link href={`/#usage-queue`} className="tt-link">
                      <span>Open media queue</span>
                    </Link>
                  ) : null}
                </div>

                {isComposerOpen && entry.tweet.tweetId ? (
                  <div
                    id={composerPanelId}
                    ref={openComposerRef}
                    className="mt-6 scroll-mt-24 border-t border-white/10 pt-5"
                  >
                    <ReplyComposer
                      tweetId={entry.tweet.tweetId}
                      subject={{
                        usageId: null,
                        tweetId: entry.tweet.tweetId,
                        tweetUrl,
                        authorUsername: entry.tweet.authorUsername,
                        createdAt: entry.tweet.createdAt,
                        tweetText: entry.tweet.text,
                        mediaKind: entry.tweet.media[0]?.mediaKind ?? "none",
                        localFilePath: null,
                        playableFilePath: null,
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
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
