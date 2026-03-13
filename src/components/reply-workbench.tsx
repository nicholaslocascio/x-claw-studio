"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReplyComposer } from "@/src/components/reply-composer";
import type { ReplySourceLookupResult } from "@/src/lib/reply-composer";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function ReplyWorkbench(props: {
  initialUrl?: string;
}) {
  const [xUrl, setXUrl] = useState(props.initialUrl ?? "");
  const [resolved, setResolved] = useState<ReplySourceLookupResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveSource = useCallback(async (nextUrl?: string): Promise<void> => {
    const requestUrl = (nextUrl ?? xUrl).trim();
    if (!requestUrl) {
      setErrorMessage("Paste a single X status URL to load a reply target.");
      setResolved(null);
      return;
    }

    setIsResolving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/reply/source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          xUrl: requestUrl
        })
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load reply source");
      }

      setResolved(body as ReplySourceLookupResult);
    } catch (error) {
      setResolved(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load reply source");
    } finally {
      setIsResolving(false);
    }
  }, [xUrl]);

  useEffect(() => {
    const trimmed = props.initialUrl?.trim();
    if (!trimmed) {
      return;
    }

    void resolveSource(trimmed);
  }, [props.initialUrl, resolveSource]);

  const preferredUrl = getPreferredXStatusUrl(resolved?.subject.tweetUrl ?? resolved?.normalizedUrl ?? null);

  return (
    <>
      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Reply Lab</div>
              <h1 className="section-title mt-3">Load one tweet, analyze it, then generate reply options.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Paste a single X status URL. The app checks local captures first, falls back to the X API when needed, analyzes the first media usage if one exists, then hands the tweet to the shared reply composer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Dashboard</span>
              </Link>
              <Link href="/tweets" className="tt-link">
                <span>Tweet browser</span>
              </Link>
            </div>
          </div>

          <form
            className="grid gap-4 lg:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void resolveSource();
            }}
          >
            <label className="tt-field">
              <span className="tt-field-label">X Status URL</span>
              <input
                type="url"
                value={xUrl}
                onChange={(event) => setXUrl(event.target.value)}
                className="tt-input"
                placeholder="https://x.com/user/status/1234567890"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="tt-button self-end" disabled={isResolving}>
              <span>{isResolving ? "Loading..." : "Load tweet"}</span>
            </button>
          </form>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">1. Resolve</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Use local captures if we already have the tweet. Otherwise fetch and save it through the existing X API capture path.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">2. Analyze</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">If the tweet has media and its first usage is still pending, run the normal analysis pipeline before composing.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">3. Draft</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Use the same shared reply composer for one goal or all goals, with tone, angle, and constraint steering.</p>
            </article>
          </div>

          {errorMessage ? (
            <div className="mt-4 border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>

      {resolved ? (
        <section className="relative z-10 mb-8 terminal-window">
          <div className="window-bar">
            <div>
              <div className="section-kicker">Loaded Tweet</div>
              <div className="mt-2 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-muted">
                &gt; {resolved.tweetId}
              </div>
            </div>
            <div className="window-dots">
              <span className="window-dot bg-orange" />
              <span className="window-dot bg-accent" />
              <span className="window-dot bg-cyan" />
            </div>
          </div>
          <div className="panel-body">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`tt-chip ${resolved.source === "x_api" ? "tt-chip-accent" : ""}`}>
                {resolved.source === "local" ? "loaded from local data" : "captured from X API"}
              </span>
              <span className="tt-chip">
                {resolved.analysisStatus === "complete" ? "analysis ready" : "text-only source"}
              </span>
              <span className="tt-chip">{resolved.subject.mediaKind}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="tt-subpanel">
                <div className="tt-data-label">Tweet</div>
                <div className="mt-3 text-lg leading-8 text-slate-100">
                  {resolved.subject.tweetText?.trim() || "No tweet text captured."}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                  <span>@{resolved.subject.authorUsername ?? "unknown"}</span>
                  <span>{formatDate(resolved.subject.createdAt)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {preferredUrl ? (
                    <a href={preferredUrl} className="tt-link" target="_blank" rel="noreferrer">
                      <span>Open source tweet</span>
                    </a>
                  ) : null}
                  {resolved.usageId ? (
                    <Link href={`/usage/${resolved.usageId}`} className="tt-link">
                      <span>Open usage detail</span>
                    </Link>
                  ) : null}
                </div>
              </article>

              <article className="tt-subpanel-soft">
                <div className="tt-data-label">Analysis Snapshot</div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                  <p><strong className="text-slate-100">Scene:</strong> {resolved.subject.analysis.sceneDescription ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Conveys:</strong> {resolved.subject.analysis.conveys ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Emotion:</strong> {resolved.subject.analysis.primaryEmotion ?? "Not available"}</p>
                  <p><strong className="text-slate-100">Keywords:</strong> {resolved.subject.analysis.searchKeywords.join(", ") || "None"}</p>
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : null}

      {resolved ? (
        <ReplyComposer
          usageId={resolved.usageId ?? undefined}
          tweetId={resolved.tweetId}
          subject={resolved.subject}
        />
      ) : null}
    </>
  );
}
