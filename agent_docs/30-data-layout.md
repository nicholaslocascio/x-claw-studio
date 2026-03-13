# Data Layout

This repo uses the filesystem as the live application store.

## Directory Layout

```text
data/
  raw/
    <run-id>/
      manifest.json
      media/...
  analysis/
    tweet-usages/
      <usageId>.json
    generated-drafts/
      index.json
    topic-tweets/
      <analysisId>.json
    media-assets/
      index.json
      summaries.json
      stars.json
    topics/
      index.json
    reply-media-wishlist.json
    meme-templates/
      index.json
      assets/<template-id>/*
  control/
    scheduler.json
    run-history.json
    logs/*.log
```

## What Each Area Means

### `data/raw/`

Per-crawl artifacts. Each run has a unique run id and a `manifest.json` that includes:

- run metadata
- captured tweets, including text-only posts with an empty `media` array
- intercepted media
- whether images, posters, or videos were downloaded
- native media file paths when type inference succeeds, while raw compatibility `.bin` copies may exist alongside them in `media/`

Primary type: [`CrawlManifest`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

### `data/analysis/tweet-usages/`

Per-usage semantic analysis files. One media usage per file.

Video analyses may include video-only facets such as `video_music`, `video_sound`, `video_dialogue`, and `video_action`.

Primary type: [`UsageAnalysis`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

Written by:

- [`src/server/analysis-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/analysis-store.ts)

### `data/analysis/generated-drafts/`

File-backed history for generated replies and tweets.

`index.json` stores:

- draft kind: reply, topic post, or media-led post
- lifecycle status: running, complete, or failed
- request identifiers such as usage id, tweet id, topic id, or asset id
- latest streamed progress message and detail
- final generated outputs when the run completes
- selected-media metadata for each saved output when the composer picked a concrete candidate, including candidate id, usage id or asset id, source tweet id or URL, and local preview paths when available
- reply outputs can also persist alternate candidate media so `/drafts` can show the shortlist Gemini considered

Written by:

- [`src/server/generated-drafts.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/generated-drafts.ts)

### `data/analysis/topic-tweets/`

Per-tweet Gemini topic analyses. One tweet per file.

Each file holds:

- 0 to 3 concise topic signals
- a single preferred summary label
- whether the tweet looks newsy
- an optional news peg / why-now note
- opinion fields: `sentiment`, `stance`, `emotionalTone`, `opinionIntensity`, and `targetEntity`
- the model id and analysis timestamp

Primary type:

- [`TweetTopicAnalysisRecord`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

Written by:

- [`src/server/topic-analysis-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/topic-analysis-store.ts)

### `data/analysis/media-assets/`

Cross-usage asset-level records.

- `index.json`: asset records plus `usageId -> assetId` mapping
- `summaries.json`: aggregated asset-level summaries
- `stars.json`: user-starred asset ids

Primary types:

- [`MediaAssetRecord`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [`MediaAssetSummary`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

### `data/analysis/topics/`

Derived topic data built from cached Gemini tweet-topic analyses plus saved tweet metadata.

`index.json` contains:

- per-tweet topic signals and linked topic ids
- aggregate topic clusters with tweet counts, author counts, likes, recency, and hotness
- suggested posting angles for the hottest active clusters
- the cluster-level read model that the usage-detail page uses to label relevant topics once topic-search hits are deduped

`news.json` contains optional grounded-news cache entries for the hottest fresh topics when Google Search grounding is enabled.

Primary types:

- [`TweetTopicRecord`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [`TopicClusterRecord`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [`TopicIndex`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [`GroundedTopicNews`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

### `data/analysis/reply-media-wishlist.json`

File-backed backlog of desired assets discovered during reply, topic-post, and media-post composition.

Each entry tracks:

- normalized key and human label
- pending/collected/dismissed status
- how many times the idea was requested
- which usage ids and reply goals triggered it
- example tweet texts and planned reply angles
- asset intents that may point to memes, real people, public figures, scenes, concepts, pop-culture references, objects, or vibes

Written by:

- [`src/server/reply-media-wishlist.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-media-wishlist.ts)

### `data/analysis/meme-templates/`

Imported meme-template reference data sourced from Meming Wiki / meming.world.

- `index.json`: template metadata, page URLs, usage summaries, and local asset paths
- `assets/<template-id>/*`: downloaded base templates and example images

Current runtime use:

- reply composition and topic-to-tweet composition can search these imported templates as candidate media alongside captured-media facet results
- imports can mark close wishlist aliases as `collected` together when the labels clearly refer to the same meme format
- import sourcing now prefers meming.world but can fall back to a grounded public-web page and locally extracted image assets
- these records are still not written into the usage-analysis store and are not part of Chroma facet indexing

Written by:

- [`src/server/meme-template-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-store.ts)
- [`src/server/meme-template-import.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-import.ts)

### `data/control/`

Operational state.

- `scheduler.json`: persisted scheduler config
- `run-history.json`: task execution history
- `logs/*.log`: stdout/stderr capture for task runs

Primary types:

- [`SchedulerConfig`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [`RunHistoryEntry`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)

## Contract Hierarchy

When changing shape, check these in order:

1. [`src/lib/types.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
2. [`src/lib/analysis-schema.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/analysis-schema.ts)
3. The writer module in `src/server`
4. `getDashboardData()` consumers in UI code
5. Relevant tests under [`tests/`](/Users/nicklocascio/Projects/twitter-trend/tests)

## Important Current Reality

- `schema.sql` exists, but the live app path is file-backed.
- The dashboard merges saved analyses with synthetic pending rows.
- The dashboard read model enriches each `TweetUsageRecord` with duplicate-group metadata and a computed hotness score; those values are derived at read time and are not persisted as separate JSON files.
- The dashboard does not rebuild topic analyses on read. Topic caches are produced by the explicit `analyze:topics` flow.
- Asset summaries may be fallback summaries when only one complete usage analysis exists.
