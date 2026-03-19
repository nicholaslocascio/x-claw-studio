import Link from "next/link";
import { getDashboardOverviewData } from "@/src/server/data";
import { getGroundedTopicNews } from "@/src/server/topic-grounded-news";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "No captures yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function HomePage() {
  const data = getDashboardOverviewData();
  const groundedNewsByTopicId = await getGroundedTopicNews(data.topicClusters, { refreshIfStale: false });
  const latestManifest = data.manifests[0] ?? null;
  const runningRuns = data.runHistory.filter((run) => run.status === "running");
  const activeRefreshRuns = runningRuns.filter((run) =>
    run.task === "analyze_missing" ||
    run.task === "analyze_topics" ||
    run.task === "rebuild_media_assets" ||
    run.task === "backfill_media_native_types"
  );
  const analyzeMissingRun = runningRuns.find((run) => run.task === "analyze_missing") ?? null;
  const pendingCount = data.pendingUsageCount;
  const completedCount = data.completedUsageCount;
  const repeatedUsageCount = data.repeatedAssetUsageCount;
  const starredCount = data.starredUsageCount;
  const freshTopicCount = data.topicClusters.filter((topic) => !topic.isStale).length;
  const groundedTopicCount = data.topicClusters.filter((topic) => groundedNewsByTopicId.get(topic.topicId)).length;
  const failedRunCount = data.runHistory.filter((run) => run.status === "failed").length;
  const wishlistPendingCount = data.replyMediaWishlist.filter((entry) => entry.status === "pending").length;
  const priorityCards = [
    {
      href: "/queue",
      kicker: "Review",
      title: "Review media",
      description: "Inspect saved assets, spot repeats, and decide what to analyze or reuse.",
      cta: "Open review",
      chips: [`${pendingCount} pending`, `${starredCount} starred`]
    },
    {
      href: "/replies",
      kicker: "Compose",
      title: "Write a reply",
      description: "Load a tweet, review the context, and draft a response without leaving the app.",
      cta: "Open compose",
      chips: ["reply and post tools", `${data.totalTweetCount} tweets ready for reuse`]
    },
    {
      href: "/control",
      kicker: "Capture",
      title: "Capture latest timeline",
      description: "Pull in fresh tweets, media, and run updates from one control surface.",
      cta: "Open capture",
      chips: [runningRuns.length > 0 ? `${runningRuns.length} running now` : `${data.runHistory.length} runs logged`, latestManifest ? "capture ready" : "no capture yet"]
    },
    {
      href: "/topics",
      kicker: "Research",
      title: "Explore topics",
      description: "See what themes are active and turn them into ideas worth posting into now.",
      cta: "Open topics",
      chips: [`${freshTopicCount} fresh`, `${groundedTopicCount} with news context`]
    }
  ];

  const continueCards = [
    {
      href: "/queue",
      title: "Media review",
      description:
        analyzeMissingRun
          ? "Fresh capture is still being analyzed in the background."
          : pendingCount > 0
            ? "Start with the items still waiting for review."
            : "The queue is clear. Check repeated assets or search for reusable media.",
      meta: analyzeMissingRun ? `analysis started ${formatDate(analyzeMissingRun.startedAt)}` : pendingCount > 0 ? `${pendingCount} still need attention` : `${completedCount} already analyzed`
    },
    {
      href: "/replies",
      title: "Compose",
      description: "Jump back into reply drafting or start a new post from notes.",
      meta: `${data.totalTweetCount} saved tweets available`
    },
    {
      href: "/control",
      title: "Latest capture",
      description: latestManifest
        ? "Open capture and runs to inspect the last import, schedule, or recent failures."
        : "Set up your first capture run and bring in fresh tweets.",
      meta: latestManifest ? latestManifest.runId : "No manifest available"
    }
  ];

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-6 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Home</div>
            <div className="type-cursor mt-2 text-sm text-muted">A clear starting point for capture, review, writing, and research.</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href="/control" className="tt-link">
              <span>Capture</span>
            </Link>
            <Link href="/queue" className="tt-button">
              <span>Review</span>
            </Link>
            <Link href="/replies" className="tt-link">
              <span>Compose</span>
            </Link>
          </div>
        </div>
        <div className="panel-body space-y-6">
          {data.xAuthWarning ? (
            <div className="tt-subpanel border-orange/60 bg-orange/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="tt-chip tt-chip-danger">X connection needs attention</div>
                  <p className="mt-3 text-base leading-7 text-slate-100">
                    {data.xAuthWarning.reason}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {data.xAuthWarning.task} failed {formatDate(data.xAuthWarning.startedAt)}.
                  </p>
                </div>
                <Link href="/control#x-auth" className="tt-button">
                  <span>Fix X access</span>
                </Link>
              </div>
            </div>
          ) : null}

          {activeRefreshRuns.length > 0 ? (
            <div className="tt-subpanel border-accent/50 bg-accent/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="tt-chip tt-chip-accent">Background refresh running</div>
                  <p className="mt-3 text-base leading-7 text-slate-100">
                    New tweets are in. Analysis and topic refresh are still catching up, so pending counts can stay high for a bit.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeRefreshRuns.slice(0, 3).map((run) => (
                    <span key={run.runControlId} className="tt-chip">
                      {run.task} · {formatDate(run.startedAt)}
                    </span>
                  ))}
                  <Link href="/control" className="tt-button">
                    <span>Open runs</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <section className="hero-panel items-start">
            <div className="tt-subpanel">
              <div className="tt-chip tt-chip-accent">Start here</div>
              <h1 className="hero-title mt-4">What do you want to work on?</h1>
              <p className="hero-copy mt-4">
                Capture tweets, review saved media, draft posts, or explore active topics from one place.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/queue" className="tt-button">
                  <span>Review media</span>
                </Link>
                <Link href="/replies" className="tt-link">
                  <span>Write a reply</span>
                </Link>
                <Link href="/control" className="tt-link">
                  <span>Capture latest timeline</span>
                </Link>
                <Link href="/search" className="tt-link">
                  <span>Search media</span>
                </Link>
              </div>
            </div>

            <div className="dashboard-stat-grid">
              <div className="metric-card">
                <div className="tt-data-label">Pending review</div>
                <div className="metric-number mt-3 text-accent">{pendingCount}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Saved media still waiting for review.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Analyzed</div>
                <div className="metric-number mt-3 text-cyan">{completedCount}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Items already analyzed.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Repeated assets</div>
                <div className="metric-number mt-3 text-slate-100">{repeatedUsageCount}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Assets with repeat or similarity signals.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Fresh topics</div>
                <div className="metric-number mt-3 text-lime-300">{freshTopicCount}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Themes that still look timely.</p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="tt-subpanel-soft">
              <div className="tt-data-label">Suggested next step</div>
              <p className="mt-3 text-base leading-7 text-slate-200">
                {analyzeMissingRun
                  ? "Analysis is still running in the background. Open capture if you want the live job list and logs."
                  : pendingCount > 0
                    ? "Start with media review. There are still items waiting for analysis."
                    : "The review queue is clear. Search media, explore topics, or continue drafting."}
              </p>
            </div>
            <div className="tt-subpanel-soft">
              <div className="tt-data-label">System status</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="tt-chip">{data.totalTweetCount} saved tweets</span>
                <span className="tt-chip">{data.indexedAssetUsageCount} indexed assets</span>
                <span className={`tt-chip ${runningRuns.length > 0 ? "tt-chip-accent" : ""}`}>{runningRuns.length} running jobs</span>
                <span className="tt-chip">{failedRunCount} failed runs</span>
                <span className="tt-chip">{wishlistPendingCount} wishlist items</span>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Needs attention</div>
              <h2 className="section-title mt-3">What needs attention right now</h2>
              <p className="page-intro mt-3 max-w-3xl">
                These are the places where the app can unblock you fastest.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {priorityCards.map((card) => (
              <article key={card.href} className="priority-card">
                <div>
                  <div className="section-kicker">{card.kicker}</div>
                  <h3 className="card-title mt-3">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{card.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.chips.map((chip) => (
                      <span key={`${card.href}-${chip}`} className="tt-chip">
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <Link href={card.href} className="tt-button">
                  <span>{card.cta}</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Continue</div>
              <h2 className="section-title mt-3">Pick up where you left off</h2>
              <p className="page-intro mt-3 max-w-3xl">
                Use these shortcuts when you already know the workflow you want.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {continueCards.map((card) => (
              <article key={card.href} className="summary-card">
                <div className="tt-data-label">{card.title}</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">{card.description}</p>
                <div className="mt-4 text-sm text-slate-400">{card.meta}</div>
                <div className="mt-4">
                  <Link href={card.href} className="tt-link">
                    <span>Open</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">System status</div>
              <h2 className="section-title mt-3">A quick read on the local workspace</h2>
              <p className="page-intro mt-3 max-w-3xl">
                Enough context to know whether the local data is fresh and where it came from.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div className="tt-subpanel-soft">
              <div className="tt-data-label">Latest capture</div>
              <div className="mt-3 break-all font-[family:var(--font-mono)] text-xs tracking-[0.12em] text-slate-100">
                {latestManifest?.runId ?? "No manifest available"}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {data.totalTweetCount} saved tweets across {data.manifests.length} capture runs. {data.tweetsWithMediaCount} include media and {data.textOnlyTweetCount} are text only.
              </p>
            </div>
            <div className="tt-subpanel-soft">
              <div className="tt-data-label">Recent writing</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                Reply and post tools are ready whenever you want to turn saved context into a draft.
              </p>
            </div>
            <div className="tt-subpanel-soft">
              <div className="tt-data-label">Storage</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">All data is read from local files under <code>data/</code>.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
