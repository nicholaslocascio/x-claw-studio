import Link from "next/link";
import type { GroundedTopicNews, TopicClusterRecord } from "@/src/lib/types";

export function formatTopicClusterDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function TopicClusterCard(props: {
  topic: TopicClusterRecord & { groundedNews?: GroundedTopicNews | null };
  groundedNewsEnabled?: boolean;
  draftTopicBasePath?: string;
}) {
  const { topic } = props;

  return (
    <article className="neon-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-kicker">{topic.kind}</div>
          <h3 className="mt-2 truncate text-lg font-semibold text-slate-100">{topic.label}</h3>
        </div>
        <div className={`tt-chip ${topic.isStale ? "tt-chip-warning" : "tt-chip-accent"}`}>
          hot {topic.hotnessScore.toFixed(2)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="tt-chip">{topic.tweetCount} tweets</span>
        <span className="tt-chip">{topic.uniqueAuthorCount} authors</span>
        <span className="tt-chip">{topic.totalLikes} likes</span>
        <span className={`tt-chip ${topic.recentTweetCount24h > 0 ? "tt-chip-accent" : ""}`}>
          {topic.recentTweetCount24h} in 24h
        </span>
        <span className={`tt-chip ${topic.isStale ? "tt-chip-warning" : ""}`}>
          {topic.isStale ? "stale" : "fresh"}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">
        Most recent mention: {formatTopicClusterDate(topic.mostRecentAt)}.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="tt-subpanel-soft">
          <strong className="tt-data-label">Tweet Ideas</strong>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-200">
            {(topic.groundedNews?.suggestedAngles?.length ? topic.groundedNews.suggestedAngles : topic.suggestedAngles).map((angle) => (
              <li key={angle}>{angle}</li>
            ))}
          </ul>
        </div>
        <div className="tt-subpanel-soft">
          <strong className="tt-data-label">Examples</strong>
          <div className="mt-2 space-y-2">
            {topic.representativeTweets.map((tweet) => (
              <div key={tweet.tweetKey} className="text-sm leading-6 text-slate-200">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  {tweet.authorUsername ? `@${tweet.authorUsername}` : "unknown"} • {formatTopicClusterDate(tweet.createdAt)}
                </div>
                <p className="mt-1 line-clamp-3">{tweet.text ?? "No tweet text captured."}</p>
                {props.draftTopicBasePath && tweet.tweetId ? (
                  <div className="mt-2">
                    <Link
                      href={`${props.draftTopicBasePath}?composeTopicId=${encodeURIComponent(topic.topicId)}&composeMode=reply_to_example&composeReplyTweetId=${encodeURIComponent(tweet.tweetId)}#topic-composer`}
                      className="tt-link"
                    >
                      <span>Reply to this example</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {topic.groundedNews ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
          <div className="tt-subpanel-soft">
            <strong className="tt-data-label">Grounded News</strong>
            <p className="mt-2 text-sm leading-6 text-slate-200">{topic.groundedNews.summary}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{topic.groundedNews.whyNow}</p>
            {topic.groundedNews.searchQueries.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {topic.groundedNews.searchQueries.map((query) => (
                  <span key={query} className="tt-chip">
                    {query}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="tt-subpanel-soft">
            <strong className="tt-data-label">Sources</strong>
            <div className="mt-2 space-y-2">
              {topic.groundedNews.sources.map((source) => (
                <Link key={source.uri} href={source.uri} className="tt-link block" target="_blank" rel="noreferrer">
                  <span>{source.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : props.groundedNewsEnabled ? (
        <div className="mt-4 tt-subpanel-soft">
          <strong className="tt-data-label">Grounded News</strong>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            No grounded article cache yet for this topic.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {props.draftTopicBasePath ? (
          <Link href={`${props.draftTopicBasePath}?composeTopicId=${encodeURIComponent(topic.topicId)}&autoCompose=1#topic-composer`} className="tt-button">
            <span>Draft tweet</span>
          </Link>
        ) : null}
        <Link href="/tweets" className="tt-link">
          <span>Browse tweets</span>
        </Link>
        <Link href="/matches" className="tt-link">
          <span>Open matches</span>
        </Link>
        <Link href="/topics" className="tt-link">
          <span>Open topics</span>
        </Link>
      </div>
    </article>
  );
}

export function TopicClusters(props: {
  topics: Array<TopicClusterRecord & { groundedNews?: GroundedTopicNews | null }>;
  groundedNewsEnabled?: boolean;
  limit?: number;
  sectionLabel?: string;
  sectionTitle?: string;
  sectionDescription?: string;
  draftTopicBasePath?: string;
}) {
  const visibleTopics = props.topics.slice(0, props.limit ?? 8);

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">{props.sectionLabel ?? "Topic Radar"}</div>
            <h2 className="section-title mt-3">{props.sectionTitle ?? "What looks active enough to post about."}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              {props.sectionDescription ??
                "These clusters are built from tweet text plus saved usage analysis. Recency still matters, but older high-signal chatter can hold its ground."}
            </p>
          </div>
          <div className="tt-chip tt-chip-accent">{props.topics.length} topics</div>
        </div>

        {visibleTopics.length === 0 ? (
          <div className="tt-placeholder">No topic clusters yet. Capture tweets first.</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleTopics.map((topic) => (
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
