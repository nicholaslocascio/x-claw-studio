import Link from "next/link";
import { CapturedTweetQueue } from "@/src/components/captured-tweet-queue";
import { CAPTURED_TWEET_PAGE_SIZE, getCapturedTweetPage, getDashboardData } from "@/src/server/data";

export default async function TweetsPage(props: {
  searchParams?: Promise<{
    page?: string;
    query?: string;
    filter?: string;
  }>;
}) {
  const data = getDashboardData();
  const searchParams = (await props.searchParams) ?? {};
  const page = Number.parseInt(searchParams.page ?? "1", 10);
  const pagedTweets = getCapturedTweetPage({
    tweets: data.capturedTweets,
    page: Number.isFinite(page) ? page : 1,
    pageSize: CAPTURED_TWEET_PAGE_SIZE,
    query: searchParams.query,
    tweetFilter: searchParams.filter
  });

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Tweet Browser</div>
            <div className="type-cursor mt-2 font-[family:var(--font-label)] text-xs uppercase tracking-[0.22em] text-muted">
              &gt; Full captured timeline with reply tools
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
              <h1 className="section-title mt-1">All captured tweets</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                This view reuses the captured-tweets browser, starts on all tweets, and keeps reply composition available for both media and text-only posts.
              </p>
            </div>
            <Link href="/" className="tt-link">
              <span>Back to dashboard</span>
            </Link>
            <Link href="/replies" className="tt-link">
              <span>Open reply lab</span>
            </Link>
          </div>
        </div>
      </section>

      <CapturedTweetQueue
        key={`${pagedTweets.page}:${pagedTweets.tweetFilter}:${pagedTweets.query}`}
        tweets={pagedTweets.tweets}
        initialTweetFilter={pagedTweets.tweetFilter}
        initialQuery={pagedTweets.query}
        pagination={pagedTweets}
        sectionLabel="Tweet Browser"
        sectionTitle="Browse every captured tweet and open the reply composer from one place"
        sectionDescription="Search the full crawl, switch between media and text-only posts, and open reply drafting without bouncing between queue views."
      />
    </main>
  );
}
