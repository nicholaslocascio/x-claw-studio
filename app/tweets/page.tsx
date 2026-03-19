import Link from "next/link";
import { CapturedTweetQueue } from "@/src/components/captured-tweet-queue";
import { CAPTURED_TWEET_PAGE_SIZE, getCapturedTweetData, getCapturedTweetPage } from "@/src/server/data";

export default async function TweetsPage(props: {
  searchParams?: Promise<{
    page?: string;
    query?: string;
    filter?: string;
    sort?: string;
  }>;
}) {
  const data = getCapturedTweetData();
  const searchParams = (await props.searchParams) ?? {};
  const page = Number.parseInt(searchParams.page ?? "1", 10);
  const pagedTweets = getCapturedTweetPage({
    tweets: data.capturedTweets,
    page: Number.isFinite(page) ? page : 1,
    pageSize: CAPTURED_TWEET_PAGE_SIZE,
    query: searchParams.query,
    tweetFilter: searchParams.filter,
    sort: searchParams.sort
  });

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Research</div>
            <div className="type-cursor mt-2 text-sm text-muted">
              Browse saved tweets and jump into reply or rewrite workflows.
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
              <h1 className="section-title mt-1">Captured tweets</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Search the full capture, switch between tweets with and without media, and open a writing workflow when something is worth using.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
              <Link href="/replies" className="tt-link">
                <span>Open compose</span>
              </Link>
              <Link href="/clone" className="tt-link">
                <span>Rewrite a tweet</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CapturedTweetQueue
        key={`${pagedTweets.page}:${pagedTweets.tweetFilter}:${pagedTweets.sort}:${pagedTweets.query}`}
        tweets={pagedTweets.tweets}
        initialTweetFilter={pagedTweets.tweetFilter}
        initialQuery={pagedTweets.query}
        pagination={pagedTweets}
        sectionLabel="Captured tweets"
        sectionTitle="Browse saved tweets"
        sectionDescription="Search saved tweets, switch between posts with and without media, and open compose when you find something useful."
      />
    </main>
  );
}
