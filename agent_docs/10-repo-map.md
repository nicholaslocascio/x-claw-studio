# Repo Map

This is the directory-level navigation guide.

## Top Level

- [`app/`](/Users/nicklocascio/Projects/twitter-trend/app): App Router pages and API routes.
- [`src/`](/Users/nicklocascio/Projects/twitter-trend/src): main TypeScript code.
- [`data/`](/Users/nicklocascio/Projects/twitter-trend/data): local runtime artifacts and derived files.
- [`tests/`](/Users/nicklocascio/Projects/twitter-trend/tests): unit, integration, and e2e tests.
- [`schema.sql`](/Users/nicklocascio/Projects/twitter-trend/schema.sql): target relational schema, useful for future-state intent.
- [`README.md`](/Users/nicklocascio/Projects/twitter-trend/README.md): product- and operator-oriented overview.
- [`Makefile`](/Users/nicklocascio/Projects/twitter-trend/Makefile): local workflow shortcuts.
- [`bin/x-media-analyst.mjs`](/Users/nicklocascio/Projects/twitter-trend/bin/x-media-analyst.mjs): installed top-level CLI launcher that resolves the repo root before dispatching commands.

## `app/`

- [`app/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/page.tsx): main dashboard.
- [`app/tweets/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/tweets/page.tsx): dedicated captured-tweets browser with reply composition for media and text-only posts, plus URL-driven search/filter pagination in 200-tweet pages.
- [`app/replies/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/replies/page.tsx): dedicated reply lab where operators paste one X status URL, resolve it from local data or the X API, and run shared reply composition from a single workspace.
- [`app/topics/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/topics/page.tsx): dedicated topic explorer with the full topic cluster list.
- [`app/matches/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/matches/page.tsx): duplicate/similarity explorer.
- [`app/wishlist/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/wishlist/page.tsx): dedicated reply-media wishlist page.
- [`app/drafts/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/drafts/page.tsx): generated-draft history across replies, topic posts, and media-led posts.
- [`app/phash/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/phash/page.tsx): redirect to matches.
- [`app/usage/[usageId]/page.tsx`](/Users/nicklocascio/Projects/twitter-trend/app/usage/[usageId]/page.tsx): usage detail page.
- [`app/api/reply/compose/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/reply/compose/route.ts): reply-composer API route that plans a reply, searches candidate media, and returns a draft plus selected media.
- [`app/api/reply/source/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/reply/source/route.ts): reply-lab source resolver that normalizes a pasted X status URL, checks local captures, falls back to synchronous X API capture, and returns a prepared subject for the shared composer.
- [`app/api/tweets/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/tweets/route.ts): paginated captured-tweet listing API with server-side query and media-filter support.
- [`app/api/media/compose/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/media/compose/route.ts): media-post composer API route that drafts a new original tweet from the current media asset.
- [`app/api/topics/compose/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/topics/compose/route.ts): topic-post composer API route that drafts a new tweet from a topic and selects local media.
- [`app/api/typefully/draft/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/typefully/draft/route.ts): Typefully-backed route that uploads media when needed and creates an X draft for later approval.
- [`app/api/reply-media-wishlist/import/route.ts`](/Users/nicklocascio/Projects/twitter-trend/app/api/reply-media-wishlist/import/route.ts): imports a wishlist meme from meming.world using Gemini CLI research.
- [`app/api/`](/Users/nicklocascio/Projects/twitter-trend/app/api): route handlers for UI actions and local media access.

Rule of thumb: pages are thin. If a page looks complex, the real logic is usually in `src/server` or `src/components`.

## `src/components/`

Primary dashboard components:

- [`src/components/control-panel.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/control-panel.tsx): run buttons, scheduler config, run history.
- [`src/components/usage-queue.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/usage-queue.tsx): main usage listing, filters, cluster view, and inline response generation entrypoint on homepage cards.
- [`src/components/analysis-detail.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/analysis-detail.tsx): usage detail presentation.
- [`src/components/reply-composer.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/reply-composer.tsx): usage-detail reply drafting UI that orchestrates Gemini CLI plus local media search.
- [`src/components/reply-workbench.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/reply-workbench.tsx): dedicated reply-lab UI for tweet lookup, analysis status, and composer handoff.
- [`src/components/media-tweet-composer.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/media-tweet-composer.tsx): usage-detail UI for drafting a new original tweet around the current asset.
- [`src/components/post-to-x-button.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/post-to-x-button.tsx): reusable save-to-Typefully control for live draft results and saved draft history.
- [`src/components/reply-media-wishlist.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/reply-media-wishlist.tsx): wishlist UI for reviewing entries, importing from meming.world, and updating status.
- [`src/components/topic-clusters.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/topic-clusters.tsx): homepage topic radar with clustered concepts, topic hotness, and posting angles.
- [`src/components/topic-search.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/topic-search.tsx): dedicated topic-search UI on `/topics`.
- [`src/components/topic-tweet-composer.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/topic-tweet-composer.tsx): topic-page UI for drafting a new tweet from a selected topic and pairing it with local media.
- [`src/components/facet-search.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/facet-search.tsx): local facet search UI.
- [`src/components/media-preview.tsx`](/Users/nicklocascio/Projects/twitter-trend/src/components/media-preview.tsx): media preview rendering.

## `src/cli/`

These are the user-facing operational entrypoints.

- [`src/cli/crawl-x-api.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/crawl-x-api.ts): X API home-timeline crawl entrypoint.
- [`src/cli/crawl-timeline.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/crawl-timeline.ts): Playwright fallback crawl.
- [`src/cli/capture-x-api-timeline.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/capture-x-api-timeline.ts): bounded X API timeline capture entrypoint.
- [`src/cli/capture-x-api-tweet.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/capture-x-api-tweet.ts): focused X API post lookup by status URL.
- [`src/cli/capture-x-api-tweet-and-compose-replies.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/capture-x-api-tweet-and-compose-replies.ts): focused X API post lookup followed by all-goals reply drafting.
- [`src/cli/backfill-media-native-types.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/backfill-media-native-types.ts): backfill native image or video filenames for previously saved raw media.
- [`src/cli/analyze-tweet.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/analyze-tweet.ts): analyze one usage.
- [`src/cli/analyze-missing.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/analyze-missing.ts): fill missing analyses.
- [`src/cli/analyze-topics.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/analyze-topics.ts): run Gemini-backed tweet-topic extraction in batches and rebuild the topic index cache.
- [`src/cli/rebuild-media-assets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/rebuild-media-assets.ts): rebuild asset index and summaries.
- [`src/cli/search-facets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/search-facets.ts): query facet index.
- [`src/cli/search-tweets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/search-tweets.ts): list captured tweets with the same paginated query/filter contract used by the API and `/tweets` UI.
- [`src/cli/search-topics.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/search-topics.ts): query topic analyses with stance, sentiment, and usage-linked haystack.
- [`src/cli/reply-media-wishlist.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/reply-media-wishlist.ts): list and update reply wishlist entries from the terminal.
- [`src/cli/import-meme-template.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/import-meme-template.ts): import one wishlist meme from meming.world and save template assets locally.
- [`src/cli/x-media-analyst.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/x-media-analyst.ts): top-level `x-media-analyst` command router for running app, pipeline, and search commands from any working directory.
- [`src/cli/scheduler.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/scheduler.ts): polling scheduler.
- [`src/cli/run-stack.ts`](/Users/nicklocascio/Projects/twitter-trend/src/cli/run-stack.ts): local stack supervisor.

## `src/server/`

This is the real backend, just without an HTTP service boundary.

- Data assembly: [`src/server/data.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/data.ts)
- Run control: [`src/server/run-control.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/run-control.ts)
- Tweet lookup: [`src/server/tweet-repository.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/tweet-repository.ts)
- Usage detail assembly: [`src/server/usage-details.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/usage-details.ts)
- X API client and response mapping: [`src/server/x-api.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/x-api.ts)
- X API capture runner: [`src/server/x-api-capture.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/x-api-capture.ts)
- Typefully draft flow: [`src/server/typefully.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/typefully.ts)
- Raw media native-type backfill: [`src/server/raw-media-backfill.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/raw-media-backfill.ts)
- Gemini analysis: [`src/server/gemini-analysis.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/gemini-analysis.ts)
- Gemini tweet-topic analysis: [`src/server/gemini-topic-analysis.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/gemini-topic-analysis.ts)
- Reply composer orchestration: [`src/server/reply-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-composer.ts)
- Reply composer subject/source resolution: [`src/server/reply-composer-subject.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-composer-subject.ts)
- Headless reply-draft job wrapper: [`src/server/reply-composer-job.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-composer-job.ts)
- Reply composer model adapter: [`src/server/reply-composer-model.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-composer-model.ts)
- Reply composer prompt builder: [`src/server/reply-composer-prompt.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-composer-prompt.ts)
- Reply composer media search adapter: [`src/server/reply-media-search.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-media-search.ts)
- Meme template candidate search: [`src/server/meme-template-search.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-search.ts)
- Reply composer wishlist store: [`src/server/reply-media-wishlist.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/reply-media-wishlist.ts)
- Shared Gemini CLI JSON runner/parser: [`src/server/gemini-cli-json.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/gemini-cli-json.ts)
- Generated draft store: [`src/server/generated-drafts.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/generated-drafts.ts)
- Topic-post composer orchestration: [`src/server/topic-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/topic-composer.ts)
- Topic-post composer model adapter: [`src/server/topic-composer-model.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/topic-composer-model.ts)
- Topic-post composer prompt builder: [`src/server/topic-composer-prompt.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/topic-composer-prompt.ts)
- Media-post composer orchestration: [`src/server/media-post-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-post-composer.ts)
- Media-post composer model adapter: [`src/server/media-post-composer-model.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-post-composer-model.ts)
- Media-post composer prompt builder: [`src/server/media-post-composer-prompt.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-post-composer-prompt.ts)
- Meme template importer: [`src/server/meme-template-import.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-import.ts)
- Meme template Gemini research: [`src/server/meme-template-gemini.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-gemini.ts)
- Meming.world parser: [`src/server/meming-world.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meming-world.ts)
- Meme template store: [`src/server/meme-template-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/meme-template-store.ts)
- Topic clustering and topic hotness: [`src/server/tweet-topics.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/tweet-topics.ts)
- Topic-analysis file store: [`src/server/topic-analysis-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/topic-analysis-store.ts)
- Pipeline wrapper: [`src/server/analysis-pipeline.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/analysis-pipeline.ts)
- Analysis files: [`src/server/analysis-store.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/analysis-store.ts)
- Chroma indexing/search: [`src/server/chroma-facets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/chroma-facets.ts)
- Asset rebuild / summaries / duplicate mapping: [`src/server/media-assets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-assets.ts)
- Fingerprints: [`src/server/media-fingerprint.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-fingerprint.ts)
- Image embeddings: [`src/server/media-embedding.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-embedding.ts)
- Video promotion/inspection: [`src/server/media-asset-video.ts`](/Users/nicklocascio/Projects/twitter-trend/src/server/media-asset-video.ts)

## `src/lib/`

Change these only when you mean to change shared contracts or reusable behavior.

- [`src/lib/types.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts): shared type contracts
- [`src/lib/reply-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/reply-composer.ts): shared request/result contracts and model-output schemas for the reply composer
- [`src/lib/topic-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/topic-composer.ts): shared request/result contracts and model-output schemas for topic-to-tweet composition
- [`src/lib/media-post-composer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/media-post-composer.ts): shared request/result contracts and model-output schemas for media-to-tweet composition
- [`src/lib/typefully.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/typefully.ts): shared request/result schema for saving X drafts into Typefully
- [`src/lib/meme-template.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/meme-template.ts): meme template research, summary, and stored-record contracts
- [`src/lib/analysis-schema.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/analysis-schema.ts): facet schema and normalization
- [`src/lib/extract-tweets.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/extract-tweets.ts): DOM extraction helpers
- [`src/lib/scroll-humanizer.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/scroll-humanizer.ts): scroll plan generation
- [`src/lib/env.ts`](/Users/nicklocascio/Projects/twitter-trend/src/lib/env.ts): env loading and validation

## `data/`

- [`data/raw/`](/Users/nicklocascio/Projects/twitter-trend/data/raw): crawl outputs grouped by run id
- [`data/analysis/tweet-usages/`](/Users/nicklocascio/Projects/twitter-trend/data/analysis/tweet-usages): one JSON file per analyzed usage
- [`data/analysis/media-assets/`](/Users/nicklocascio/Projects/twitter-trend/data/analysis/media-assets): asset index, summaries, stars
- [`data/analysis/topic-tweets/`](/Users/nicklocascio/Projects/twitter-trend/data/analysis/topic-tweets): one Gemini-backed topic analysis per tweet
- [`data/analysis/topics/`](/Users/nicklocascio/Projects/twitter-trend/data/analysis/topics): per-tweet topic signals and aggregate topic clusters
- [`data/analysis/meme-templates/`](/Users/nicklocascio/Projects/twitter-trend/data/analysis/meme-templates): imported meme template records and downloaded base/example assets
- [`data/control/`](/Users/nicklocascio/Projects/twitter-trend/data/control): scheduler config, run history, logs

## `tests/`

- [`tests/unit/`](/Users/nicklocascio/Projects/twitter-trend/tests/unit): deterministic local tests
- [`tests/integration/`](/Users/nicklocascio/Projects/twitter-trend/tests/integration): service-backed tests, usually gated by env flags
- [`tests/e2e/`](/Users/nicklocascio/Projects/twitter-trend/tests/e2e): end-to-end pipeline validation
