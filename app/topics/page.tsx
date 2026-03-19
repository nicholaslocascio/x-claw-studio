import Link from "next/link";
import { TopicExplorer } from "@/src/components/topic-explorer";
import { TopicSearch } from "@/src/components/topic-search";
import { TopicTweetComposer } from "@/src/components/topic-tweet-composer";
import { getTopicClusterPage, getTopicPageData, TOPIC_CLUSTER_PAGE_SIZE } from "@/src/server/data";
import { getGroundedTopicNews, isGroundedTopicNewsEnabled } from "@/src/server/topic-grounded-news";

export default async function TopicsPage(props: {
  searchParams?: Promise<{
    composeTopicId?: string;
    autoCompose?: string;
    composeMode?: string;
    composeReplyTweetId?: string;
    page?: string;
    pageSize?: string;
    query?: string;
    sort?: string;
    freshness?: string;
    kind?: string;
  }>;
}) {
  const data = getTopicPageData();
  const searchParams = (await props.searchParams) ?? {};
  const groundedNewsByTopicId = await getGroundedTopicNews(data.topicClusters, { refreshIfStale: false });
  const enrichedTopics = data.topicClusters.map((topic) => ({
    ...topic,
    groundedNews: groundedNewsByTopicId.get(topic.topicId) ?? null
  }));
  const page = Number.parseInt(searchParams.page ?? "1", 10);
  const pageSize = Number.parseInt(searchParams.pageSize ?? String(TOPIC_CLUSTER_PAGE_SIZE), 10);
  const pagedTopics = getTopicClusterPage({
    topics: enrichedTopics,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : TOPIC_CLUSTER_PAGE_SIZE,
    query: searchParams.query,
    sort: searchParams.sort,
    freshness: searchParams.freshness,
    kind: searchParams.kind
  });
  const availableKinds = Array.from(new Set(data.topicClusters.map((topic) => topic.kind))).sort();
  const kindCounts = Object.fromEntries(
    availableKinds.map((kind) => [kind, data.topicClusters.filter((topic) => topic.kind === kind).length])
  );
  const freshestMentionAt =
    data.topicClusters.reduce<string | null>((latest, topic) => {
      if (!topic.mostRecentAt) {
        return latest;
      }

      if (!latest || Date.parse(topic.mostRecentAt) > Date.parse(latest)) {
        return topic.mostRecentAt;
      }

      return latest;
    }, null) ?? null;

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Research</div>
            <div className="type-cursor mt-2 text-sm text-muted">
              See what themes are active in your saved tweets and turn them into post ideas.
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
              <h1 className="section-title mt-1">Topics</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Pick a live topic, draft into it, then browse the wider topic index when you need more range.
              </p>
            </div>
            <Link href="/" className="tt-link">
              <span>Back to home</span>
            </Link>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <article className="tt-lead-card">
              <div className="tt-data-label">Compose first</div>
              <p className="mt-3 text-base leading-7 text-slate-100">
                Start from one topic you can post into now, not the whole list at once.
              </p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">Fresh topics</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">{pagedTopics.counts.fresh} still look timely.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">Index updated</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">{data.topicIndex.generatedAt}</p>
            </article>
          </div>
        </div>
      </section>

      <TopicTweetComposer
        topics={enrichedTopics}
        initialTopicId={searchParams.composeTopicId}
        initialComposeMode={searchParams.composeMode === "reply_to_example" ? "reply_to_example" : "new_post"}
        initialReplyTweetId={searchParams.composeReplyTweetId}
        autoComposeOnMount={searchParams.autoCompose === "1"}
      />

      <TopicExplorer
        key={`${pagedTopics.page}:${pagedTopics.pageSize}:${pagedTopics.query}:${pagedTopics.sort}:${pagedTopics.freshness}:${pagedTopics.kind}`}
        topics={pagedTopics.topics}
        pagination={pagedTopics}
        generatedAt={data.topicIndex.generatedAt}
        freshestMentionAt={freshestMentionAt}
        availableKinds={availableKinds}
        kindCounts={kindCounts}
        groundedNewsEnabled={isGroundedTopicNewsEnabled()}
        draftTopicBasePath="/topics"
      />

      <TopicSearch />
    </main>
  );
}
