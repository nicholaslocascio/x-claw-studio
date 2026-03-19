"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { TopicClusterCard, formatTopicClusterDate } from "@/src/components/topic-clusters";
import type {
  GroundedTopicNews,
  TopicClusterFreshnessFilter,
  TopicClusterKindFilter,
  TopicClusterPage,
  TopicClusterRecord,
  TopicClusterSort,
  TopicSignalKind
} from "@/src/lib/types";

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

const SORT_LABELS: Record<TopicClusterSort, string> = {
  hotness_desc: "Hotness: high to low",
  hotness_asc: "Hotness: low to high",
  newest_desc: "Newest mention first",
  newest_asc: "Oldest mention first",
  tweets_desc: "Tweets: high to low",
  tweets_asc: "Tweets: low to high",
  likes_desc: "Likes: high to low",
  likes_asc: "Likes: low to high",
  recent_24h_desc: "24h activity: high to low",
  recent_24h_asc: "24h activity: low to high"
};

const FRESHNESS_LABELS: Record<TopicClusterFreshnessFilter, string> = {
  all: "Any age",
  fresh: "Fresh only",
  active_24h: "Last 24 hours",
  active_72h: "Last 72 hours",
  stale: "Stale only"
};

const KIND_LABELS: Record<TopicSignalKind, string> = {
  entity: "Entities",
  cashtag: "Cashtags",
  hashtag: "Hashtags",
  phrase: "Phrases",
  reference: "References",
  brand: "Brands",
  intent: "Intents"
};

export function TopicExplorer(props: {
  pagination: TopicClusterPage;
  generatedAt: string;
  freshestMentionAt: string | null;
  availableKinds: TopicSignalKind[];
  kindCounts: Partial<Record<TopicSignalKind, number>>;
  groundedNewsEnabled?: boolean;
  draftTopicBasePath?: string;
  topics: Array<TopicClusterRecord & { groundedNews?: GroundedTopicNews | null }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRouting, startRouting] = useTransition();
  const [query, setQuery] = useState(props.pagination.query);
  const [sort, setSort] = useState<TopicClusterSort>(props.pagination.sort);
  const [freshness, setFreshness] = useState<TopicClusterFreshnessFilter>(props.pagination.freshness);
  const [kind, setKind] = useState<TopicClusterKindFilter>(props.pagination.kind);
  const [pageSize, setPageSize] = useState(props.pagination.pageSize);
  const deferredQuery = useDeferredValue(query);

  const buildHref = useMemo(
    () =>
      (
        nextPage: number,
        nextQuery: string,
        nextSort: TopicClusterSort,
        nextFreshness: TopicClusterFreshnessFilter,
        nextKind: TopicClusterKindFilter,
        nextPageSize: number
      ) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        const trimmedQuery = nextQuery.trim();

        if (trimmedQuery) {
          params.set("query", trimmedQuery);
        } else {
          params.delete("query");
        }

        if (nextSort === "hotness_desc") {
          params.delete("sort");
        } else {
          params.set("sort", nextSort);
        }

        if (nextFreshness === "all") {
          params.delete("freshness");
        } else {
          params.set("freshness", nextFreshness);
        }

        if (nextKind === "all") {
          params.delete("kind");
        } else {
          params.set("kind", nextKind);
        }

        if (nextPageSize === 24) {
          params.delete("pageSize");
        } else {
          params.set("pageSize", String(nextPageSize));
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
    const nextQuery = deferredQuery.trim();
    const sameState =
      nextQuery === props.pagination.query &&
      sort === props.pagination.sort &&
      freshness === props.pagination.freshness &&
      kind === props.pagination.kind &&
      pageSize === props.pagination.pageSize;

    if (sameState) {
      return;
    }

    startRouting(() => {
      router.replace(buildHref(1, nextQuery, sort, freshness, kind, pageSize), { scroll: false });
    });
  }, [
    buildHref,
    deferredQuery,
    freshness,
    kind,
    pageSize,
    props.pagination.freshness,
    props.pagination.kind,
    props.pagination.pageSize,
    props.pagination.query,
    props.pagination.sort,
    router,
    sort
  ]);

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Topics</div>
            <h2 className="section-title mt-3">Browse active topics</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Search the topic index when you need breadth, then narrow to the themes that still feel worth posting into now.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tt-chip tt-chip-accent">{props.pagination.totalResults} matches</div>
            <div className="tt-chip">
              Page {props.pagination.page} of {props.pagination.totalPages}
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Filters</div>
              <div className="window-dots">
                <span className="window-dot bg-orange" />
                <span className="window-dot bg-accent" />
                <span className="window-dot bg-cyan" />
              </div>
            </div>
            <div className="panel-body space-y-4">
              <label className="tt-field">
                <span className="tt-field-label">Search topics</span>
                <input
                  type="text"
                  className="tt-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search labels, tweet text, authors, or angles"
                  
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="tt-field">
                  <span className="tt-field-label">Sort</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as TopicClusterSort)} className="tt-select">
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="tt-field">
                  <span className="tt-field-label">Freshness</span>
                  <select
                    value={freshness}
                    onChange={(event) => setFreshness(event.target.value as TopicClusterFreshnessFilter)}
                    className="tt-select"
                  >
                    {Object.entries(FRESHNESS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <details className="tt-disclosure">
                <summary>
                  <span>Advanced filters</span>
                  <span className="tt-chip">type and page size</span>
                </summary>
                <div className="tt-disclosure-body grid gap-4 md:grid-cols-2">
                  <label className="tt-field">
                    <span className="tt-field-label">Topic type</span>
                    <select value={kind} onChange={(event) => setKind(event.target.value as TopicClusterKindFilter)} className="tt-select">
                      <option value="all">All kinds</option>
                      {props.availableKinds.map((value) => (
                        <option key={value} value={value}>
                          {KIND_LABELS[value]} ({props.kindCounts[value] ?? 0})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="tt-field">
                    <span className="tt-field-label">Page size</span>
                    <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="tt-select">
                      {PAGE_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value} topics
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="tt-link"
                  onClick={() => {
                    setQuery("");
                    setSort("hotness_desc");
                    setFreshness("all");
                    setKind("all");
                    setPageSize(24);
                  }}
                >
                  <span>Reset filters</span>
                </button>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  {isRouting ? "Refreshing results..." : `${props.pagination.totalResults} results in current view`}
                </span>
              </div>
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Index status</div>
              <div className="tt-chip">local cache</div>
            </div>
            <div className="panel-body space-y-4">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Last updated</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{formatTopicClusterDate(props.generatedAt)}</p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Freshest mention</div>
                <p className="mt-2 text-sm leading-6 text-slate-200">{formatTopicClusterDate(props.freshestMentionAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="tt-chip">all {props.pagination.counts.all}</span>
                <span className="tt-chip tt-chip-accent">fresh {props.pagination.counts.fresh}</span>
                <span className="tt-chip">24h {props.pagination.counts.active_24h}</span>
                <span className="tt-chip">72h {props.pagination.counts.active_72h}</span>
                <span className="tt-chip tt-chip-warning">stale {props.pagination.counts.stale}</span>
              </div>
            </div>
          </div>
        </div>

        {props.pagination.totalResults > 0 ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Showing {props.topics.length} topics on this page
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHref(
                  props.pagination.page - 1,
                  props.pagination.query,
                  props.pagination.sort,
                  props.pagination.freshness,
                  props.pagination.kind,
                  props.pagination.pageSize
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
                  props.pagination.sort,
                  props.pagination.freshness,
                  props.pagination.kind,
                  props.pagination.pageSize
                )}
                className={`tt-link ${!props.pagination.hasNextPage ? "pointer-events-none opacity-40" : ""}`}
                aria-disabled={!props.pagination.hasNextPage}
              >
                <span>Next {props.pagination.pageSize}</span>
              </Link>
            </div>
          </div>
        ) : null}

        {props.topics.length === 0 ? (
          <div className="tt-placeholder">No topics matched this filter set.</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {props.topics.map((topic) => (
              <TopicClusterCard
                key={topic.topicId}
                topic={topic}
                groundedNewsEnabled={props.groundedNewsEnabled}
                draftTopicBasePath={props.draftTopicBasePath}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
