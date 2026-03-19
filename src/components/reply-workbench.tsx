"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ManualPostComposer } from "@/src/components/manual-post-composer";
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
  const [mode, setMode] = useState<"reply" | "manual_post">("reply");
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
      <section className="relative z-10 mb-6 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Compose</div>
            <div className="mt-2 text-sm text-muted">
              Reply to a tweet or turn notes into a new post.
            </div>
          </div>
          <div className="window-dots">
            <span className="window-dot bg-orange" />
            <span className="window-dot bg-accent" />
            <span className="window-dot bg-cyan" />
          </div>
        </div>
        <div className="panel-body">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`tt-link ${mode === "reply" ? "tt-chip-accent" : ""}`} onClick={() => setMode("reply")}>
              <span>Reply</span>
            </button>
            <button type="button" className={`tt-link ${mode === "manual_post" ? "tt-chip-accent" : ""}`} onClick={() => setMode("manual_post")}>
              <span>New post</span>
            </button>
          </div>
        </div>
      </section>

      {mode === "manual_post" ? <ManualPostComposer /> : null}

      {mode === "reply" ? (
      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="section-kicker">Reply</div>
              <h1 className="section-title mt-3">Load a tweet and draft a reply</h1>
              <p className="page-intro mt-3 max-w-3xl">
                Paste a tweet URL to pull in the source, review the context, and start drafting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tt-link">
                <span>Back to home</span>
              </Link>
              <Link href="/tweets" className="tt-link">
                <span>Browse tweets</span>
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
              <span className="tt-field-label">Tweet URL</span>
              <input
                type="url"
                value={xUrl}
                onChange={(event) => setXUrl(event.target.value)}
                className="tt-input"
                placeholder="https://x.com/.../status/..."
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
              <div className="tt-data-label">1. Load</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Bring in the tweet from saved data or capture it now if it is missing.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">2. Review</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Check the source tweet and any saved analysis before you draft.</p>
            </article>
            <article className="tt-subpanel-soft">
              <div className="tt-data-label">3. Draft</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">Generate a reply, refine the angle, and save the version you want to keep.</p>
            </article>
          </div>

          {errorMessage ? (
            <div className="mt-4 border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {mode === "reply" && resolved ? (
        <section className="relative z-10 mb-8 terminal-window">
          <div className="window-bar">
            <div>
              <div className="section-kicker">Loaded tweet</div>
              <div className="mt-2 font-[family:var(--font-mono)] text-xs tracking-[0.18em] text-muted">
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
                {resolved.source === "local" ? "loaded from saved data" : "captured from X"}
              </span>
              <span className={`tt-chip ${resolved.analysisStatus === "pending" ? "tt-chip-accent" : ""}`}>
                {resolved.analysisStatus === "complete"
                  ? "analysis ready"
                  : resolved.analysisStatus === "pending"
                    ? "analysis running"
                    : "text only"}
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
                      <span>Open media detail</span>
                    </Link>
                  ) : null}
                </div>
              </article>

              <article className="tt-subpanel-soft">
                <div className="tt-data-label">Analysis snapshot</div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                  {resolved.analysisStatus === "pending" ? (
                    <p className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-slate-100">
                      The tweet is loaded. Media analysis is still running in the background, so drafting can start before these fields fill in.
                    </p>
                  ) : null}
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

      {mode === "reply" && resolved ? (
        <ReplyComposer
          usageId={resolved.usageId ?? undefined}
          tweetId={resolved.tweetId}
          subject={resolved.subject}
        />
      ) : null}
    </>
  );
}
