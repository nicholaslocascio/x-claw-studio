# Decisions And Learnings

Use this file as the lightweight running log for architecture decisions, notable tradeoffs, and non-obvious lessons.

## How To Write Entries

Keep entries short and append-only.

Recommended format:

```md
## YYYY-MM-DD: Short title

- Context: what changed or what problem came up
- Decision: what was chosen
- Why: key reasoning or tradeoff
- Impact: what future agents/operators should assume now
- Follow-up: optional cleanup or future work
```

Only log things that future contributors are likely to need.

## Current Entries

## 2026-03-13: Keep dashboard assembly cached and move deferred capture maintenance into a worker

- Context: page loads and focused tweet lookup could stall the Next.js server because `getDashboardData()` rebuilt the full file-backed read model on every read, and deferred capture post-processing still started heavy maintenance inside the request process.
- Decision: add an in-process dashboard snapshot cache keyed by cheap file and directory mtimes, and queue deferred capture post-processing through a detached CLI worker instead of `void`-calling the maintenance function in-process.
- Why: the dashboard read model is expensive but mostly stable between writes, and capture maintenance is operational work that should not compete with page rendering on the same event loop.
- Impact: repeat UI reads and helper lookups can reuse one assembled snapshot per server process until the backing files change, and focused capture paths should return before asset sync and summary rebuild work starts chewing on the web server.
- Follow-up: if the cache key still misses edge cases or the first render remains too heavy, move more of the duplicate-group and summary computation into persisted maintenance artifacts instead of request-time assembly.

## 2026-03-12: Move primary capture off OpenClaw and onto the X API

- Context: OpenClaw-driven scraping put the main capture path at odds with X's platform rules and forced the crawl to depend on a live browser attachment.
- Decision: Repoint the main crawl command to the official X API under `crawl:x-api` and keep `crawl:openclaw` as a compatibility alias, using the authenticated home timeline endpoint for corpus pulls and post lookup for direct status-url capture.
- Why: this keeps the file-backed pipeline intact while removing the browser-scrape dependency from the primary capture path.
- Impact: operators now need `X_BEARER_TOKEN` user-context access for home timeline capture, while downstream manifests, media sync, and analysis jobs keep the same contracts.
- Follow-up: if we need reply-thread capture through the API later, add a dedicated reply-conversation endpoint instead of bringing browser scraping back into the main flow.

## 2026-03-13: Remove legacy OpenClaw browser-control surfaces from the app

- Context: the app had already moved capture and draft-saving onto the X API and Typefully, but the dashboard still showed OpenClaw tab health and the repo still carried unused browser-extension routes and helpers.
- Decision: delete the OpenClaw tab health APIs, remove the legacy control-panel widgets, and retire the unreferenced browser-control modules and tests.
- Why: keeping a broken browser-attachment path in the UI made the product look unhealthy and sent contributors toward dead code instead of the current API-backed flow.
- Impact: the app no longer depends on the OpenClaw browser extension anywhere in its active UI or server routes. Remaining `openclaw` task names are compatibility labels for the newer API-backed commands.
- Follow-up: if the legacy command names become more confusing than helpful, rename the tasks and CLI scripts in a separate compatibility pass.

## 2026-03-13: `all_goals` batches run in parallel with an explicit concurrency cap

- Context: sequential reply/topic all-goals drafting made compare mode drag, but unconstrained fan-out would duplicate subject loading and could stampede local Gemini CLI runs.
- Decision: move `all_goals` orchestration to a shared parallel batch runner with a per-request `maxConcurrency` cap, and preload the shared subject once before goal fan-out.
- Why: this cuts batch wall-clock time without re-analyzing the same tweet/topic for every goal and gives operators a simple control when the local machine or Gemini CLI starts thrashing.
- Impact: reply and topic compose progress now report running, queued, and completed counters; UI clients can tune concurrency per run instead of accepting a fixed sequential loop.
- Follow-up: if operators settle on a stable sweet spot, consider adding a persisted default instead of starting each session at the conservative cap.

## 2026-03-13: Gemini composition latency is dominated by call count first, prompt size second

- Context: prompt work on the reply, topic, and media composers exposed slower-than-expected iteration times during draft generation and validation.
- Decision: treat compose latency as an orchestration problem before treating it as a model problem, and document the fast path separately from quality tuning.
- Why: the current compose path usually makes three Gemini CLI calls per draft (`plan -> compose -> cleanup`), and `all_goals` multiplies that cost quickly. Prompt size matters, but call count is the first lever.
- Impact: future speed work should start in the composer model adapters and prompt builders, measure how many Gemini invocations a workflow makes, and avoid blaming Gemini itself before checking local search or Chroma startup overhead.
- Follow-up: add a dedicated fast validation harness for one-shot prompt iteration, then decide whether cleanup should become conditional instead of always-on.

## 2026-03-13: Default headless compose provider is now Codex exec

- Context: reply, topic, media, and manual-post composition were hard-wired to Gemini CLI even though the repo needed a clean provider seam for headless drafting.
- Decision: add a shared compose-model CLI runner with a provider switch, keep the Gemini path intact, and make `codex exec` the default compose provider.
- Why: this keeps provider-specific process details out of each composer and makes the default match the current local coding-agent stack.
- Impact: compose flows now default to Codex, `COMPOSE_MODEL_PROVIDER=gemini-cli` restores the older path, and the shared runner can pass prompts over stdin plus attach local images directly to Codex.
- Follow-up: if we add provider-specific affordances later, keep them inside the shared runner instead of branching each composer again.

## 2026-03-15: Reply final-compose now keeps source-tweet grounding

- Context: the reply flow resolved the original tweet and its analysis before planning, but the final compose prompt only saw a narrow subset of that context plus the retrieved candidate media.
- Decision: carry the fuller reply subject into final compose and attach the source media when the usage has a local image or playable video file.
- Why: candidate ranking and line writing both get better when the model can compare against the actual source post instead of a reduced summary.
- Impact: the reply final-compose step now sees source tweet metadata, richer analysis facets, local source-media paths, and the source media attachment in addition to retrieved candidates.

## 2026-03-11: Keep topic discovery deterministic and file-backed

- Context: the dashboard needed topic ideas per tweet, aggregate topic clustering, and freshness scoring without adding another service dependency.
- Decision: derive `data/analysis/topics/index.json` from captured tweet text plus existing usage-analysis facets inside the dashboard read path.
- Why: that keeps text-only tweets in scope, preserves the repo's file-backed runtime, and avoids adding another Gemini call before the feature is useful.
- Impact: operators now get topic clusters, topic hotness, and suggested posting angles directly in the homepage; future upgrades can swap in model-backed extraction behind the same file contract.
- Follow-up: if extraction noise becomes a problem, add an optional tweet-topic analyzer that writes the same `TopicIndex` shape instead of changing the UI contract.

## 2026-03-11: Keep grounded news as an opt-in cached overlay, not part of the core topic index

- Context: topic clusters became useful for planning tweets, but the next step needed live article context and source links from Google Search grounding.
- Decision: store grounded-news results in a separate `data/analysis/topics/news.json` cache and only refresh the hottest fresh topics when `TOPIC_GROUNDED_NEWS_ENABLED=1`.
- Why: grounded search is billable and network-dependent, so it should not run implicitly every time the file-backed dashboard read model is assembled.
- Impact: the base topic index remains deterministic and cheap, while the homepage can still show live article context and citations when operators explicitly enable it.
- Follow-up: if operators want tighter control, add a dedicated CLI to warm or refresh the grounded-news cache on demand.

## 2026-03-11: Replace heuristic topic extraction with cached Gemini tweet-topic analysis

- Context: the first topic pass generated noisy labels like `The`, `Just`, `Going`, and `N/a`, which made the cluster ranking unusable.
- Decision: stop generating topics inside `getDashboardData()`, add an explicit `analyze:topics` flow, and cache one Gemini topic analysis per tweet before rebuilding the topic index.
- Why: the topic problem is semantic, not lexical. A small LLM extraction pass is more reliable than trying to stack more heuristics on top of tweet text and media-analysis prose.
- Impact: topic quality now depends on a promptable Gemini schema, while rate-limit risk stays bounded through caching, single-threaded processing, inter-item delay, and a default 100-tweet batch cap.
- Follow-up: if quality is still uneven, tighten the topic prompt and add a gold-set eval before touching clustering again.

## 2026-03-11: Topic search should index tweet posture plus usage facets, not only topic labels

- Context: once topic labels became usable, the next product need was mapping a media usage back to relevant live topics and understanding how people felt about those topics.
- Decision: extend per-tweet topic analyses with opinion fields (`sentiment`, `stance`, `emotionalTone`, `opinionIntensity`, `targetEntity`) and index each topic analysis into Chroma with both the topic fields and saved usage-analysis facets as searchable haystack.
- Why: media relevance is often carried by framing and rhetoric, not just by the literal topic string. A usage-detail page needs to retrieve topics through subject plus posture and supporting facet context.
- Impact: usage detail can now search topics even before a dedicated topic-media workflow exists, and topic retrieval still works without Chroma because lexical fallback runs over the same cached topic-analysis files.
- Follow-up: if operators want stronger media-topic matching, add a dedicated topic-to-asset retrieval index or persist grouped topic-search results per asset.

## 2026-03-11: Topic-page post drafting should reuse local media retrieval instead of inventing a separate corpus path

- Context: once topics became searchable, the next workflow was authoring a brand-new tweet from a hot topic and pairing it with existing local media.
- Decision: add a dedicated topic-post composer that starts from a topic cluster, uses Gemini CLI to plan and write the post, and reuses `x-media-analyst search facets` for media retrieval before the final selection pass.
- Why: topic-authoring is a different prompt from reply composition, but the corpus search and media-candidate contract are already good enough. Reusing that path keeps retrieval behavior consistent and avoids splitting the media corpus into multiple search stacks.
- Impact: `/topics` now supports `plan -> search -> compose` for original tweets, and future changes to local media retrieval should benefit both reply composition and topic-post composition.
- Follow-up: if the topic composer starts underperforming on media matches, add a topic-aware search provider that can blend topic-search hits and facet-search hits before candidate ranking.

## 2026-03-11: Media-led post drafting keeps the current asset fixed instead of searching for a replacement

- Context: after topic-led tweet drafting, the next workflow was authoring a new post directly from a media asset already in the corpus.
- Decision: add a separate media-post composer on usage detail pages that uses the current asset, its saved analysis, nearby topic hits, and prior usages as context, but does not run a new media search.
- Why: the operator intent here is not "find media for a thought"; it is "make this asset useful now." Searching for replacement media would blur that workflow with the topic composer and reply composer.
- Impact: usage detail now supports original-post drafting around a fixed asset, while the prompt can still inspect the actual local media file when available.
- Follow-up: if operators want variants, add an optional second step that proposes two or three alternate tweet angles for the same asset before drafting the final post.

## 2026-03-11: Reply composition uses Gemini CLI headless, not the existing Gemini API client

- Context: the new usage-detail reply composer needed image-aware iterative drafting against local search results, while the existing Gemini integration in the repo is tuned for analysis-time API calls.
- Decision: keep reply composition on a separate `plan -> search -> compose` path that uses the installed `gemini` CLI in headless mode and the existing `x-media-analyst search facets` CLI for retrieval.
- Why: this preserves a clean boundary between deterministic local corpus access and model-driven drafting, and it avoids coupling the new UX to the current Gemini API analysis implementation.
- Impact: future provider swaps should replace the reply-composer model adapter without changing the UI or the media-search adapter; operators must treat Gemini CLI install/auth as a separate runtime dependency from `GEMINI_API_KEY`.
- Follow-up: if reply drafts start being persisted or queued, add a dedicated file-backed store instead of overloading analysis artifacts.

## 2026-03-11: Agents and Gemini CLI should run the local `stop-slop` pass before finalizing work

- Context: the repo carries a local skill at [`/.agents/skills/stop-slop/SKILL.md`](/Users/nicklocascio/Projects/twitter-trend/.agents/skills/stop-slop/SKILL.md) to remove AI writing patterns from prose and tighten editing quality.
- Decision: make that skill an explicit part of the repo quality bar and change playbook for prompts, docs, UI copy, and final explanations, and tell `gemini` to load it directly in headless prompt flows.
- Why: the project needs a consistent guardrail against filler, predictable structure, and generic copy in both product surfaces and agent-written documentation.
- Impact: future agents should treat the `stop-slop` review as part of done, alongside tests and docs, and Gemini CLI integrations should reference the skill file in their prompts when prose quality matters.
- Follow-up: if more Gemini CLI tasks are added, standardize a shared prompt helper for skill loading instead of repeating the file reference.

## 2026-03-13: Manual-post prompts must treat attached media as already visible context

- Context: the manual brief composer could produce posts that wasted most of the tweet re-describing the selected clip or image even when that media would be attached beside the post.
- Decision: add explicit prompt and cleanup rules that treat selected media as adjacent context, so the text spends its characters on the callback, verdict, or reaction instead of narrating the scene.
- Why: media-led posts read like slop when the copy duplicates what the viewer can already see, especially in short feed-native formats where every word has to earn its place.
- Impact: future prompt edits on the manual-post path should preserve the "do not describe the attachment back to the reader" rule, and prompt tests now lock that behavior in.
- Follow-up: if this failure mode shows up in other compose surfaces, lift the rule into a shared prompt helper instead of fixing each prompt separately.

## 2026-03-11: Reply-composer asset ideas are stored in a file-backed wishlist with UI and CLI access

- Context: reply composition can surface useful asset targets that are not yet tracked intentionally in the local corpus, such as recognizable templates, people, scene references, public figures, or other visual metaphors.
- Decision: save planned asset-retrieval ideas to `data/analysis/reply-media-wishlist.json` on every compose run, dedupe them by wishlist key, and expose them through the homepage plus `x-media-analyst wishlist`.
- Why: the repo's live runtime remains file-backed, and operators need a durable backlog of assets to source later without introducing a separate database path.
- Impact: the wishlist now accumulates counts, triggering usage ids, goals, and example tweet context, and operators can mark entries as collected or dismissed from either the UI or CLI.
- Follow-up: keep new composer flows on the same shared wishlist path instead of creating per-feature backlogs.

## 2026-03-11: Meming.world imports use Gemini CLI for research but stay file-backed locally

- Context: wishlist entries now need a way to turn desired meme ideas into reusable local reference records with template images and examples.
- Decision: use Gemini CLI to resolve the best meming.world page and summarize general usage, then parse the page and download image assets server-side into `data/analysis/meme-templates/`.
- Why: Gemini is useful for fuzzy template/page matching and concise usage synthesis, while page parsing and downloading are more reliable as deterministic local steps.
- Impact: imported meme templates are now stored as JSON plus local assets, not in a live SQL database, and wishlist entries can be imported from the UI or `x-media-analyst wishlist import`.
- Follow-up: add a dedicated page for browsing imported meme templates and connecting them back into reply-media retrieval.

## 2026-03-12: Wishlist asset import falls back from meming.world to grounded web search

- Context: some desired meme or reference assets are not present on meming.world, which made the old import button overstate what the workflow could actually find.
- Decision: keep meming.world as the first-pass source, but if that path fails or yields no usable image URLs, switch to Gemini Google Search grounding, pick the best public webpage, and extract likely local image assets from that page.
- Why: meming.world remains the cleanest source for canonical meme pages, but the product goal is broader asset sourcing, not only wiki imports.
- Impact: wishlist imports can now succeed for non-meming-world assets, and imported template records may have `source: "grounded_web"` instead of `source: "meming_world"`.
- Follow-up: tighten the generic webpage image ranking if fallback imports start picking noisy hero images or logos.

## 2026-03-12: Generated drafts are persisted in a shared file-backed store

- Context: compose flows were useful in-session, but there was no durable history for replies or generated tweets and no way to inspect in-progress or failed runs later.
- Decision: add a shared `data/analysis/generated-drafts/index.json` store that records `running`, `complete`, and `failed` draft jobs across reply, topic-post, and media-post composition.
- Why: draft history is an application artifact, not scheduler/run-control metadata, and it needs to be shared across compose surfaces without introducing a database.
- Impact: `/drafts` now shows a unified history, and the reply composer can show recent draft history for the current usage or tweet.
- Follow-up: if operators need triage or reuse workflows, add filters, starring, or explicit “promote to posting queue” actions on top of the same store.

## 2026-03-10: Agent docs added as a first-class repo navigation layer

- Context: the repo had product documentation in `README.md`, but no dedicated guide for coding agents to navigate the current architecture quickly.
- Decision: add a root [`AGENTS.md`](/Users/nicklocascio/Projects/twitter-trend/AGENTS.md) plus numbered docs under [`agent_docs/`](/Users/nicklocascio/Projects/twitter-trend/agent_docs).
- Why: the codebase mixes Next.js pages, CLI entrypoints, file-backed server modules, and runtime artifacts under `data/`; agents need a stable path to the right file without rediscovering structure each time.
- Impact: future changes should update these docs as part of the same task whenever architecture, workflows, or contracts move.
- Follow-up: if the repo grows more subsystems, split this file into an `agent_docs/adr/` folder or add more numbered deep-dive docs.

## 2026-03-10: Raw media keeps `.bin` compatibility copies but prefers native typed siblings

- Context: intercepted X media was often saved as `.bin` because many CDN URLs omit filename extensions, which made local files hard to inspect and reuse.
- Decision: write a `.bin` compatibility copy for persisted raw media, also write a native sibling when headers, URL hints, or file signatures identify the type, and store the native path in the manifest when available.
- Why: this preserves existing robustness and compatibility while giving operators usable `.jpg`, `.png`, `.webp`, `.gif`, `.mp4`, and `.m3u8` files.
- Impact: future capture changes should treat native-file creation as best-effort and keep bulk repair available through the raw-media backfill task.
- Follow-up: if capture starts transcoding or normalizing media bytes instead of copying them, extend the backfill path to record richer conversion metadata.

## 2026-03-13: Incremental asset sync should match by media URL before fingerprint similarity

- Context: duplicate detection looked unreliable during iterative asset upserts because some new tweets reused an existing X media URL or request key but still landed as fresh asset rows until a manual rebuild.
- Decision: make incremental asset sync try shared canonical/source/preview/poster URLs and shared X media request keys before falling back to dHash or embedding-based matching.
- Why: reposted images and videos often already expose a stable X CDN identity, and that signal is cheaper and more exact than perceptual matching.
- Impact: operators should need fewer full `media:rebuild` runs just to recover obvious exact duplicates, and the dashboard can more reliably keep duplicate counts current during normal capture flow.
- Follow-up: if duplicate quality still feels weak after this, inspect threshold tuning for the read-time similarity graph separately from the exact-match upsert path.

## 2026-03-16: Facet search intent matching is now opt-in

- Context: broad one-word searches such as `female` or `celebrity` were being quietly routed and boosted through hard-coded intent logic, which made it hard to tell whether the search corpus itself was good or whether the override was just papering over weak retrieval.
- Decision: keep the routing/boost logic, but move it behind an explicit `hardMatchMode` flag that defaults to `off` in the API, CLI, and search eval fixtures.
- Why: search quality work needs an honest baseline. If the default path is supposed to rely on embeddings and the local document corpus, hidden hard matching makes the eval misleading.
- Impact: broad search quality now depends on the corpus text and general ranking logic by default, while operators can still opt back into `intent` mode when they want that behavior on purpose.
- Follow-up: keep watching vector participation in the search eval report; many passing queries still lean heavily on lexical ranking.

## 2026-03-16: Pure-vector facet hits should be damped unless lexical evidence also exists

- Context: once the asset-summary Chroma index was refreshed with more semantic search documents, vector retrieval started contributing again, but broad queries like `female`, `celebrity`, and `reaction image` became too eager and let semantically loose neighbors outrank exact lexical matches.
- Decision: keep the stronger vector normalization, but apply a lower weight to pure-vector rows than to rows that have both vector and lexical support.
- Why: this preserves semantic recall for exact or concept-heavy searches while avoiding a ranking regime where any vaguely related embedding neighbor can overwhelm short queries.
- Impact: the current eval keeps `8/8` relevance passes, named/entity queries still show vector participation, and broad queries recover without turning hard-match routing back on.
- Follow-up: improve vector participation on the broad queries by improving corpus text, not by raising pure-vector weight again.

## 2026-03-16: Broad media retrieval needs explicit archetype language in the indexed documents

- Context: broad queries such as `reaction image`, `product UI`, and `terminal screenshot` were still mostly lexical even after semantic summaries were added, because the indexed documents did not consistently say the reusable archetype out loud.
- Decision: derive and index `search_archetypes` such as `reaction image`, `reaction clip`, `product UI`, `software screenshot`, `terminal screenshot`, and `dashboard screenshot` from the existing media analysis fields.
- Why: this improves both embedding retrieval and lexical retrieval without bringing back hidden query-side hard matching.
- Impact: after focused reindexing, broad reusable-media queries gained meaningful `vec@5` participation in the eval while keeping their relevance thresholds green.
- Follow-up: if operators add new high-level search concepts, prefer deriving more archetypes from the analysis rather than adding query-specific routing.
