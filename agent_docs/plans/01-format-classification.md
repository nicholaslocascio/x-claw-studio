# Plan: Format Classification

## Goal

Teach the system to identify the post shape of each captured tweet, not just its topic.

Examples:

- quote tweet with video clip
- quote tweet with image
- text-only hot take
- caps-lock news drop
- thread opener
- screenshot receipt
- reaction image
- meme template remix

## Why

The current stack is good at answering "what is this tweet about?" It is much weaker at answering "what kind of post is this in the feed?"

That gap matters because format is often the reusable part of a winning post.

## Current Hooks We Can Reuse

- [src/server/gemini-topic-analysis.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/gemini-topic-analysis.ts)
- [src/lib/types.ts](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts)
- [src/lib/analysis-schema.ts](/Users/nicklocascio/Projects/twitter-trend/src/lib/analysis-schema.ts)
- [src/server/data.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/data.ts)

We already have:

- tweet text
- media kind
- usage-level rhetoric fields such as `rhetorical_role`, `meme_format`, and `metaphor`
- topic analysis and clustering

## Proposed Contract Changes

Add a small format layer to the tweet-level topic analysis record.

Suggested fields:

- `postFormat`: primary format label
- `formatSignals`: 2 to 5 short supporting tags
- `hasQuoteContext`: whether the post is quoting or clearly reframing another post
- `hookStyle`: short label such as `question`, `declaration`, `caps_news`, `contrast`, `reaction_caption`

Keep the taxonomy intentionally small at first. A short, stable list will be easier to search, cluster, and test than a long open-ended label set.

## Implementation Steps

1. Extend the shared topic-analysis type in [src/lib/types.ts](/Users/nicklocascio/Projects/twitter-trend/src/lib/types.ts).
2. Extend the Gemini response schema and prompt in [src/server/gemini-topic-analysis.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/gemini-topic-analysis.ts).
3. Backfill existing topic-analysis files by rerunning topic analysis on a bounded sample first.
4. Expose the new labels in the read model from [src/server/data.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/data.ts).
5. Add lightweight UI chips on tweet and topic surfaces so operators can see the detected shape.

## Guardrails

- Do not ask the model to invent niche subgenres.
- Prefer one main format plus a few tags.
- If confidence is low, store `unknown` rather than a clever guess.

## Testing

- Unit tests for schema parsing and coercion.
- Fixture tests for obvious cases: thread opener, quote tweet, image macro, screenshot post.
- Snapshot a small real corpus sample and inspect label consistency by hand.

## Success Criteria

- Operators can filter or inspect tweets by format.
- Repeated viral shapes become visible without reading raw tweet text one by one.
- Composition prompts can reference a known format label instead of only topic notes.
