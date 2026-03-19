import Link from "next/link";
import { PriorityAccountsPanel } from "@/src/components/priority-accounts-panel";
import { formatPriorityAccountHandles, readPriorityAccountsConfig } from "@/src/server/priority-accounts";

export default function PriorityAccountsPage() {
  const config = readPriorityAccountsConfig();

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Capture</div>
            <div className="type-cursor mt-2 text-sm text-muted">Keep a close watch on the accounts that set your agenda.</div>
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
              <h1 className="section-title mt-1">Priority accounts</h1>
              <p className="page-intro mt-4 max-w-3xl">
                Save the accounts you care about most so the system separately checks them every day, captures any new posts,
                and treats them as higher-signal authors elsewhere.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/control" className="tt-link">
                <span>Back to capture</span>
              </Link>
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PriorityAccountsPanel config={config} handles={formatPriorityAccountHandles(config)} />
    </main>
  );
}
