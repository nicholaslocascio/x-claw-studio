# Plan: Relative Performance Scoring

## Goal

Add a reusable engagement score that makes captured tweets comparable across account sizes and time windows.

## Why

Raw likes are not enough.

A 50-like post from a small account may be more instructive than a 20,000-like post from a large account. We need one normalized score the rest of the system can reuse.

## Current Hooks We Can Reuse

- [src/lib/types.ts](../../src/lib/types.ts)
- [src/server/x-api.ts](../../src/server/x-api.ts)
- [src/server/data.ts](../../src/server/data.ts)
- [src/server/trend-post-brief.ts](../../src/server/trend-post-brief.ts)

We already capture:

- likes
- replies
- reposts
- bookmarks
- views

## Missing Inputs

The main missing piece is author-scale data for normalization.

We should capture and persist lightweight author metrics when available, especially:

- follower count
- following count if cheap
- verification or account type only if already available without extra complexity

## Proposed Score

Start with a transparent heuristic, not a hidden black box.

Suggested ingredients:

- replies weighted above likes
- reposts and quotes weighted above likes
- bookmarks weighted above likes
- optional view normalization when view counts are present
- author follower normalization when available
- age normalization so fresh posts and old posts are not mixed carelessly

This should produce:

- `relativeEngagementScore`
- `relativeEngagementBand` such as `baseline`, `strong`, `breakout`

## Implementation Steps

1. Extend capture types to persist author-scale fields when the API provides them.
2. Add a score helper in a focused server or lib module.
3. Compute the score in the read model for every captured tweet.
4. Expose it in trend briefs, topic ranking tie-breaks, and any future format radar.
5. Add sorting and filtering support where it helps operators.

## Guardrails

- Treat missing follower counts as "score unavailable" rather than inventing a fake baseline.
- Keep the formula documented in code comments and docs.
- Revisit weights after we have enough local samples, not before.

## Testing

- Unit tests for score calculation across edge cases.
- Fixture tests for small-account vs large-account comparisons.
- Regression tests for missing metrics and compact-number parsing.

## Success Criteria

- The system can highlight overperformers that raw-like sorting misses.
- Topic and format rankings become less dominated by large accounts.
- Future learning loops have a stable, reusable target metric.
