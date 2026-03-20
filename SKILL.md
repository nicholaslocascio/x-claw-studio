---
name: x-claw-studio
version: 0.1.0
description: Local-first X capture, search, analysis, and drafting studio with a real CLI and OpenClaw-compatible commands.
homepage: https://github.com/nick-locascio-alt/x-claw-studio
metadata: {"category":"social","runtime":"local-first","cli":"x-media-analyst","openclaw_compatible":true}
---

# x-claw-studio

`x-claw-studio` is a local-first X workflow tool for capturing tweets and media, analyzing how media gets used, searching a reusable corpus, and drafting new posts from what you captured.

It has two strong surfaces:

- a Next.js dashboard for review, search, and composition
- a serious CLI for capture, analysis, search, rebuilds, and stack control

It is also OpenClaw-compatible, so agents or operators already using OpenClaw naming can use familiar command paths here.

## Skill Files

| File | URL |
|------|-----|
| **SKILL.md** (this file) | `https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/SKILL.md` |
| **README.md** | `https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/README.md` |
| **package.json** | `https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/package.json` |

## Install Locally

For Codex-style local skills:

```bash
mkdir -p ~/.codex/skills/x-claw-studio
curl -L https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/SKILL.md > ~/.codex/skills/x-claw-studio/SKILL.md
curl -L https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/README.md > ~/.codex/skills/x-claw-studio/README.md
curl -L https://raw.githubusercontent.com/nick-locascio-alt/x-claw-studio/main/package.json > ~/.codex/skills/x-claw-studio/package.json
```

Or just read the files from the URLs above.

## What This Repo Is For

Use `x-claw-studio` when you want to:

- capture tweets and media from X into a local archive
- preserve tweet context around the media
- analyze what the media conveys and how it gets used
- search the saved corpus by semantic intent, subject, tone, or meme shape
- draft replies or original posts from topics or saved assets

This is especially useful for:

- growth operators
- solo founders
- social researchers
- meme hunters
- agents that need local retrieval over saved X media

## Install The Project

```bash
git clone git@github.com:nick-locascio-alt/x-claw-studio.git
cd x-claw-studio
npm install
```

## Run The App

Dashboard:

```bash
npm run dev
```

Open `http://localhost:4105`.

CLI-first flow:

```bash
npm link
x-media-analyst help
```

## Environment

Add a `.env` file in the repo root.

Required for X capture:

```bash
X_BEARER_TOKEN=your_x_bearer_token
```

Required for Gemini-powered analysis:

```bash
GEMINI_API_KEY=your_gemini_api_key
```

Optional:

```bash
X_USER_ID=your_x_user_id
APP_BASE_URL=http://localhost:4105
CHROMA_URL=http://localhost:8000
TYPEFULLY_API_KEY=your_typefully_api_key
TYPEFULLY_SOCIAL_SET_ID=123456
```

## Core CLI

The installable CLI is `x-media-analyst`.

Start here:

```bash
x-media-analyst help
x-media-analyst repo root
x-media-analyst app dev
x-media-analyst run stack
```

High-signal commands:

```bash
x-media-analyst crawl x-api
x-media-analyst crawl openclaw
x-media-analyst capture x-api-tweet
x-media-analyst capture openclaw-current-tweet
x-media-analyst analyze missing
x-media-analyst search facets --query "reaction image" --limit 5
x-media-analyst search tweets --query "OpenAI" --filter with_media --limit 50
x-media-analyst search topics --query "AI coding tools" --limit 5
x-media-analyst media rebuild
```

## OpenClaw Compatibility

Use these when an agent or operator expects OpenClaw-flavored naming:

```bash
npm run crawl:openclaw
x-media-analyst crawl openclaw
x-media-analyst capture openclaw-current
x-media-analyst capture openclaw-current-tweet
x-media-analyst capture openclaw-current-tweet-and-compose-replies
```

Those commands map onto the current X API capture path while preserving familiar naming.

## Typical Agent Workflow

1. Capture data with `x-media-analyst crawl x-api` or `x-media-analyst crawl openclaw`.
2. Run `x-media-analyst analyze missing` to fill in media usage analysis.
3. Rebuild the asset graph with `x-media-analyst media rebuild` when needed.
4. Search the local corpus with `x-media-analyst search facets`, `search tweets`, or `search topics`.
5. Open the dashboard or use the compose routes when you want a visual drafting workflow.

## Notes For Agents

- The runtime source of truth is local files under `data/`.
- The dashboard is useful, but the CLI is a first-class interface.
- `crawl:openclaw` and related `openclaw` commands are compatibility aliases, not a separate capture system.
- If you need deeper operator or architecture context, read `README.md` and `agent_docs/`.
