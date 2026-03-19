import type { ReactNode } from "react";
import Link from "next/link";
import { AnalyzeUsageButton } from "@/src/components/analyze-usage-button";
import { AssetStarButton } from "@/src/components/asset-star-button";
import { MediaTweetComposer } from "@/src/components/media-tweet-composer";
import { MediaPreview } from "@/src/components/media-preview";
import { ReplyComposer } from "@/src/components/reply-composer";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { MediaAssetView, UsageAnalysis } from "@/src/lib/types";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";
import { choosePromotableHlsMasterUrl, choosePromotableVideoUrl } from "@/src/server/media-asset-video";

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function renderValue(value: UsageAnalysis[keyof UsageAnalysis]) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "Not analyzed yet";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null) {
    return "Not analyzed yet";
  }

  return String(value);
}

function uniqueUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function InfoCard(props: { title: string; value: ReactNode; muted?: boolean }) {
  return (
    <article className="tt-subpanel">
      <strong className="tt-data-label">{props.title}</strong>
      <div className={`mt-3 text-sm leading-7 ${props.muted ? "text-muted" : "text-slate-200"}`}>{props.value}</div>
    </article>
  );
}

interface UnifiedMatchItem {
  key: string;
  relationship: "exact" | "similar";
  usageId: string;
  authorUsername: string | null;
  createdAt: string | null;
  tweetText: string | null;
  assetId: string;
  previewUrl: string | null;
  videoFilePath: string | null;
  fallbackVideoUrl: string | null;
  postCount: number;
  similarityScore: number;
  distance: number | null;
  starred: boolean;
}

interface MatchCardAction {
  href: string;
  label: string;
}

interface MatchCardAccordionItem {
  key: string;
  title: string;
  description?: string | null;
}

function MatchCard(props: {
  assetId: string;
  previewUrl: string | null;
  videoFilePath: string | null;
  fallbackVideoUrl: string | null;
  starred: boolean;
  titleChips: ReactNode[];
  bodyText?: string | null;
  actions: MatchCardAction[];
  accordionLabel?: string;
  accordionItems?: MatchCardAccordionItem[];
}) {
  const hasAccordion = (props.accordionItems?.length ?? 0) > 0;

  return (
    <article className="neon-card">
      {props.previewUrl ? (
        <div className="tt-media-frame mb-4 aspect-video">
          <MediaPreview
            alt="related media preview"
            imageUrl={props.previewUrl}
            videoFilePath={props.videoFilePath}
            videoUrl={props.fallbackVideoUrl}
          />
          <div className="absolute right-1.5 top-1.5 z-10">
            <AssetStarButton
              assetId={props.assetId}
              starred={props.starred}
              className={props.starred ? "tt-icon-button tt-icon-button-secondary bg-[#121826]/90" : "tt-icon-button bg-[#121826]/90"}
              wrapperClassName="flex items-center"
            />
          </div>
        </div>
      ) : (
        <div className="mb-4 flex justify-end">
          <AssetStarButton assetId={props.assetId} starred={props.starred} wrapperClassName="flex items-center" />
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">{props.titleChips}</div>
      {props.bodyText ? (
        <div className="tt-subpanel-soft">
          <p className="text-sm leading-7 text-slate-200">{props.bodyText}</p>
        </div>
      ) : null}
      {hasAccordion ? (
        <details open className="mt-4 tt-subpanel-soft">
          <summary className="cursor-pointer list-none font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-cyan">
            {props.accordionLabel ?? "Details"}
          </summary>
          <div className="mt-3 grid gap-3">
            {props.accordionItems?.map((item) => (
              <div key={item.key} className="border border-white/10 bg-black/10 p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-cyan">{item.title}</div>
                {item.description ? <p className="mt-2 text-sm leading-6 text-slate-200">{item.description}</p> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {props.actions.map((action) => (
          <Link key={action.href} href={action.href} className="tt-link">
            <span>{action.label}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}

export function AnalysisDetail(props: {
  usageId: string;
  tweetId: string | null;
  mediaIndex: number;
  tweet: {
    tweetUrl: string | null;
    text: string | null;
    authorUsername: string | null;
    createdAt: string | null;
  };
  media: {
    sourceUrl: string | null;
    posterUrl: string | null;
    previewUrl: string | null;
    mediaKind: string;
  };
  orderedFacets: Array<{ name: string; value: UsageAnalysis[keyof UsageAnalysis] }>;
  mediaAssetView: MediaAssetView | null;
  relevantTopics: Array<{
    id: string;
    combinedScore: number;
    topic: {
      topicId: string | null;
      label: string | null;
      hotnessScore: number;
      tweetCount: number;
      isStale: boolean;
    };
    analysis: {
      summaryLabel: string | null;
      isNews: boolean;
      newsPeg: string | null;
      whyNow: string | null;
      sentiment: "positive" | "negative" | "mixed" | "neutral";
      stance: "supportive" | "critical" | "observational" | "celebratory" | "anxious" | "curious" | "mixed";
      emotionalTone: string | null;
      opinionIntensity: "low" | "medium" | "high";
      targetEntity: string | null;
      signals: string[];
    };
    tweet: {
      tweetId: string | null;
      authorUsername: string | null;
      text: string | null;
      createdAt: string | null;
    };
  }>;
}) {
  const usageUrls = uniqueUrls([props.media.sourceUrl, props.media.posterUrl, props.media.previewUrl]);
  const assetSourceUrls = props.mediaAssetView?.asset.sourceUrls ?? [];
  const assetPreviewUrls = props.mediaAssetView?.asset.previewUrls ?? [];
  const assetPosterUrls = props.mediaAssetView?.asset.posterUrls ?? [];
  const allAssetUrls = uniqueUrls([...assetSourceUrls, ...assetPreviewUrls, ...assetPosterUrls]);
  const localAssetFiles = uniqueUrls([
    props.mediaAssetView?.asset.canonicalFilePath ?? null,
    props.mediaAssetView?.asset.promotedVideoFilePath ?? null
  ]);
  const heroMediaUrl = resolveMediaDisplayUrl({
    localFilePath: props.mediaAssetView?.asset.canonicalFilePath ?? null,
    posterUrl: props.media.posterUrl,
    previewUrl: props.media.previewUrl,
    sourceUrl: props.media.sourceUrl
  });
  const heroFallbackVideoUrl = props.mediaAssetView?.asset
    ? choosePromotableVideoUrl(props.mediaAssetView.asset) ?? choosePromotableHlsMasterUrl(props.mediaAssetView.asset)
    : null;
  const tweetUrl = getPreferredXStatusUrl(props.tweet.tweetUrl);
  const exactMatches: UnifiedMatchItem[] = (props.mediaAssetView?.duplicateUsages ?? [])
    .filter((usage) => usage.usageId !== props.usageId)
    .map((usage) => ({
      key: `exact-${usage.usageId}`,
      relationship: "exact",
      usageId: usage.usageId,
      authorUsername: usage.tweet.authorUsername,
      createdAt: usage.tweet.createdAt,
      tweetText: usage.tweet.text,
      assetId: props.mediaAssetView?.asset.assetId ?? "unknown",
      previewUrl: resolveMediaDisplayUrl({
        localFilePath: props.mediaAssetView?.asset.canonicalFilePath ?? null,
        posterUrl: props.mediaAssetView?.asset.posterUrls[0] ?? props.media.posterUrl,
        previewUrl: props.mediaAssetView?.asset.previewUrls[0] ?? props.media.previewUrl,
        sourceUrl: props.mediaAssetView?.asset.canonicalMediaUrl ?? props.media.sourceUrl
      }),
      videoFilePath: props.mediaAssetView?.asset.promotedVideoFilePath ?? null,
      fallbackVideoUrl:
        props.mediaAssetView?.asset
          ? choosePromotableVideoUrl(props.mediaAssetView.asset) ?? choosePromotableHlsMasterUrl(props.mediaAssetView.asset)
          : null,
      postCount: props.mediaAssetView?.duplicateUsages.length ?? 0,
      similarityScore: 1,
      distance: 0,
      starred: props.mediaAssetView?.asset.starred ?? false
    })) ?? [];
  const similarMatches = new Map<string, UnifiedMatchItem>();

  for (const match of props.mediaAssetView?.phashMatches ?? []) {
    const previewUrl = resolveMediaDisplayUrl({
      localFilePath: match.asset.canonicalFilePath,
      posterUrl: match.asset.posterUrls[0],
      previewUrl: match.asset.previewUrls[0],
      sourceUrl: match.asset.canonicalMediaUrl
    });

    for (const usage of match.usages) {
      if (usage.usageId === props.usageId) {
        continue;
      }

      similarMatches.set(usage.usageId, {
        key: `similar-${usage.usageId}`,
        relationship: "similar",
        usageId: usage.usageId,
        authorUsername: usage.tweet.authorUsername,
        createdAt: usage.tweet.createdAt,
        tweetText: usage.tweet.text,
        assetId: match.asset.assetId,
        previewUrl,
        videoFilePath: match.asset.promotedVideoFilePath,
        fallbackVideoUrl: choosePromotableVideoUrl(match.asset) ?? choosePromotableHlsMasterUrl(match.asset),
        postCount: match.usages.length,
        similarityScore: match.similarityScore,
        distance: match.distance,
        starred: match.asset.starred
      });
    }
  }

  const unifiedMatches = [...exactMatches, ...Array.from(similarMatches.values())].sort((left, right) => {
    if (left.relationship !== right.relationship) {
      return left.relationship === "exact" ? -1 : 1;
    }

    if (right.similarityScore !== left.similarityScore) {
      return right.similarityScore - left.similarityScore;
    }

    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  });
  const duplicateCount = unifiedMatches.length;
  const relevantTopics = props.relevantTopics.slice(0, 6);
  const facetMap = new Map(props.orderedFacets.map((facet) => [facet.name, facet.value]));
  const summarySections = [
    {
      title: "What it shows",
      items: [
        { label: "Scene", value: facetMap.get("scene_description") },
        { label: "Caption", value: facetMap.get("caption_brief") },
        { label: "Primary emotion", value: facetMap.get("primary_emotion") }
      ]
    },
    {
      title: "Intent",
      items: [
        { label: "What it conveys", value: facetMap.get("conveys") },
        { label: "User intent", value: facetMap.get("user_intent") },
        { label: "Role", value: facetMap.get("rhetorical_role") }
      ]
    },
    {
      title: "Why it works",
      items: [
        { label: "Text and media", value: facetMap.get("text_media_relationship") },
        { label: "Why it works", value: facetMap.get("why_it_works") },
        { label: "Audience takeaway", value: facetMap.get("audience_takeaway") }
      ]
    },
    {
      title: "References",
      items: [
        { label: "Metaphor", value: facetMap.get("metaphor") },
        { label: "Cultural reference", value: facetMap.get("cultural_reference") },
        { label: "Analogy target", value: facetMap.get("analogy_target") }
      ]
    }
  ];

  return (
    <main className="app-shell">
      <div className="bg-sun" />
      <div className="bg-grid-floor" />

      <section className="relative z-10 mb-8 terminal-window">
        <div className="window-bar">
          <div>
            <div className="section-kicker">Media detail</div>
            <div className="mt-2 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.22em] text-muted">
              &gt; {props.usageId}
            </div>
          </div>
          <div className="window-dots">
            <span className="window-dot bg-orange" />
            <span className="window-dot bg-accent" />
            <span className="window-dot bg-cyan" />
          </div>
        </div>
        <div className="panel-body">
          <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
            <AnalyzeUsageButton
              tweetId={props.tweetId}
              mediaIndex={props.mediaIndex}
              className="tt-button"
            />
            <Link href="/queue" className="tt-link">
              <span>Back to review</span>
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="tt-media-frame min-h-[20rem]">
              <MediaPreview
                alt={props.tweet.text ?? "tweet media"}
                imageUrl={heroMediaUrl}
                videoFilePath={props.mediaAssetView?.asset.promotedVideoFilePath ?? null}
                videoUrl={heroFallbackVideoUrl}
                showVideoByDefault
              />
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="tt-chip">{props.tweet.authorUsername ?? "unknown author"}</span>
                <span className="tt-chip">{props.media.mediaKind}</span>
                <span className="tt-chip">{formatDate(props.tweet.createdAt)}</span>
              </div>
              <div className="tt-subpanel">
                <p className="text-sm leading-7 text-slate-200">{props.tweet.text ?? "No tweet text"}</p>
              </div>
              {tweetUrl ? (
                <div className="flex flex-wrap gap-2">
                  <a href={tweetUrl} target="_blank" rel="noreferrer" className="tt-link">
                    <span>Open tweet</span>
                  </a>
                  <Link href={`/replies?url=${encodeURIComponent(tweetUrl)}`} className="tt-link">
                    <span>Draft reply</span>
                  </Link>
                  {props.tweetId ? (
                    <Link href={`/clone?tweetId=${encodeURIComponent(props.tweetId)}`} className="tt-link">
                      <span>Rewrite this tweet</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <ReplyComposer
        usageId={props.usageId}
        tweetId={props.tweetId}
        subject={{
          usageId: props.usageId,
          tweetId: props.tweetId,
          tweetUrl,
          authorUsername: props.tweet.authorUsername,
          createdAt: props.tweet.createdAt,
          tweetText: props.tweet.text,
          mediaKind: props.media.mediaKind,
          localFilePath: props.mediaAssetView?.asset.canonicalFilePath ?? null,
          playableFilePath: props.mediaAssetView?.asset.promotedVideoFilePath ?? null,
          analysis: {
            captionBrief: props.orderedFacets.find((facet) => facet.name === "caption_brief")?.value as string | null,
            sceneDescription: props.orderedFacets.find((facet) => facet.name === "scene_description")?.value as string | null,
            primaryEmotion: props.orderedFacets.find((facet) => facet.name === "primary_emotion")?.value as string | null,
            conveys: props.orderedFacets.find((facet) => facet.name === "conveys")?.value as string | null,
            userIntent: props.orderedFacets.find((facet) => facet.name === "user_intent")?.value as string | null,
            rhetoricalRole: props.orderedFacets.find((facet) => facet.name === "rhetorical_role")?.value as string | null,
            textMediaRelationship: props.orderedFacets.find((facet) => facet.name === "text_media_relationship")?.value as string | null,
            culturalReference: props.orderedFacets.find((facet) => facet.name === "cultural_reference")?.value as string | null,
            analogyTarget: props.orderedFacets.find((facet) => facet.name === "analogy_target")?.value as string | null,
            searchKeywords: (props.orderedFacets.find((facet) => facet.name === "search_keywords")?.value as string[] | null) ?? []
          }
        }}
      />

      <MediaTweetComposer
        usageId={props.usageId}
        assetId={props.mediaAssetView?.asset.assetId ?? null}
        mediaKind={props.media.mediaKind}
        mediaDisplayUrl={heroMediaUrl}
        videoFilePath={props.mediaAssetView?.asset.promotedVideoFilePath ?? null}
        tweetText={props.tweet.text}
        analysis={{
          conveys: props.orderedFacets.find((facet) => facet.name === "conveys")?.value as string | null,
          primaryEmotion: props.orderedFacets.find((facet) => facet.name === "primary_emotion")?.value as string | null,
          rhetoricalRole: props.orderedFacets.find((facet) => facet.name === "rhetorical_role")?.value as string | null
        }}
        relatedTopics={relevantTopics.map((topic) => ({
          label: topic.topic.label ?? topic.analysis.summaryLabel ?? "Untitled topic",
          hotnessScore: topic.topic.hotnessScore,
          stance: topic.analysis.stance,
          sentiment: topic.analysis.sentiment,
          whyNow: topic.analysis.whyNow
        }))}
      />

      {relevantTopics.length > 0 ? (
        <section className="relative z-10 mb-8 terminal-panel">
          <div className="panel-body">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="section-kicker">Topic links</div>
                <h2 className="section-title mt-3">How this media maps onto live discourse</h2>
              </div>
              <Link href="/topics" className="tt-link">
                <span>Open topics</span>
              </Link>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {relevantTopics.map((topic) => (
                <article key={topic.id} className="tt-subpanel">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="tt-chip tt-chip-accent">{topic.topic.label ?? topic.analysis.summaryLabel ?? "Untitled topic"}</span>
                    <span className="tt-chip">{topic.analysis.stance}</span>
                    <span className="tt-chip">{topic.analysis.sentiment}</span>
                    <span className="tt-chip">{topic.analysis.opinionIntensity} intensity</span>
                    <span className="tt-chip">hotness {topic.topic.hotnessScore.toFixed(1)}</span>
                    <span className="tt-chip">{topic.topic.tweetCount} tweets</span>
                    {topic.topic.isStale ? <span className="tt-chip">stale</span> : null}
                  </div>
                  <div className="space-y-3 text-sm leading-7 text-slate-200">
                    {topic.analysis.whyNow ? <p>{topic.analysis.whyNow}</p> : null}
                    {topic.analysis.newsPeg ? <p className="text-muted">News context: {topic.analysis.newsPeg}</p> : null}
                    <p>{topic.tweet.text ?? "No tweet text"}</p>
                    <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-cyan">
                      {topic.analysis.targetEntity ? <span>target {topic.analysis.targetEntity}</span> : null}
                      {topic.analysis.emotionalTone ? <span>tone {topic.analysis.emotionalTone}</span> : null}
                      {topic.analysis.isNews ? <span>news</span> : null}
                    </div>
                    {topic.analysis.signals.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {topic.analysis.signals.slice(0, 4).map((signal) => (
                          <span key={`${topic.id}-${signal}`} className="tt-chip">
                            {signal}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5">
            <div className="section-kicker">Summary</div>
            <h2 className="section-title mt-3">The clearest read on this media</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {summarySections.map((section) => (
              <article key={section.title} className="tt-subpanel">
                <div className="tt-data-label">{section.title}</div>
                <div className="mt-3 space-y-3">
                  {section.items.map((item) => (
                    <div key={item.label}>
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                      <div className="mt-1 text-sm leading-7 text-slate-200">{renderValue(item.value as UsageAnalysis[keyof UsageAnalysis])}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5">
            <div className="section-kicker">Original Media URLs</div>
            <h2 className="section-title mt-3">Usage-level and asset-level source links</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="tt-subpanel">
              <strong className="tt-data-label">Usage URLs</strong>
              <div className="mt-3 grid gap-2">
                {props.media.sourceUrl ? (
                  <a href={props.media.sourceUrl} target="_blank" rel="noreferrer" className="tt-url">
                    {props.media.sourceUrl}
                  </a>
                ) : (
                  <div className="tt-placeholder">No direct source URL</div>
                )}
                {usageUrls
                  .filter((url) => url !== props.media.sourceUrl)
                  .map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="tt-url">
                      {url}
                    </a>
                  ))}
              </div>
            </article>
            <article className="tt-subpanel">
              <strong className="tt-data-label">Asset URLs</strong>
              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-2">
                {allAssetUrls.length > 0 ? (
                  allAssetUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="tt-url">
                      {url}
                    </a>
                  ))
                ) : (
                  <div className="tt-placeholder">No asset URLs captured</div>
                )}
              </div>
            </article>
            <article className="tt-subpanel">
              <strong className="tt-data-label">Local Asset Files</strong>
              <div className="mt-3 grid gap-2">
                {localAssetFiles.length > 0 ? (
                  localAssetFiles.map((filePath) => (
                    <div key={filePath} className="break-all font-[family:var(--font-mono)] text-sm text-cyan">
                      {filePath}
                    </div>
                  ))
                ) : (
                  <div className="tt-placeholder">No persisted local asset file</div>
                )}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="relative z-10 mb-8 terminal-panel">
        <div className="panel-body">
          <div className="mb-5">
            <div className="section-kicker">Analysis</div>
            <h2 className="section-title mt-3">All facets</h2>
          </div>
          <details className="tt-subpanel-soft">
            <summary className="cursor-pointer list-none font-[family:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-cyan">
              Open full facet grid
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {props.orderedFacets.map((facet) => (
                <InfoCard
                  key={facet.name}
                  title={facet.name}
                  value={renderValue(facet.value)}
                  muted={facet.value === null || (Array.isArray(facet.value) && facet.value.length === 0)}
                />
              ))}
            </div>
          </details>
        </div>
      </section>

      {props.mediaAssetView ? (
        <section className="relative z-10 mb-8 terminal-panel">
          <div className="panel-body">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
            <div className="section-kicker">Related media</div>
                <h2 className="mt-3 break-all font-[family:var(--font-heading)] text-3xl font-black uppercase tracking-[0.14em] text-cyan">
                  {props.mediaAssetView.asset.assetId}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="tt-chip">{props.mediaAssetView.duplicateUsages.length} usages</span>
                <span className={`tt-chip ${props.mediaAssetView.asset.starred ? "tt-chip-accent" : ""}`}>
                  {props.mediaAssetView.asset.starred ? "starred" : "not starred"}
                </span>
                <span className={`tt-chip ${duplicateCount > 0 ? "tt-chip-accent" : ""}`}>repeated {duplicateCount}</span>
                <span className={`tt-chip ${unifiedMatches.length > 0 ? "tt-chip-accent" : ""}`}>matches {unifiedMatches.length}</span>
                <span className="tt-chip">{props.mediaAssetView.summary?.status ?? "unsummarized"}</span>
              </div>
            </div>

            <div className="mb-5">
              <AssetStarButton
                assetId={props.mediaAssetView.asset.assetId}
                starred={props.mediaAssetView.asset.starred}
              />
            </div>

            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <InfoCard
                title="Fingerprint"
                value={props.mediaAssetView.asset.fingerprint?.hex ?? "Unavailable"}
                muted={!props.mediaAssetView.asset.fingerprint?.hex}
              />
              <InfoCard
                title="Canonical File"
                value={props.mediaAssetView.asset.canonicalFilePath ?? "No local file"}
                muted={!props.mediaAssetView.asset.canonicalFilePath}
              />
            </div>

            {props.mediaAssetView.summary?.summary ? (
              <div className="mb-5 grid gap-4 md:grid-cols-2">
                <InfoCard
                  title="Aggregate Conveys"
                  value={renderValue(props.mediaAssetView.summary.summary.conveys)}
                  muted={!props.mediaAssetView.summary.summary.conveys}
                />
                <InfoCard
                  title="Aggregate User Intent"
                  value={renderValue(props.mediaAssetView.summary.summary.user_intent)}
                  muted={!props.mediaAssetView.summary.summary.user_intent}
                />
                <InfoCard
                  title="Aggregate Rhetorical Role"
                  value={renderValue(props.mediaAssetView.summary.summary.rhetorical_role)}
                  muted={!props.mediaAssetView.summary.summary.rhetorical_role}
                />
                <InfoCard
                  title="Aggregate Metaphor"
                  value={renderValue(props.mediaAssetView.summary.summary.metaphor)}
                  muted={!props.mediaAssetView.summary.summary.metaphor}
                />
              </div>
            ) : null}

            {unifiedMatches.length > 0 ? (
              <div className="mb-5">
                <div className="mb-4">
                  <div className="section-kicker">Matches</div>
                  <h2 className="section-title mt-3">Exact and similar media in one view</h2>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {unifiedMatches.map((match) => (
                    <MatchCard
                      key={match.key}
                      assetId={match.assetId}
                      previewUrl={match.previewUrl}
                      videoFilePath={match.videoFilePath}
                      fallbackVideoUrl={match.fallbackVideoUrl}
                      starred={match.starred}
                      titleChips={[
                        <span key="relationship" className={`tt-chip ${match.relationship === "exact" ? "tt-chip-accent" : ""}`}>
                          {match.relationship}
                        </span>,
                        <span key="asset" className="tt-chip">
                          {match.assetId}
                        </span>,
                        <span key="similarity" className="tt-chip">
                          {match.relationship === "exact" ? "same asset" : `similarity ${match.similarityScore.toFixed(3)}`}
                        </span>,
                        ...(match.distance !== null
                          ? [
                              <span key="distance" className="tt-chip">
                                dHash {match.distance}
                              </span>
                            ]
                          : []),
                        <span key="posts" className="tt-chip">
                          {match.postCount} posts
                        </span>,
                        <span key="date" className="tt-chip">
                          {formatDate(match.createdAt)}
                        </span>
                      ]}
                      bodyText={match.tweetText ?? "No tweet text"}
                      actions={[{ href: `/usage/${match.usageId}`, label: `Open ${match.authorUsername ?? "usage"}` }]}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {props.mediaAssetView.nearestNeighbors.length > 0 ? (
              <div>
                <div className="mb-4">
                  <div className="section-kicker">Nearest neighbors</div>
                  <h2 className="section-title mt-3">Closest assets, even below the match threshold</h2>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {props.mediaAssetView.nearestNeighbors.map((match) => {
                    const previewUrl = resolveMediaDisplayUrl({
                      localFilePath: match.asset.canonicalFilePath,
                      posterUrl: match.asset.posterUrls[0],
                      previewUrl: match.asset.previewUrls[0],
                      sourceUrl: match.asset.canonicalMediaUrl
                    });

                    return (
                      <MatchCard
                        key={`neighbor-${match.asset.assetId}`}
                        assetId={match.asset.assetId}
                        previewUrl={previewUrl}
                        videoFilePath={match.asset.promotedVideoFilePath}
                        fallbackVideoUrl={choosePromotableVideoUrl(match.asset) ?? choosePromotableHlsMasterUrl(match.asset)}
                        starred={match.asset.starred}
                        titleChips={[
                          <span key="relationship" className="tt-chip">
                            nearest neighbor
                          </span>,
                          <span key="asset" className="tt-chip">
                            {match.asset.assetId}
                          </span>,
                          <span key="similarity" className="tt-chip">
                            similarity {match.similarityScore.toFixed(3)}
                          </span>,
                          ...(match.distance !== null
                            ? [
                                <span key="distance" className="tt-chip">
                                  dHash {match.distance}
                                </span>
                              ]
                            : []),
                          <span key="posts" className="tt-chip">
                            {match.usages.length} posts
                          </span>
                        ]}
                        bodyText={match.usages[0]?.tweet.text ?? "No tweet text"}
                        accordionLabel={`Related usages (${match.usages.length})`}
                        accordionItems={match.usages.map((usage) => ({
                          key: usage.usageId,
                          title: `${usage.tweet.authorUsername ?? usage.usageId} • ${formatDate(usage.tweet.createdAt)}`,
                          description: usage.tweet.text ?? "No tweet text"
                        }))}
                        actions={match.usages.map((usage) => ({
                          href: `/usage/${usage.usageId}`,
                          label: `Open ${usage.tweet.authorUsername ?? usage.usageId}`
                        }))}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
