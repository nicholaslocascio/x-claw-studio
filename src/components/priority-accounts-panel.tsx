"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PriorityAccountsConfig } from "@/src/lib/types";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function PriorityAccountsPanel(props: {
  config: PriorityAccountsConfig;
  handles: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(props.config.enabled);
  const [handles, setHandles] = useState(props.handles);
  const [message, setMessage] = useState<string | null>(null);

  async function save(): Promise<void> {
    const response = await fetch("/api/priority-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        handles
      })
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setMessage(data?.error || "Failed to save priority accounts");
      return;
    }

    setMessage("Priority accounts saved.");
    router.refresh();
  }

  async function runNow(): Promise<void> {
    const response = await fetch("/api/control/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "capture_priority_accounts"
      })
    });
    const data = (await response.json().catch(() => null)) as { error?: string; runControlId?: string } | null;

    if (!response.ok) {
      setMessage(data?.error || "Failed to start priority-account capture");
      return;
    }

    setMessage(`Started priority-account capture: ${data?.runControlId ?? "running"}`);
    router.refresh();
  }

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Priority Accounts</div>
            <h2 className="section-title mt-3">Watch the accounts that matter most</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Add the X accounts you care about most. When the scheduler is on, the system runs a separate daily capture
              for them, pulls any new posts, and gives those authors extra weight in topic and trend surfaces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="tt-chip tt-chip-accent">{props.config.accounts.length} tracked</span>
            <span className="tt-chip">{props.config.enabled ? "daily capture on" : "daily capture off"}</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="tt-subpanel-soft">
            <label className="tt-field">
              <span className="tt-field-label">Priority accounts</span>
              <textarea
                value={handles}
                onChange={(event) => setHandles(event.target.value)}
                className="tt-input min-h-[16rem]"
                placeholder={"@sama\n@ycombinator\n@OpenAI"}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
                <span>Run a separate daily scrape for these accounts when the scheduler fires</span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="tt-button" disabled={isPending} onClick={() => startTransition(() => void save())}>
                <span>Save accounts</span>
              </button>
              <button type="button" className="tt-link" disabled={isPending} onClick={() => startTransition(() => void runNow())}>
                <span>Run capture now</span>
              </button>
              {message ? <span className="tt-chip tt-chip-accent">{message}</span> : null}
            </div>
          </div>

          <div className="tt-subpanel-soft">
            <div className="tt-data-label">Tracked accounts</div>
            <div className="mt-4 space-y-3">
              {props.config.accounts.length === 0 ? (
                <div className="tt-placeholder">No priority accounts saved yet.</div>
              ) : (
                props.config.accounts.map((account) => (
                  <article key={account.key} className="rounded border border-cyan/15 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-[family:var(--font-heading)] text-lg font-black uppercase tracking-[0.08em] text-cyan">
                          @{account.username}
                        </div>
                        {account.label ? <div className="mt-1 text-sm text-slate-300">{account.label}</div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="tt-chip">{account.lastCaptureCount} last run</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      <div>Last checked: {formatDate(account.lastCheckedAt)}</div>
                      <div>Last captured: {formatDate(account.lastCapturedAt)}</div>
                      <div>Last seen tweet: {account.lastSeenTweetId ?? "none yet"}</div>
                      {account.lastError ? <div className="text-orange-300">Last error: {account.lastError}</div> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
