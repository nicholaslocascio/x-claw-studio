"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CapturedTweetPage } from "@/src/lib/types";

const CapturedTweetQueue = dynamic(
  () => import("@/src/components/captured-tweet-queue").then((module) => module.CapturedTweetQueue),
  {
    loading: () => <div className="tt-placeholder">Loading captured tweets...</div>
  }
);

const HOME_PREVIEW_LIMIT = 50;

export function HomeCapturedTweetPreview(props: {
  totalCount: number;
  withMediaCount: number;
  withoutMediaCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState<CapturedTweetPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || page || isLoading) {
      return;
    }

    const controller = new AbortController();

    async function loadPage() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/tweets?page=1&limit=${HOME_PREVIEW_LIMIT}&filter=with_media`, {
          signal: controller.signal
        });
        const body = (await response.json()) as CapturedTweetPage | { error?: string };

        if (!response.ok) {
          setError("error" in body && body.error ? body.error : "Failed to load captured tweets.");
          return;
        }

        setPage(body as CapturedTweetPage);
      } catch (loadError) {
        if ((loadError as Error).name === "AbortError") {
          return;
        }

        setError("Failed to load captured tweets.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadPage();

    return () => controller.abort();
  }, [isLoading, isOpen, page]);

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Captured Tweets</div>
            <h2 className="section-title mt-3">Tweet browser</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Load a small preview here, or jump to `/tweets` for the full browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tt-chip tt-chip-accent">{props.totalCount} tweets</div>
            <button
              type="button"
              className="tt-button"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((current) => !current)}
            >
              <span>{isOpen ? "Hide tweets" : "Open tweets"}</span>
            </button>
          </div>
        </div>

        {!isOpen ? (
          <div className="tt-subpanel-soft flex flex-wrap items-center gap-3 text-sm leading-6 text-slate-200">
            <span className="tt-chip tt-chip-accent">{props.withMediaCount} with media</span>
            <span className="tt-chip">{props.withoutMediaCount} text-only</span>
            <span>Closed by default so the homepage does not dump thousands of tweets on you.</span>
          </div>
        ) : null}

        {isOpen && isLoading && !page ? <div className="tt-placeholder">Loading captured tweets...</div> : null}

        {isOpen && error ? <div className="tt-placeholder">{error}</div> : null}

        {isOpen && page ? (
          <CapturedTweetQueue
            tweets={page.tweets}
            initialTweetFilter="with_media"
            countOverrides={{
              with_media: props.withMediaCount,
              without_media: props.withoutMediaCount,
              all: props.totalCount
            }}
            sectionLabel="Captured Tweet Preview"
            sectionTitle="Latest tweets with media"
            sectionDescription="Homepage preview only. It loads after you open it and stays on a 50-tweet media slice."
            visibleCountLabelOverride={`${page.tweets.length} previewed of ${props.withMediaCount} with media`}
          />
        ) : null}
      </div>
    </section>
  );
}
