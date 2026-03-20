# AGENTS.md

This file is for coding agents working in this repository. Read this first, then open the smallest relevant file in `agent_docs/`.

## What This Repo Is

`twitter-trend` is a local-first Next.js app plus CLI pipeline for:

1. Capturing tweets and media from X.
2. Persisting crawl and analysis artifacts to the local filesystem.
3. Rebuilding media asset records and duplicate/similarity groupings.
4. Running Gemini-based usage analysis and optional Chroma facet indexing.
5. Inspecting the pipeline through a local dashboard.

This repo is not database-backed in the current runtime path. The app reads from JSON files in `data/`.

## Read In This Order

1. [`agent_docs/00-start-here.md`](./agent_docs/00-start-here.md)
2. [`agent_docs/10-repo-map.md`](./agent_docs/10-repo-map.md)
3. [`agent_docs/20-runtime-flows.md`](./agent_docs/20-runtime-flows.md)
4. [`agent_docs/30-data-layout.md`](./agent_docs/30-data-layout.md)
5. [`agent_docs/40-operations.md`](./agent_docs/40-operations.md)
6. [`agent_docs/50-change-playbooks.md`](./agent_docs/50-change-playbooks.md)
7. [`agent_docs/60-decisions.md`](./agent_docs/60-decisions.md)

## Fast Repo Navigation

- UI entrypoints: [`app/page.tsx`](./app/page.tsx), [`app/matches/page.tsx`](./app/matches/page.tsx), [`app/usage/[usageId]/page.tsx`](./app/usage/[usageId]/page.tsx)
- UI components: [`src/components`](./src/components)
- File-backed read model: [`src/server/data.ts`](./src/server/data.ts)
- Capture entrypoints: [`src/cli/crawl-x-api.ts`](./src/cli/crawl-x-api.ts), [`src/cli/crawl-timeline.ts`](./src/cli/crawl-timeline.ts), [`src/cli/capture-x-api-timeline.ts`](./src/cli/capture-x-api-timeline.ts)
- Capture internals: [`src/server/openclaw-capture.ts`](./src/server/openclaw-capture.ts), [`src/server/openclaw-browser.ts`](./src/server/openclaw-browser.ts), [`src/lib/extract-tweets.ts`](./src/lib/extract-tweets.ts)
- Analysis pipeline: [`src/server/analysis-pipeline.ts`](./src/server/analysis-pipeline.ts), [`src/server/gemini-analysis.ts`](./src/server/gemini-analysis.ts), [`src/server/analysis-store.ts`](./src/server/analysis-store.ts)
- Asset rebuild and grouping: [`src/server/media-assets.ts`](./src/server/media-assets.ts), [`src/server/media-fingerprint.ts`](./src/server/media-fingerprint.ts), [`src/server/media-embedding.ts`](./src/server/media-embedding.ts)
- Search/indexing: [`src/server/chroma-facets.ts`](./src/server/chroma-facets.ts)
- Scheduler/run control: [`src/server/run-control.ts`](./src/server/run-control.ts), [`src/cli/scheduler.ts`](./src/cli/scheduler.ts), [`src/cli/run-stack.ts`](./src/cli/run-stack.ts)
- Shared contracts: [`src/lib/types.ts`](./src/lib/types.ts), [`src/lib/analysis-schema.ts`](./src/lib/analysis-schema.ts)
- Tests: [`tests/unit`](./tests/unit), [`tests/integration`](./tests/integration), [`tests/e2e`](./tests/e2e)

## Ground Truth Rules

- Treat `data/` as the runtime source of truth for the current app.
- Prefer reading the CLI file first for “how is this task triggered?” questions.
- Prefer reading the matching `src/server/*` file next for business logic.
- Prefer reading `src/lib/types.ts` before changing payload shape or file contracts.
- Be careful in a dirty worktree. This repo often has in-progress product changes.
- Do not assume Chroma or Gemini are available unless env and local services are configured.

## Quality Bar

- A local skill exists at [`/.agents/skills/stop-slop/SKILL.md`](.agents/skills/stop-slop/SKILL.md). Use its rules as a required pre-submit pass whenever you draft, edit, or review prose in this repo.
- A local gstack install exists at [`/skills/gstack`](./skills/gstack). Use the `/browse` skill from gstack for all web browsing in this repo.
- Never use `mcp__claude-in-chrome__*` tools in this repo.
- Available gstack skills:
  - `/plan-ceo-review`
  - `/plan-eng-review`
  - `/plan-design-review`
  - `/review`
  - `/ship`
  - `/browse`
  - `/qa`
  - `/qa-only`
  - `/qa-design-review`
  - `/setup-browser-cookies`
  - `/retro`
  - `/document-release`
- If gstack skills are not working, run `cd skills/gstack && ./setup` to build the binary and register the skills again.
- When you call `gemini` in this repo, tell it to load that skill file directly so the anti-slop pass happens inside the headless run too.
- Before submitting, run the `stop-slop` pass over UI copy, prompts, docs, and final explanations:
  - cut filler phrases and throat-clearing
  - break formulaic structures and predictable contrasts
  - vary sentence rhythm
  - trust the reader and state facts directly
  - cut anything that sounds like a pull-quote or explain-the-metaphor copy
- Also review the implementation for adjacent slop:
  - remove unnecessary abstractions, helpers, or indirection
  - tighten prompts and labels so they are specific and operational
  - check that loading, success, and failure states are visible in the UI
  - check that errors from local CLIs and model calls are surfaced clearly
  - check that interfaces preserve clean provider boundaries for future swaps
- If a change still feels generic, repetitive, ornamental, or weakly justified after that pass, keep editing until it does not.

## Documentation Maintenance

- Documentation is part of done. If you change behavior, architecture, contracts, workflows, or operator steps, update the relevant docs in the same task.
- Keep `agent_docs/` progressively disclosed:
  - high-level orientation in lower-numbered files
  - deeper subsystem details in later files
  - cross-link from summary docs to deeper docs instead of duplicating large explanations
- Update [`agent_docs/10-repo-map.md`](./agent_docs/10-repo-map.md) when directories, primary entrypoints, or ownership boundaries change.
- Update [`agent_docs/20-runtime-flows.md`](./agent_docs/20-runtime-flows.md) when data flow, orchestration, triggers, or external integrations change.
- Update [`agent_docs/30-data-layout.md`](./agent_docs/30-data-layout.md) when file formats, storage locations, or shared contracts change.
- Update [`agent_docs/40-operations.md`](./agent_docs/40-operations.md) when commands, env requirements, or runbooks change.
- Update [`agent_docs/50-change-playbooks.md`](./agent_docs/50-change-playbooks.md) when the recommended path for making changes shifts.
- Append notable decisions, tradeoffs, and lessons to [`agent_docs/60-decisions.md`](./agent_docs/60-decisions.md) when:
  - choosing one architecture over another
  - introducing a new subsystem or external dependency
  - deliberately keeping a temporary constraint or workaround
  - learning something non-obvious that future agents would otherwise have to rediscover
- Prefer short entries with date, context, decision, impact, and follow-up.
- If a change is too small to justify a decision entry, still update the relevant navigation or flow docs if user-facing or architectural understanding changed.

## Common Tasks

- “Where does the homepage get its data?” Open [`src/server/data.ts`](./src/server/data.ts).
- “How do runs get triggered and logged?” Open [`src/server/run-control.ts`](./src/server/run-control.ts).
- “Where are crawl manifests written?” Inspect `data/raw/*/manifest.json` and the crawl CLI files.
- “Where are per-usage analyses stored?” Open [`src/server/analysis-store.ts`](./src/server/analysis-store.ts).
- “Where are asset summaries and duplicate groups built?” Open [`src/server/media-assets.ts`](./src/server/media-assets.ts).
- “Where does facet search come from?” Open [`src/server/chroma-facets.ts`](./src/server/chroma-facets.ts).

## Commands Agents Will Actually Use

```bash
npm run dev
npm run check
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run crawl:x-api
npm run crawl:timeline
npm run analyze:missing
npm run media:rebuild
npm run scheduler
make up
```
