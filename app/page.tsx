import Link from "next/link";
import { ControlPanel } from "@/src/components/control-panel";
import { CapturedTweetQueue } from "@/src/components/captured-tweet-queue";
import { FacetSearch } from "@/src/components/facet-search";
import { ReplyMediaWishlist } from "@/src/components/reply-media-wishlist";
import { TopicClusters } from "@/src/components/topic-clusters";
import { UsageQueue } from "@/src/components/usage-queue";
import { getDashboardData } from "@/src/server/data";
import { getGroundedTopicNews, isGroundedTopicNewsEnabled } from "@/src/server/topic-grounded-news";

function statLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default async function HomePage() {
  const data = getDashboardData();
  const groundedNewsByTopicId = await getGroundedTopicNews(data.topicClusters);
  const latestManifest = data.manifests[0] ?? null;
  const completedCount = data.tweetUsages.filter((usage) => usage.analysis.status === "complete").length;
  const pendingCount = data.tweetUsages.length - completedCount;
  const phashMatchedUsageCount = data.tweetUsages.filter((usage) => usage.phashMatchCount > 0).length;
  const starredCount = data.tweetUsages.filter((usage) => usage.mediaAssetStarred).length;
  const textOnlyTweetCount = data.capturedTweets.filter((entry) => !entry.hasMedia).length;
  const tweetsWithMediaCount = data.capturedTweets.length - textOnlyTweetCount;
  const freshTopicCount = data.topicClusters.filter((topic) => !topic.isStale).length;

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-6 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Twitter Trend Lab</div>
            <div className="type-cursor mt-2 font-[family:var(--font-label)] text-[10px] uppercase tracking-[0.18em] text-muted">
              &gt; Capture, inspect, and promote local media usages
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href="/tweets" className="tt-button">
              <span>Tweets</span>
            </Link>
            <Link href="/replies" className="tt-button">
              <span>Replies</span>
            </Link>
            <Link href="/matches" className="tt-button">
              <span>Matches</span>
            </Link>
            <Link href="/wishlist" className="tt-button">
              <span>Wishlist</span>
            </Link>
            <Link href="/drafts" className="tt-button">
              <span>Drafts</span>
            </Link>
            <Link href="/topics" className="tt-button">
              <span>Topics</span>
            </Link>
            <a href="#run-control" className="tt-link">
              <span>Run Control</span>
            </a>
            <a href="#usage-queue" className="tt-link">
              <span>Queue</span>
            </a>
            <a href="#facet-search" className="tt-link">
              <span>Search</span>
            </a>
          </div>
        </div>
        <div className="panel-body">
          <div className="hero-panel">
            <div className="space-y-4">
              <div className="tt-subpanel">
                <div className="tt-chip tt-chip-accent">Local-first workflow</div>
                <h1 className="hero-title mt-4">Run captures, triage the queue, and inspect repeated media faster.</h1>
                <p className="hero-copy mt-4">
                  The app is strongest when it helps you move through three decisions in order: trigger a crawl,
                  find what still needs attention, and inspect clusters that repeat across posts.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="#run-control" className="tt-button">
                    <span>Start a run</span>
                  </a>
                  <a href="#usage-queue" className="tt-link">
                    <span>Review queue</span>
                  </a>
                  <Link href="/tweets" className="tt-link">
                    <span>Browse tweets</span>
                  </Link>
                  <Link href="/replies" className="tt-link">
                    <span>Open reply lab</span>
                  </Link>
                  <Link href="/wishlist" className="tt-link">
                    <span>Open wishlist</span>
                  </Link>
                  <Link href="/drafts" className="tt-link">
                    <span>Open drafts</span>
                  </Link>
                  <Link href="/topics" className="tt-link">
                    <span>Open topics</span>
                  </Link>
                  <Link href="/matches" className="tt-link">
                    <span>Open match explorer</span>
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <article className="metric-card">
                  <div className="tt-data-label">1. Capture</div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-100">Trigger a crawl or capture the current tab.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Use run control when you need fresh data or a one-off current page snapshot.</p>
                </article>
                <article className="metric-card">
                  <div className="tt-data-label">2. Triage</div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-100">Filter the queue down to pending, matched, or starred assets.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Search by author or tweet text, then expand only the items that need analysis.</p>
                </article>
                <article className="metric-card">
                  <div className="tt-data-label">3. Inspect</div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-100">Jump into detailed usage pages when repeats matter.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Open matches for cluster-level review and similarity context.</p>
                </article>
              </div>
            </div>

            <div className="dashboard-stat-grid">
              <div className="metric-card">
                <div className="tt-data-label">Pending Media</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-accent">
                  {pendingCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{statLabel(pendingCount, "usage")} awaiting analysis.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Complete</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-cyan">
                  {completedCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Analyzed and ready for retrieval.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Similarity Hits</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-magenta">
                  {phashMatchedUsageCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Usages tied to visually similar assets.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Starred</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-slate-100">
                  {starredCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Assets flagged for follow-up.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Text-Only Tweets</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-orange">
                  {textOnlyTweetCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Saved from crawl, excluded from media analysis.</p>
              </div>
              <div className="metric-card">
                <div className="tt-data-label">Fresh Topics</div>
                <div className="mt-3 font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.08em] text-lime-300">
                  {freshTopicCount}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Clusters still worth posting into.</p>
              </div>
            </div>
          </div>

          <div className="surface-divider mt-6 pt-6">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Latest Crawl Run</div>
                <div className="mt-3 break-all font-[family:var(--font-mono)] text-xs uppercase tracking-[0.12em] text-slate-100">
                  {latestManifest?.runId ?? "none"}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {data.totalTweetCount} tweets indexed across {data.manifests.length} cached runs. {tweetsWithMediaCount} include media.
                </p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Next Move</div>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {pendingCount > 0 ? "Open the queue and analyze pending usages." : "Use the match explorer to inspect repeated assets."}
                </p>
              </div>
              <div className="tt-subpanel-soft">
                <div className="tt-data-label">Data Source</div>
                <p className="mt-3 text-sm leading-6 text-slate-200">Dashboard reads directly from local JSON artifacts in `data/`.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ControlPanel schedulerConfig={data.schedulerConfig} runHistory={data.runHistory} />

      <div id="usage-queue" className="relative z-10 mb-8">
        <UsageQueue usages={data.tweetUsages} />
      </div>

      <TopicClusters
        topics={data.topicClusters.map((topic) => ({
          ...topic,
          groundedNews: groundedNewsByTopicId.get(topic.topicId) ?? null
        }))}
        groundedNewsEnabled={isGroundedTopicNewsEnabled()}
        draftTopicBasePath="/topics"
      />

      <CapturedTweetQueue tweets={data.capturedTweets} />

      <div id="facet-search">
        <FacetSearch />
      </div>

      <ReplyMediaWishlist entries={data.replyMediaWishlist} />

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Pipeline View</div>
              <h2 className="section-title mt-2">Capture. Promote. Analyze.</h2>
            </div>
            <div className="tt-chip tt-chip-accent">{completedCount} complete</div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="neon-card">
              <div className="section-kicker">Stage 1</div>
              <h3 className="mt-3 font-[family:var(--font-heading)] text-lg font-bold uppercase tracking-[0.14em] text-accent">
                Capture
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Preserve tweet HTML, author context, media URLs, previews, and platform metrics.
              </p>
            </article>
            <article className="neon-card">
              <div className="section-kicker">Stage 2</div>
              <h3 className="mt-3 font-[family:var(--font-heading)] text-lg font-bold uppercase tracking-[0.14em] text-magenta">
                Promotion
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Keep storage light until an asset repeats enough to justify deeper processing.
              </p>
            </article>
            <article className="neon-card">
              <div className="section-kicker">Stage 3</div>
              <h3 className="mt-3 font-[family:var(--font-heading)] text-lg font-bold uppercase tracking-[0.14em] text-cyan">
                Analysis
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Fill semantic facets for retrieval, grouping, and triage across the saved usage set.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="relative z-10 mt-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Crawl Runs</div>
              <h2 className="section-title mt-2">Raw timeline manifests</h2>
            </div>
            <div className="tt-chip">{data.manifests.length} runs cached</div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.manifests.length === 0 ? (
              <article className="neon-card">
                <div className="tt-placeholder">No crawl manifests yet. Run `npm run crawl:x-api` to pull the home timeline through the X API.</div>
              </article>
            ) : (
              data.manifests.map((manifest) => (
                <article key={manifest.runId} className="neon-card">
                  <div className="section-kicker">Run</div>
                  <h3 className="mt-2 break-all font-[family:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-cyan">
                    {manifest.runId}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="tt-chip">{manifest.capturedTweets.length} tweets</span>
                    <span className="tt-chip">{manifest.interceptedMedia.length} intercepted</span>
                    <span className={`tt-chip ${manifest.downloadVideos ? "tt-chip-accent" : "tt-chip-warning"}`}>
                      videos {manifest.downloadVideos ? "enabled" : "deferred"}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
