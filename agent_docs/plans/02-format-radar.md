# Plan: Format Radar

## Goal

Build a ranking layer for "what post shapes are working now" alongside the existing topic radar.

The system should answer both:

- which topics are hot
- which formats are overperforming inside the current capture window

## Why

Topic heat and format heat are related but different.

A topic can be hot while the winning format shifts from threads to quote tweets. Right now we mostly detect topic momentum and leave format momentum implicit.

## Current Hooks We Can Reuse

- [src/server/tweet-topics.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/tweet-topics.ts)
- [src/server/trend-post-brief.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/trend-post-brief.ts)
- [src/server/data.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/data.ts)

## Proposed New Artifact

Add a cached file-backed format index, parallel to the topic index.

Suggested path:

- `data/analysis/formats/index.json`

Suggested record shape:

- `formatId`
- `label`
- `tweetCount`
- `recentTweetCount24h`
- `uniqueAuthorCount`
- `medianRelativeEngagement`
- `topExamples`
- `coOccurringTopics`
- `hotnessScore`

## Ranking Logic

Start simple.

Format hotness should combine:

- recency
- breadth across authors
- relative engagement, not just raw likes
- sample size floor so one lucky outlier does not dominate

This should live in a dedicated module rather than inside topic clustering.

## Implementation Steps

1. Add a new server module such as `src/server/post-formats.ts`.
2. Read tweet-level format labels from topic-analysis records.
3. Compute aggregate format clusters and hotness.
4. Persist a cached format index to `data/analysis/formats/index.json`.
5. Add a small server reader in [src/server/data.ts](/Users/nicklocascio/Projects/twitter-trend/src/server/data.ts).
6. Add a compact UI surface first, probably on the homepage or topics page, before building a full dedicated route.

## UI Shape

The first version does not need a new workspace.

It needs:

- a short list of top formats this week
- example tweets for each format
- quick notes about common hooks or media shapes

## Risks

- If the label taxonomy is too loose, the radar will be noisy.
- If we rank on raw likes, big accounts will swamp the signal.
- If we overfit to the last day, the radar will be unstable.

## Success Criteria

- We can say "quote tweets with reaction clips are up" or "threads are back" from local data.
- The trend brief can cite both topic and format signals.
- Composers can prefer a format explicitly instead of guessing from representative tweets.
