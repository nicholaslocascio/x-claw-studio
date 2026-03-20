# Plan: Source-Response Graph

## Goal

Track what a post is responding to, quoting, or reframing so the system can reason about borrowed context, not just standalone tweets.

## Why

Many strong posts are not fully legible on their own. They are reactions to:

- another tweet
- an article
- a launch announcement
- a screenshot
- a public statement

If we lose that relationship at capture time, we lose a large part of why the format worked.

## Current Hooks We Can Reuse

- [src/server/x-api.ts](../../src/server/x-api.ts)
- [src/server/x-api-capture.ts](../../src/server/x-api-capture.ts)
- [src/lib/types.ts](../../src/lib/types.ts)

The X API path already reads `referenced_tweets`, but the downstream extracted-tweet contract does not preserve enough of that relationship for analysis and composition.

## Proposed Contract Changes

Extend `ExtractedTweet` with lightweight source-reference fields.

Suggested additions:

- `referencedTweets`: list of referenced tweet ids and relation type
- `quotedTweetId`: convenience field if present
- `inReplyToTweetId`: convenience field if present
- `externalUrls`: normalized outbound links
- `conversationContext`: short derived summary if we later hydrate the source tweet

Do not force full source hydration in the first pass. Store ids and URLs first.

## Implementation Steps

1. Extend [src/lib/types.ts](../../src/lib/types.ts).
2. Map `referenced_tweets` and outbound URLs in [src/server/x-api.ts](../../src/server/x-api.ts).
3. Persist the new fields in manifests through [src/server/x-api-capture.ts](../../src/server/x-api-capture.ts).
4. Expose basic response-context hints in the read model.
5. Use these hints in format classification and composition prompts.

## Follow-On Work

Once ids are persisted reliably, we can add optional source hydration:

- fetch quoted source tweet on demand
- classify post as `reaction_to_launch`, `reaction_to_article`, `reaction_to_quote`, or `thread_reply`
- use source text in composer planning

## Risks

- Full source hydration could bloat capture if done synchronously.
- Not every external URL is meaningful context.
- Reply chains can get deep quickly, so we need a clear depth cap.

## Success Criteria

- Operators can tell which posts are standalone and which are responses.
- Format labels can distinguish quote-driven formats from standalone formats.
- Composers can propose "react to this source" moves with real context instead of generic topic summaries.
