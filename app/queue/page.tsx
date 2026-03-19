import Link from "next/link";
import { UsageQueue } from "@/src/components/usage-queue";
import { getLightweightUsageData, getUsagePage, USAGE_PAGE_SIZE } from "@/src/server/data";

export default async function QueuePage(props: {
  searchParams?: Promise<{
    dedupe?: string;
    filter?: string;
    page?: string;
    query?: string;
    repeatMin?: string;
    sort?: string;
  }>;
}) {
  const usages = getLightweightUsageData();
  const searchParams = (await props.searchParams) ?? {};
  const page = Number.parseInt(searchParams.page ?? "1", 10);
  const pagedUsages = getUsagePage({
    usages,
    page: Number.isFinite(page) ? page : 1,
    pageSize: USAGE_PAGE_SIZE,
    query: searchParams.query,
    matchFilter: searchParams.filter,
    repeatMinimum: searchParams.repeatMin,
    sort: searchParams.sort,
    hideDuplicateAssets: searchParams.dedupe,
    defaultHideDuplicateAssets: true
  });
  const completedCount = usages.filter((usage) => usage.analysis.status === "complete").length;
  const pendingCount = usages.length - completedCount;
  const duplicateOrSimilarCount = usages.filter((usage) => usage.mediaAssetUsageCount > 1 || usage.phashMatchCount > 0).length;
  const starredCount = usages.filter((usage) => usage.mediaAssetStarred).length;

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Review</div>
            <div className="type-cursor mt-2 text-sm text-muted">
              Inspect saved media, spot repeats, and decide what to analyze or reuse.
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
              <h1 className="section-title mt-1">Media review</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Search the queue, narrow it to the items that matter, and open details when you want more context.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
              <Link href="/matches" className="tt-link">
                <span>Open similar media</span>
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="tt-chip tt-chip-accent">{pendingCount} pending</span>
            <span className="tt-chip">{completedCount} analyzed</span>
            <span className="tt-chip">{duplicateOrSimilarCount} repeated or similar</span>
            <span className="tt-chip">{starredCount} starred</span>
          </div>
        </div>
      </section>

      <UsageQueue
        usages={pagedUsages.usages}
        pagination={pagedUsages}
        initialQuery={pagedUsages.query}
        initialMatchFilter={pagedUsages.matchFilter}
        initialRepeatMinimum={pagedUsages.repeatMinimum}
        initialSortOrder={pagedUsages.sort}
        sectionLabel="Media review"
        sectionTitle="Review saved media"
        initialHideDuplicateAssets={pagedUsages.hideDuplicateAssets}
      />
    </main>
  );
}
