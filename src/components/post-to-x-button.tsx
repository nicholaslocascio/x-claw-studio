"use client";

import { useEffect, useState } from "react";
import { getPreferredXStatusUrl } from "@/src/lib/x-status-url";
import type { CreateTypefullyDraftRequest, TypefullySocialSet } from "@/src/lib/typefully";

const SOCIAL_SET_STORAGE_KEY = "twitter-trend:typefully-social-set-id";

interface SaveToTypefullyButtonProps {
  mode?: CreateTypefullyDraftRequest["mode"];
  text: string;
  mediaFilePath?: string | null;
  replyToTweetUrl?: string | null;
  draftTitle?: string | null;
  scratchpadText?: string | null;
  draftId?: string | null;
  outputIndex?: number | null;
  initialSavedAt?: string | null;
  initialPrivateUrl?: string | null;
  initialShareUrl?: string | null;
  initialDraftStatus?: string | null;
  initialDraftId?: number | null;
  initialError?: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function PostToXButton(props: SaveToTypefullyButtonProps) {
  const [mode, setMode] = useState<CreateTypefullyDraftRequest["mode"]>(props.mode ?? "reply");
  const [replyToTweetUrl, setReplyToTweetUrl] = useState(props.replyToTweetUrl ?? "");
  const [socialSetId, setSocialSetId] = useState("");
  const [socialSets, setSocialSets] = useState<TypefullySocialSet[]>([]);
  const [isLoadingSocialSets, setIsLoadingSocialSets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(props.initialSavedAt ?? null);
  const [privateUrl, setPrivateUrl] = useState(props.initialPrivateUrl ?? null);
  const [shareUrl, setShareUrl] = useState(props.initialShareUrl ?? null);
  const [typefullyDraftId, setTypefullyDraftId] = useState<number | null>(props.initialDraftId ?? null);
  const [draftStatus, setDraftStatus] = useState(props.initialDraftStatus ?? null);
  const [errorMessage, setErrorMessage] = useState(props.initialError ?? null);
  const requiresTargetUrl = mode === "reply" || mode === "quote_post";
  const isMissingReplyTarget = requiresTargetUrl && !replyToTweetUrl.trim();
  const parsedSocialSetId = Number(socialSetId);
  const hasSocialSetOptions = socialSets.length > 0;
  const selectedSocialSet =
    Number.isInteger(parsedSocialSetId) && parsedSocialSetId > 0
      ? socialSets.find((item) => item.id === parsedSocialSetId) ?? null
      : null;
  const isMissingSocialSet = hasSocialSetOptions && !selectedSocialSet;
  const isSaveDisabled = isSaving || isLoadingSocialSets || isMissingReplyTarget || isMissingSocialSet;
  const buttonLabel =
    mode === "reply" ? "Save reply to Typefully" : mode === "quote_post" ? "Save quote post to Typefully" : "Save new post to Typefully";
  const targetLabel = mode === "quote_post" ? "quote target" : "reply target";
  const missingTargetLabel = mode === "quote_post" ? "missing quote target" : "missing reply target";

  useEffect(() => {
    const savedValue = typeof window !== "undefined" ? window.localStorage.getItem(SOCIAL_SET_STORAGE_KEY) : null;
    if (savedValue && !socialSetId) {
      setSocialSetId(savedValue);
    }
  }, [socialSetId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSocialSets(): Promise<void> {
      setIsLoadingSocialSets(true);

      try {
        const response = await fetch("/api/typefully/social-sets");
        const body = (await response.json().catch(() => null)) as
          | { socialSets?: TypefullySocialSet[]; error?: string }
          | null;

        if (!response.ok) {
          if (!cancelled) {
            setErrorMessage(body?.error || "Failed to load Typefully social sets");
          }
          return;
        }

        if (cancelled) {
          return;
        }

        const nextSocialSets = body?.socialSets ?? [];
        setSocialSets(nextSocialSets);

        if (!socialSetId && nextSocialSets.length === 1) {
          const nextId = String(nextSocialSets[0].id);
          setSocialSetId(nextId);
          window.localStorage.setItem(SOCIAL_SET_STORAGE_KEY, nextId);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load Typefully social sets");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSocialSets(false);
        }
      }
    }

    void loadSocialSets();

    return () => {
      cancelled = true;
    };
  }, [socialSetId]);

  async function saveDraft(): Promise<void> {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/typefully/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          text: props.text,
          mediaFilePath: props.mediaFilePath ?? null,
          replyToTweetUrl: replyToTweetUrl.trim() || null,
          socialSetId: Number.isInteger(parsedSocialSetId) && parsedSocialSetId > 0 ? parsedSocialSetId : null,
          draftTitle: props.draftTitle ?? null,
          scratchpadText: props.scratchpadText ?? null,
          draftId: props.draftId ?? null,
          outputIndex: props.outputIndex ?? null
        })
      });
      const body = (await response.json().catch(() => null)) as
        | {
            completedAt?: string;
            privateUrl?: string | null;
            shareUrl?: string | null;
            typefullyDraftId?: number;
            status?: string;
            error?: string;
          }
        | null;

      if (!response.ok) {
        setErrorMessage(body?.error || "Failed to save the Typefully draft");
        return;
      }

      setSavedAt(body?.completedAt ?? new Date().toISOString());
      setPrivateUrl(body?.privateUrl ?? null);
      setShareUrl(body?.shareUrl ?? null);
      setTypefullyDraftId(body?.typefullyDraftId ?? null);
      setDraftStatus(body?.status ?? null);
      if (Number.isInteger(parsedSocialSetId) && parsedSocialSetId > 0) {
        window.localStorage.setItem(SOCIAL_SET_STORAGE_KEY, String(parsedSocialSetId));
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save the Typefully draft");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="tt-button" onClick={() => void saveDraft()} disabled={isSaveDisabled}>
        <span>{isSaving ? "Saving draft..." : buttonLabel}</span>
      </button>

      <label className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
        <span>mode</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as CreateTypefullyDraftRequest["mode"])}
          className="tt-select h-9 min-w-[11rem] px-3 py-2"
          aria-label="Typefully draft mode"
        >
          <option value="reply">Reply</option>
          <option value="quote_post">Quote post</option>
          <option value="new_post">New post</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
        <span>set</span>
        {socialSets.length > 0 ? (
          <select
            value={socialSetId}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSocialSetId(nextValue);
              if (nextValue) {
                window.localStorage.setItem(SOCIAL_SET_STORAGE_KEY, nextValue);
              }
            }}
            className="tt-select h-9 min-w-[14rem] px-3 py-2"
            aria-label="Typefully social set"
          >
            <option value="">Select account</option>
            {socialSets.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.xUsername ? `@${item.xUsername}` : item.username ?? item.name ?? `social set ${item.id}`}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={socialSetId}
            onChange={(event) => setSocialSetId(event.target.value)}
            inputMode="numeric"
            className="tt-input h-9 w-24 px-3 py-2 text-center"
            aria-label="Typefully social set id"
            placeholder="env"
          />
        )}
      </label>

      {requiresTargetUrl ? (
        <label className="flex min-w-[18rem] flex-1 items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
          <span>{targetLabel}</span>
          <input
            value={replyToTweetUrl}
            onChange={(event) => setReplyToTweetUrl(event.target.value)}
            className="tt-input h-9 min-w-0 flex-1 px-3 py-2 text-left"
            aria-label={`${targetLabel} status URL`}
            placeholder="https://x.com/.../status/123"
          />
        </label>
      ) : null}

      {savedAt ? <span className="tt-chip tt-chip-accent">saved {formatDate(savedAt)}</span> : null}
      {isLoadingSocialSets ? <span className="tt-chip">loading sets</span> : null}
      {selectedSocialSet?.xUsername ? <span className="tt-chip">@{selectedSocialSet.xUsername}</span> : null}
      {draftStatus ? <span className="tt-chip">{draftStatus}</span> : null}
      {typefullyDraftId ? <span className="tt-chip">draft {typefullyDraftId}</span> : null}
      {privateUrl ? (
        <a href={privateUrl} target="_blank" rel="noreferrer" className="tt-link">
          <span>Open Typefully draft</span>
        </a>
      ) : null}
      {shareUrl ? (
        <a href={shareUrl} target="_blank" rel="noreferrer" className="tt-link">
          <span>Open share URL</span>
        </a>
      ) : null}
      {requiresTargetUrl && getPreferredXStatusUrl(replyToTweetUrl) ? (
        <a href={getPreferredXStatusUrl(replyToTweetUrl) as string} target="_blank" rel="noreferrer" className="tt-link">
          <span>Open target</span>
        </a>
      ) : null}
      {isMissingSocialSet ? <span className="tt-chip tt-chip-danger">select Typefully account</span> : null}
      {isMissingReplyTarget ? <span className="tt-chip">{missingTargetLabel}</span> : null}
      <span className="tt-chip">no direct post</span>
      {errorMessage ? <span className="tt-chip tt-chip-danger">{errorMessage}</span> : null}
    </div>
  );
}
