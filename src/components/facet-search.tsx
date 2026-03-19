"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AssetStarButton } from "@/src/components/asset-star-button";
import { ANALYSIS_FACET_NAMES, type AnalysisFacetName } from "@/src/lib/analysis-schema";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import { MediaPreview } from "@/src/components/media-preview";
import { ReplyComposer } from "@/src/components/reply-composer";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";
import type { HybridSearchResult } from "@/src/server/chroma-facets";

const DEFAULT_VISIBLE_GRID_COUNT = 12;

const COMMON_FACET_PRESETS: Record<string, string[]> = {
  all: [
    "reaction image",
    "anxiety",
    "bullish chart",
    "terminal screenshot",
    "product UI",
    "celebrity",
    "text overlay",
    "watermark",
    "silicon photonics",
    "meme format"
  ],
  primary_emotion: ["anxiety", "awe", "confidence", "humor", "curiosity", "urgency", "dread", "calm"],
  emotional_tone: ["tense", "playful", "aspirational", "analytical", "sarcastic", "urgent", "confident", "chaotic"],
  conveys: ["competence", "urgency", "status", "optimism", "panic", "humor", "novelty", "technical authority"],
  user_intent: ["educate", "persuade", "show progress", "signal taste", "sell product", "provoke reaction"],
  rhetorical_role: ["reaction", "evidence", "explainer", "demo", "announcement", "flex", "meme"],
  text_media_relationship: ["reinforces text", "contrasts text", "visual proof", "reframes claim", "literal illustration"],
  video_music: ["dramatic score", "upbeat music", "no music", "ambient soundtrack", "unclear audio"],
  video_sound: ["dialogue", "ambient room noise", "crowd noise", "sound effects", "silence"],
  video_dialogue: ["what is said", "spoken line", "quote from clip", "dialogue transcript", "unclear speech"],
  video_action: ["talking to camera", "screen recording walkthrough", "fast cuts", "crowd reaction", "product demo motion"],
  metaphor: ["human vs machine", "signal vs noise", "speed as power", "light as information", "agency as company"],
  humor_mechanism: ["irony", "absurdity", "juxtaposition", "deadpan", "exaggeration"],
  cultural_reference: ["Silicon Valley", "Wall Street", "startup Twitter", "anime", "sci-fi"],
  reference_entity: ["Jian-Yang", "Elon Musk", "Paul Atreides", "Wojak", "Drake"],
  reference_source: ["Silicon Valley", "Dune", "Twitter/X", "The Matrix", "anime"],
  reference_plot_context: ["copycat startup", "IP theft", "founder meltdown", "chosen one arc", "corporate rivalry"],
  analogy_target: ["AI model distillation", "copycat startup", "US-China AI rivalry", "founder culture", "tech bootlegging"],
  analogy_scope: ["personal", "company", "market", "geopolitical", "company, geopolitical"],
  meme_format: ["reaction image", "screenshot meme", "quote card", "chart meme", "before and after"],
  persuasion_strategy: ["authority", "social proof", "fear", "aspiration", "novelty", "clarity"],
  trend_signal: ["AI agents", "crypto", "founder brand", "productivity", "deep tech", "design tools"],
  reuse_pattern: ["reaction reuse", "screenshot repost", "template graphic", "founder flex asset", "chart reuse"],
  why_it_works: ["instantly legible", "status signaling", "high novelty", "strong contrast", "dense proof"],
  audience_takeaway: ["this is real", "this is urgent", "this is impressive", "this is easy", "this is the future"],
  search_keywords: ["chart", "dashboard", "terminal", "agent", "meme", "founder", "AI", "reaction"],
  has_celebrity: ["true", "false"],
  has_human_face: ["true", "false"],
  features_female: ["true", "false"],
  features_male: ["true", "false"],
  has_screenshot_ui: ["true", "false"],
  has_text_overlay: ["true", "false"],
  has_chart_or_graph: ["true", "false"],
  has_logo_or_watermark: ["true", "false"]
};

function getFacetPresets(facetName: string): string[] {
  if (!facetName) {
    return COMMON_FACET_PRESETS.all;
  }

  return COMMON_FACET_PRESETS[facetName] ?? COMMON_FACET_PRESETS.all;
}

function getGridClassName(gridColumns: number): string {
  if (gridColumns <= 1) {
    return "grid gap-4 grid-cols-1";
  }

  if (gridColumns === 2) {
    return "grid gap-4 grid-cols-1 md:grid-cols-2";
  }

  if (gridColumns === 3) {
    return "grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  }

  return "grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4";
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function FacetSearch() {
  const [query, setQuery] = useState("");
  const [facetName, setFacetName] = useState("");
  const [presetValue, setPresetValue] = useState("");
  const [limit, setLimit] = useState("20");
  const [highQualityOnly, setHighQualityOnly] = useState(true);
  const [allFacetsMode, setAllFacetsMode] = useState<"facet_concat" | "combined_blob">("combined_blob");
  const [gridColumns, setGridColumns] = useState(3);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_GRID_COUNT);
  const [results, setResults] = useState<HybridSearchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [openComposerRowId, setOpenComposerRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const openComposerRef = useRef<HTMLDivElement | null>(null);
  const presetTerms = getFacetPresets(facetName);
  const rows = results?.results ?? [];
  const clampedVisibleCount = rows.length === 0 ? 0 : Math.min(visibleCount, rows.length);
  const visibleRows = rows.slice(0, clampedVisibleCount);

  useEffect(() => {
    if (!openComposerRowId || !openComposerRef.current) {
      return;
    }

    openComposerRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    const focusTarget = openComposerRef.current.querySelector<HTMLElement>(
      "select, input, textarea, button, a[href]"
    );
    focusTarget?.focus({ preventScroll: true });
  }, [openComposerRowId]);

  async function runSearch(): Promise<void> {
    setErrorMessage(null);
    setWarningMessage(null);
    const params = new URLSearchParams({ query, limit });
    if (facetName) {
      params.set("facetName", facetName);
    } else {
      params.set("allFacetsMode", allFacetsMode);
    }
    if (!highQualityOnly) {
      params.set("all", "1");
    }

    const response = await fetch(`/api/search/facets?${params.toString()}`);
    const body = await response.json();

    if (!response.ok) {
      setErrorMessage(body.error || "Search failed");
      return;
    }

    const nextResults = body as HybridSearchResult;
    setResults(nextResults);
    setWarningMessage(nextResults.warningMessage);
    setVisibleCount(
      Math.min(
        nextResults.results.length,
        Math.max(DEFAULT_VISIBLE_GRID_COUNT, Math.min(Number(limit), nextResults.results.length))
      )
    );
  }

  return (
    <section className="relative z-10 mb-8 terminal-panel">
      <div className="panel-body">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="section-kicker">Media search</div>
            <h2 className="section-title mt-3">Find reusable media</h2>
            <p className="page-intro mt-3 max-w-3xl">
              Search saved media by subject, tone, or message, then open the result you want to draft from.
            </p>
          </div>
          <div className="tt-chip tt-chip-accent">{facetName || "all media fields"}</div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">Search</div>
              <div className="window-dots">
                <span className="window-dot bg-orange" />
                <span className="window-dot bg-accent" />
                <span className="window-dot bg-cyan" />
              </div>
            </div>
            <div className="panel-body space-y-4">
              <label className="tt-field">
                <span className="tt-field-label">Search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && query && !isPending) {
                      startTransition(() => void runSearch());
                    }
                  }}
                  type="text"
                  placeholder="reaction image for market panic, product demo clip, bullish chart meme..."
                  className="tt-input"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="tt-field">
                  <span className="tt-field-label">Search within</span>
                  <select
                    value={facetName}
                    onChange={(event) => {
                      const nextFacetName = event.target.value as AnalysisFacetName | "";
                      setFacetName(nextFacetName);
                      setPresetValue("");
                    }}
                    className="tt-select"
                  >
                    <option value="">All media fields</option>
                    {ANALYSIS_FACET_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tt-field">
                  <span className="tt-field-label">Results</span>
                  <select value={limit} onChange={(event) => setLimit(event.target.value)} className="tt-select">
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="40">40</option>
                    <option value="60">60</option>
                    <option value="100">100</option>
                  </select>
                </label>
              </div>
              {!facetName ? (
                <label className="tt-field">
                  <span className="tt-field-label">Search method</span>
                  <select
                    value={allFacetsMode}
                    onChange={(event) => setAllFacetsMode(event.target.value as "facet_concat" | "combined_blob")}
                    className="tt-select"
                  >
                    <option value="facet_concat">Compare each attribute separately</option>
                    <option value="combined_blob">Search the full summary</option>
                  </select>
                </label>
              ) : null}
              <label className="tt-field">
                <span className="tt-field-label">Quick starts</span>
                <select
                  value={presetValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setPresetValue(nextValue);
                    if (nextValue) {
                      setQuery(nextValue);
                    }
                  }}
                  className="tt-select"
                >
                  <option value="">Choose a starting prompt...</option>
                  {presetTerms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {presetTerms.slice(0, 6).map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="tt-chip transition-all duration-150 ease-linear hover:border-cyan hover:text-cyan hover:shadow-[0_0_3px_#00d4ff,0_0_12px_rgba(0,212,255,0.14)]"
                    onClick={() => {
                      setPresetValue(term);
                      setQuery(term);
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
              <label className="tt-field">
                <span className="tt-field-label">Limit results</span>
                <div className="flex items-center gap-3 rounded border border-white/10 bg-[#0f1726] px-3 py-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={highQualityOnly}
                    onChange={(event) => setHighQualityOnly(event.target.checked)}
                    className="accent-cyan"
                  />
                  <span>Only show stronger candidates: starred assets or items with repeat or similarity signals</span>
                </div>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="tt-button"
                  disabled={!query || isPending}
                  onClick={() => startTransition(() => void runSearch())}
                >
                  <span>{isPending ? "Searching..." : "Search"}</span>
                </button>
                {errorMessage ? <div className="tt-chip tt-chip-danger">{errorMessage}</div> : null}
                {warningMessage ? <div className="tt-chip border border-amber-400/40 bg-amber-400/10 text-amber-100">{warningMessage}</div> : null}
              </div>
            </div>
          </div>

          <div className="terminal-window">
            <div className="window-bar">
              <div className="section-kicker">How search works</div>
              <div className="tt-chip">one row per asset</div>
            </div>
            <div className="panel-body space-y-4">
              <div className="tt-subpanel">
                <p className="tt-copy">
                  Search runs across saved media summaries and ranks the closest matches first.
                </p>
              </div>
              {results?.warningMessage ? (
                <div className="tt-subpanel border border-amber-400/30 bg-amber-400/10">
                  <p className="tt-copy text-amber-100">
                    {results.warningMessage}
                  </p>
                </div>
              ) : null}
              <div className="tt-subpanel">
                <p className="tt-copy">
                  Use the default method for broad discovery, or switch methods when you want to search every attribute separately.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="tt-chip">default: stronger candidates only</span>
                <span className="tt-chip">one row per asset</span>
                <span className="tt-chip">default: all media fields</span>
                {!facetName ? <span className="tt-chip">method: {allFacetsMode === "facet_concat" ? "compare separately" : "full summary"}</span> : null}
                <span className="tt-chip">merged ranking</span>
                <span className="tt-chip">limit: {limit}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {warningMessage ? (
            <div className="terminal-window border border-amber-400/30">
              <div className="panel-body">
                <div className="tt-chip border border-amber-400/40 bg-amber-400/10 text-amber-100">
                  {warningMessage}
                </div>
              </div>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <div className="terminal-window">
              <div className="panel-body">
                <div className="tt-placeholder">No results yet. Try a broader phrase or turn off the stronger-candidates filter.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="terminal-window">
                <div className="panel-body">
                  <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_0.7fr]">
                    <div className="tt-subpanel-soft">
                      <div className="tt-data-label">Result Window</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="tt-chip tt-chip-accent">{rows.length} fetched</span>
                        <span className="tt-chip">{visibleRows.length} visible</span>
                        <span className="tt-chip">{results?.query ?? query}</span>
                      </div>
                    </div>
                    <label className="tt-field">
                      <span className="tt-field-label">Cards Per Row: {gridColumns}</span>
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="1"
                        value={gridColumns}
                        onChange={(event) => setGridColumns(Number(event.target.value))}
                        className="accent-cyan"
                      />
                    </label>
                    <label className="tt-field">
                      <span className="tt-field-label">Show In Grid: {clampedVisibleCount}</span>
                      <input
                        type="range"
                        min="1"
                        max={rows.length}
                        step="1"
                        value={clampedVisibleCount}
                        onChange={(event) => setVisibleCount(Number(event.target.value))}
                        className="accent-cyan"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className={getGridClassName(gridColumns)}>
                {visibleRows.map((row) => {
                  const displayUrl = resolveMediaDisplayUrl({
                    localFilePath: row.media?.mediaLocalFilePath,
                    posterUrl: row.media?.posterUrl,
                    previewUrl: row.media?.previewUrl,
                    sourceUrl: row.media?.sourceUrl
                  });
                  const tweetUrl = getPreferredXStatusUrl(row.media?.tweetUrl ?? null);
                  const composerPanelId = `facet-search-reply-composer-${row.id}`;
                  const isComposerOpen = openComposerRowId === row.id;
                  const canComposeReply = Boolean(row.metadata.usage_id && row.metadata.tweet_id);
                  const mediaKind = typeof row.metadata.media_kind === "string" ? row.metadata.media_kind : "unknown";
                  const facetNameLabel = String(row.metadata.facet_name ?? "asset summary");
                  const usageId = typeof row.metadata.usage_id === "string" ? row.metadata.usage_id : null;
                  const tweetId = typeof row.metadata.tweet_id === "string" ? row.metadata.tweet_id : null;

                  return (
                    <article key={row.id} className="neon-card min-w-0">
                      <div className="panel-body space-y-4">
                        {displayUrl ? (
                          <div className="tt-media-frame aspect-video">
                            <MediaPreview
                              alt={row.media?.tweetText ?? String(row.metadata.usage_id ?? "search result media")}
                              imageUrl={displayUrl}
                              videoFilePath={row.media?.mediaPlayableFilePath}
                            />
                            {row.media?.mediaAssetId ? (
                              <div className="absolute right-1.5 top-1.5 z-10">
                                <AssetStarButton
                                  assetId={row.media.mediaAssetId}
                                  starred={row.media.mediaAssetStarred}
                                  className={
                                    row.media.mediaAssetStarred
                                      ? "tt-icon-button tt-icon-button-secondary bg-[#121826]/90"
                                      : "tt-icon-button bg-[#121826]/90"
                                  }
                                  wrapperClassName="flex items-center"
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <strong className="font-[family:var(--font-label)] text-xs uppercase tracking-[0.24em] text-accent">
                              {facetNameLabel}
                            </strong>
                            <div className="mt-2 text-sm text-slate-400">
                              {row.media?.authorUsername ? `@${row.media.authorUsername}` : row.media?.authorDisplayName ?? "Unknown author"} ·{" "}
                              {formatDate(row.media?.createdAt)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="tt-chip">score {row.combinedScore.toFixed(3)}</span>
                            <span className="tt-chip">
                              vector {typeof row.vectorDistance === "number" ? row.vectorDistance.toFixed(4) : "n/a"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="tt-chip">{mediaKind}</span>
                          <span className={`tt-chip ${row.media?.mediaAssetStarred ? "tt-chip-accent" : ""}`}>
                            {row.media?.mediaAssetStarred ? "starred" : "not starred"}
                          </span>
                          <span className={`tt-chip ${(row.media?.duplicateGroupUsageCount ?? 0) > 1 ? "tt-chip-accent" : ""}`}>
                            duplicates {row.media?.duplicateGroupUsageCount ?? 0}
                          </span>
                          <span className={`tt-chip ${(row.media?.hotnessScore ?? 0) >= 4 ? "tt-chip-accent" : ""}`}>
                            hot {(row.media?.hotnessScore ?? 0).toFixed(2)}
                          </span>
                          <span className="tt-chip">via {row.matchedBy.join(" + ")}</span>
                          <span className="tt-chip">lexical {row.lexicalScore.toFixed(3)}</span>
                        </div>
                        <div className="text-sm text-slate-300">
                          asset {String(row.media?.mediaAssetId ?? row.metadata.asset_id ?? "unknown")} · representative usage{" "}
                          {String(row.metadata.usage_id ?? "unknown")}
                        </div>
                        {row.media?.tweetText ? <p className="text-sm leading-7 text-slate-200">{row.media.tweetText}</p> : null}
                        <div className="flex flex-wrap gap-2">
                          {usageId ? (
                            <Link href={`/usage/${usageId}`} className="tt-link">
                              <span>Open usage</span>
                            </Link>
                          ) : null}
                          {tweetUrl ? (
                            <Link href={tweetUrl} className="tt-link" target="_blank" rel="noreferrer">
                              <span>Open on X</span>
                            </Link>
                          ) : null}
                          {tweetUrl ? (
                            <Link href={`/replies?url=${encodeURIComponent(tweetUrl)}`} className="tt-link">
                              <span>Open in reply builder</span>
                            </Link>
                          ) : null}
                          {tweetId ? (
                            <Link href={`/clone?tweetId=${encodeURIComponent(tweetId)}`} className="tt-link">
                              <span>Open in clone builder</span>
                            </Link>
                          ) : null}
                          {canComposeReply ? (
                            <button
                              type="button"
                              className="tt-button"
                              aria-controls={composerPanelId}
                              aria-expanded={isComposerOpen}
                              onClick={() => setOpenComposerRowId((current) => (current === row.id ? null : row.id))}
                            >
                              <span>{isComposerOpen ? "Hide reply composer" : "Compose reply"}</span>
                            </button>
                          ) : null}
                          {row.media?.mediaAssetId ? <span className="tt-chip">{row.media.mediaAssetId}</span> : null}
                        </div>
                        {isComposerOpen && usageId && tweetId ? (
                          <div
                            id={composerPanelId}
                            ref={openComposerRef}
                            className="scroll-mt-24 border-t border-white/10 pt-4"
                          >
                            <ReplyComposer
                              usageId={usageId}
                              tweetId={tweetId}
                              subject={{
                                usageId,
                                tweetId,
                                tweetUrl,
                                authorUsername: row.media?.authorUsername ?? null,
                                createdAt: row.media?.createdAt ?? null,
                                tweetText: row.media?.tweetText ?? null,
                                mediaKind,
                                localFilePath: row.media?.mediaLocalFilePath ?? null,
                                playableFilePath: row.media?.mediaPlayableFilePath ?? null,
                                analysis: {
                                  captionBrief:
                                    typeof row.metadata.caption_brief === "string" ? row.metadata.caption_brief : null,
                                  sceneDescription:
                                    typeof row.metadata.scene_description === "string"
                                      ? row.metadata.scene_description
                                      : null,
                                  primaryEmotion:
                                    typeof row.metadata.primary_emotion === "string"
                                      ? row.metadata.primary_emotion
                                      : null,
                                  conveys: typeof row.metadata.conveys === "string" ? row.metadata.conveys : null,
                                  userIntent:
                                    typeof row.metadata.user_intent === "string" ? row.metadata.user_intent : null,
                                  rhetoricalRole:
                                    typeof row.metadata.rhetorical_role === "string"
                                      ? row.metadata.rhetorical_role
                                      : null,
                                  textMediaRelationship:
                                    typeof row.metadata.text_media_relationship === "string"
                                      ? row.metadata.text_media_relationship
                                      : null,
                                  culturalReference:
                                    typeof row.metadata.cultural_reference === "string"
                                      ? row.metadata.cultural_reference
                                      : null,
                                  analogyTarget:
                                    typeof row.metadata.analogy_target === "string"
                                      ? row.metadata.analogy_target
                                      : null,
                                  searchKeywords: Array.isArray(row.metadata.search_keywords)
                                    ? row.metadata.search_keywords.filter(
                                        (value): value is string => typeof value === "string"
                                      )
                                    : []
                                }
                              }}
                            />
                          </div>
                        ) : null}
                        <pre className="tt-log">{row.document}</pre>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
