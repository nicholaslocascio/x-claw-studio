import Link from "next/link";
import { ReplyMediaWishlist } from "@/src/components/reply-media-wishlist";
import { getWishlistPageData } from "@/src/server/data";

export default function WishlistPage() {
  const data = getWishlistPageData();

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Wishlist</div>
            <div className="type-cursor mt-2 font-[family:var(--font-label)] text-xs uppercase tracking-[0.22em] text-muted">
              &gt; Desired assets to source
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
              <h1 className="section-title mt-1">Reply asset wishlist</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                Review the backlog of asset ideas discovered during reply composition, then mark them as collected once they land in the corpus.
              </p>
            </div>
            <Link href="/" className="tt-link">
              <span>Back to dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      <ReplyMediaWishlist entries={data.replyMediaWishlist} />
    </main>
  );
}
