import Link from "next/link";
import { FacetSearch } from "@/src/components/facet-search";

export default function SearchPage() {
  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Research</div>
            <div className="type-cursor mt-2 text-sm text-muted">
              Search saved images and videos by subject, tone, or message.
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
              <h1 className="section-title mt-1">Media search</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Find reusable media quickly, then open the result you want to draft from.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
              <Link href="/queue" className="tt-link">
                <span>Open review</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <FacetSearch />
    </main>
  );
}
