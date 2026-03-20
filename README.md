# x-claw-studio

Turn X into a local trend engine, media library, and post-writing weapon.

`x-claw-studio` captures tweets and media from X, stores everything on your machine, analyzes how media gets used, and gives you a workspace to search patterns, spot breakout formats, and draft better posts from your own corpus.

This is for operators, researchers, meme hunters, and growth people who do not want another black-box dashboard that shows charts and hides the raw material.

It ships both a dashboard and a real CLI, and it is OpenClaw-compatible out of the box.

There is also a repo-level agent guide at [`SKILL.md`](./SKILL.md) for agents that need a portable install, setup, and CLI reference.

## The Pitch

Most social tools tell you what happened.

This repo helps you keep the receipts:

- the tweets
- the media
- the context
- the analysis
- the reusable patterns

Then it gives you interfaces to turn that archive into output.

## Why People Will Care

- It is local-first, so you keep the raw tweets, media, and analysis
- It has a serious CLI, not just a UI wrapper
- It is compatible with existing OpenClaw-style capture flows and command aliases
- It closes the loop from capture to search to drafting in one repo

## What It Does

- Captures tweets and media from your X home timeline or a single tweet URL
- Stores raw crawl artifacts locally under `data/`
- Builds a media index with duplicate and similarity grouping
- Runs Gemini analysis on tweet-media usages
- Indexes analysis facets for local search with optional Chroma vector search
- Surfaces everything in a Next.js dashboard for review, topic discovery, and drafting

## Why This Is Interesting

Most X tools stop at monitoring. `x-claw-studio` is built around a tighter loop:

1. Capture what people are posting
2. Understand why the media works
3. Find reusable formats, themes, and reactions
4. Draft better replies and original posts from your own local corpus

If you care about going viral, this is the useful part: you are not just tracking topics. You are building a searchable library of how attention gets packaged.

## Who It Is For

- Solo founders posting every day
- Growth teams mining X for angles and reusable formats
- Researchers studying media usage, rhetoric, and topic spread
- Meme accounts and reply guys who want faster pattern recall
- Anyone who wants local ownership of their social intelligence stack

## Main Surfaces

- `/` home dashboard: capture status, queue, topics, search, and run controls
- `/tweets`: browse captured tweets with filtering and search
- `/queue`: review media usages
- `/search`: search the local media corpus by semantic facets
- `/topics`: inspect topic clusters and draft from them
- `/replies`: load a tweet and draft replies
- `/clone`: rewrite a source tweet with configurable preservation rules
- `/drafts`: review saved generated drafts

## Screenshots

Put screenshots in [`docs/screenshots/`](/Users/nicklocascio/Projects/twitter-trend/docs/screenshots) with these filenames:

- `dashboard-home.png`
- `media-composer.png`
- `media-search.png`
- `media-review.png`

Then this gallery will render as-is:

### Home Dashboard

The command center for capture, review, search, and composition.

![Home dashboard](docs/screenshots/dashboard-home.png)

### Draft From A Media Asset

Turn one saved asset into a new tweet with context, topic overlap, and angle hints.

![Media composer](docs/screenshots/media-composer.png)

### Search Reusable Media

Search your local corpus by mood, message, subject, or meme shape.

![Media search](docs/screenshots/media-search.png)

### Review What Is Repeating

See which assets keep showing up, what is getting starred, and where the hotness is building.

![Media review](docs/screenshots/media-review.png)

Best practice:

- Use full-width screenshots from real data
- Lead with the home dashboard first
- Show one screenshot per core workflow
- Favor dense, high-signal states over empty screens

## Stack

- Next.js app router dashboard
- TypeScript CLI pipeline
- Local filesystem storage in `data/`
- Gemini for analysis and topic extraction
- Optional Chroma for vector search
- Optional Typefully integration for saving drafts

## CLI First

The UI is useful. The CLI is a feature.

You can crawl, analyze, search, rebuild, inspect, and run the stack without living in the browser.

```bash
npm link
x-media-analyst help
```

High-signal commands:

```bash
x-media-analyst crawl x-api
x-media-analyst crawl openclaw
x-media-analyst capture openclaw-current-tweet
x-media-analyst analyze missing
x-media-analyst search facets --query "reaction image" --limit 5
x-media-analyst search tweets --query "OpenAI" --filter with_media --limit 50
x-media-analyst search topics --query "AI coding tools"
x-media-analyst media rebuild
x-media-analyst run stack
```

If you prefer terminal-first workflows, this repo fully supports that mode.

## OpenClaw Compatible

`x-claw-studio` keeps the OpenClaw path intact.

- `npm run crawl:openclaw` works as a compatibility alias
- `x-media-analyst crawl openclaw` is supported
- `x-media-analyst capture openclaw-current` is supported
- `x-media-analyst capture openclaw-current-tweet` is supported
- `x-media-analyst capture openclaw-current-tweet-and-compose-replies` is supported

If you already think in OpenClaw terms, you do not need to relearn the repo to get value from it.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm run dev
```

Open [http://localhost:4105](http://localhost:4105).

If you only want to look around the UI and existing local data, that is enough.

### 3. Or use the CLI directly

```bash
npm link
x-media-analyst app dev
```

## Setup

Create a `.env` file in the repo root and add only the keys you need for the flows you want to use.

### Required for X capture

```bash
X_BEARER_TOKEN=your_x_bearer_token
```

Optional:

```bash
X_USER_ID=your_x_user_id
APP_BASE_URL=http://localhost:4105
```

### Required for Gemini-powered analysis

```bash
GEMINI_API_KEY=your_gemini_api_key
```

You can use `GOOGLE_API_KEY` instead.

### Optional for vector search

Run local Chroma:

```bash
make chroma-up
```

Default local URL:

```bash
CHROMA_URL=http://localhost:8000
```

### Optional for saving drafts to Typefully

```bash
TYPEFULLY_API_KEY=your_typefully_api_key
TYPEFULLY_SOCIAL_SET_ID=123456
```

## Common Commands

```bash
npm run dev
npm run check
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run crawl:x-api
npm run analyze:missing
npm run analyze:topics -- --limit 100
npm run media:rebuild
npm run scheduler
make up
```

## Typical Workflow

### Capture tweets and media

```bash
npm run crawl:x-api
```

For a focused single tweet flow, use:

```bash
npm run capture:x-api-tweet
```

### Analyze what you captured

```bash
npm run analyze:missing
npm run analyze:topics -- --limit 100
```

### Rebuild media grouping and summaries

```bash
npm run media:rebuild
```

### Search from the CLI

```bash
npm run search:facets -- "reaction image"
npm run search:tweets -- --query "mask reveal"
```

## Why This Can Spread

- It solves a real pain for people who post on X constantly
- It is local-first, which makes it feel different from generic SaaS dashboards
- The outputs are visual, searchable, and easy to demo
- The loop from capture to composition is easy to explain in one sentence

The README, screenshots, and demo clips should sell that loop fast.

## CLI

This repo ships an installable CLI for capture, analysis, search, evals, wishlist management, and stack control.

```bash
npm link
x-media-analyst help
x-media-analyst repo root
```

Useful examples:

```bash
x-media-analyst facet list
x-media-analyst search facets --query "terminal dashboard" --limit 5
x-media-analyst search tweets --query "OpenAI" --filter with_media --limit 50
x-media-analyst search topics --query "OpenAI pricing backlash" --limit 5
x-media-analyst crawl openclaw
x-media-analyst app dev
x-media-analyst run stack
```

## Data Layout

The current runtime is file-backed. The app reads from local JSON artifacts, not a production database.

- `data/raw/`: crawl outputs and media
- `data/analysis/tweet-usages/`: per-usage analysis JSON
- `data/analysis/media-assets/`: asset summaries, duplicate groups, stars
- `data/analysis/topic-tweets/`: cached topic analyses
- `data/analysis/topics/`: aggregate topic clusters
- `data/control/`: scheduler config, run history, logs

## Full Local Stack

If you want the app, scheduler, and Chroma together:

```bash
make up
```

For the app only:

```bash
make up-dev
```

## Status

What works now:

- X API timeline and single-tweet capture
- Local artifact storage
- Media indexing and grouping
- Gemini-based usage analysis
- Topic extraction and browsing
- Local media and tweet search
- Reply, topic, media, and clone drafting workflows

Still local-operator oriented:

- You are expected to run services and keep env keys locally
- The source of truth is the filesystem under `data/`
- Some features are optional and only light up when the relevant env or local service exists

## Repo Guide

Start here if you want to understand or extend the codebase:

- [`agent_docs/00-start-here.md`](./agent_docs/00-start-here.md)
- [`agent_docs/10-repo-map.md`](./agent_docs/10-repo-map.md)
- [`agent_docs/20-runtime-flows.md`](./agent_docs/20-runtime-flows.md)
- [`agent_docs/40-operations.md`](./agent_docs/40-operations.md)
