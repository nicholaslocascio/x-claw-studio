# Plan: Outcome Memory

## Goal

Close the loop between generated drafts, published posts, and real performance so the system can learn account-specific preferences over time.

## Why

Right now the stack is strongest at observing the market and drafting from it.

The next step is memory:

- what we recommended
- what actually got published
- what happened next

Without that loop, the system can spot trends but cannot calibrate to a specific account.

## Current Hooks We Can Reuse

- [src/server/generated-drafts.ts](../../src/server/generated-drafts.ts)
- [src/lib/generated-drafts.ts](../../src/lib/generated-drafts.ts)
- [src/server/typefully.ts](../../src/server/typefully.ts)
- [src/server/x-api.ts](../../src/server/x-api.ts)

We already persist generated drafts. That gives us a natural spine for learning data.

## Proposed New Artifact

Add a file-backed outcome store, for example:

- `data/analysis/post-outcomes/index.json`

Suggested record shape:

- draft id
- published tweet id or external draft id
- publish timestamp
- topic id or topic labels used
- planned format
- selected media asset id
- actual metrics snapshot history
- final relative engagement score
- notes about whether it matched the original recommendation

## Implementation Steps

1. Extend generated-draft records with stable metadata needed for later joins.
2. Add a way to mark a draft as published, either from Typefully metadata or a manual operator action.
3. Add a fetch path that refreshes metrics for published tweet ids on a schedule or on demand.
4. Persist time-series metric snapshots rather than only one final total.
5. Build a small learning summary layer:
   - winning topics
   - winning formats
   - best media shapes
   - best posting windows
   - repeated misses

## Product Use

This should feed back into:

- topic composition
- media-led composition
- trend briefs
- a future "what tends to work for this account" panel

## Guardrails

- Keep account-specific learning clearly separated from market-wide trend detection.
- Do not overfit on tiny sample sizes.
- Store enough provenance that operators can inspect why the system learned a rule.

## Testing

- Unit tests for outcome record updates and metric snapshots.
- Fixture tests for joining generated drafts to published posts.
- Manual verification against a few known published posts before trusting any learned guidance.

## Success Criteria

- We can explain which recommendations turned into published posts and how they performed.
- The system can produce account-specific advice, not only market-wide advice.
- Prompting can prefer formats and topics that have already worked for the target account.
