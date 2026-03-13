import fs from "node:fs";
import path from "node:path";
import { getTypefullyApiKey, getTypefullyDefaultSocialSetId } from "@/src/lib/env";
import type { TypefullySocialSet } from "@/src/lib/typefully";
import type { CreateTypefullyDraftRequest, CreateTypefullyDraftResult } from "@/src/lib/typefully";
import { normalizeXStatusUrl } from "@/src/lib/x-status-url";

const TYPEFULLY_API_BASE_URL = "https://api.typefully.com/v2";
const TYPEFULLY_MEDIA_POLL_TIMEOUT_MS = Math.max(15_000, Number(process.env.TYPEFULLY_MEDIA_POLL_TIMEOUT_MS || 90_000));
const TYPEFULLY_MEDIA_POLL_INTERVAL_MS = Math.max(1_000, Number(process.env.TYPEFULLY_MEDIA_POLL_INTERVAL_MS || 2_500));

interface TypefullyDraftResponse {
  id: number;
  social_set_id: number;
  status: string;
  preview: string | null;
  private_url: string | null;
  share_url: string | null;
}

interface TypefullySocialSetListResponse {
  results: Array<{
    id: number;
    username?: string | null;
    name?: string | null;
    profile_image_url?: string | null;
  }>;
}

interface TypefullySocialSetDetailResponse {
  id: number;
  username?: string | null;
  name?: string | null;
  profile_image_url?: string | null;
  platforms?: {
    x?: {
      username?: string | null;
      name?: string | null;
      profile_url?: string | null;
    } | null;
  } | null;
}

interface TypefullyMediaUploadResponse {
  media_id: string;
  upload_url: string;
}

interface TypefullyMediaStatusResponse {
  media_id: string;
  status: string;
  error_reason?: string | null;
}

function resolveSocialSetId(input: number | null | undefined): number {
  if (typeof input === "number" && Number.isInteger(input) && input > 0) {
    return input;
  }

  const envValue = getTypefullyDefaultSocialSetId();
  if (envValue) {
    return envValue;
  }

  throw new Error("Typefully social set id is required. Set TYPEFULLY_SOCIAL_SET_ID or enter a social set id in the UI.");
}

function resolveProjectFilePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

async function requestTypefully<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${TYPEFULLY_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getTypefullyApiKey()}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Typefully request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function listTypefullySocialSets(): Promise<TypefullySocialSet[]> {
  const list = await requestTypefully<TypefullySocialSetListResponse>("/social-sets?limit=50&offset=0");
  const details = await Promise.all(
    (list.results ?? []).map(async (item) => {
      try {
        return await requestTypefully<TypefullySocialSetDetailResponse>(`/social-sets/${item.id}/`);
      } catch {
        return {
          id: item.id,
          username: item.username ?? null,
          name: item.name ?? null,
          profile_image_url: item.profile_image_url ?? null,
          platforms: null
        } satisfies TypefullySocialSetDetailResponse;
      }
    })
  );

  return details.map((item) => ({
    id: item.id,
    username: item.username ?? null,
    name: item.name ?? null,
    profileImageUrl: item.profile_image_url ?? null,
    xUsername: item.platforms?.x?.username ?? null,
    xName: item.platforms?.x?.name ?? null,
    xProfileUrl: item.platforms?.x?.profile_url ?? null
  }));
}

async function uploadMediaToTypefully(socialSetId: number, mediaFilePath: string): Promise<string> {
  const resolvedPath = resolveProjectFilePath(mediaFilePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Media file does not exist: ${resolvedPath}`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  const fileName = path.basename(resolvedPath);
  const upload = await requestTypefully<TypefullyMediaUploadResponse>(`/social-sets/${socialSetId}/media/upload`, {
    method: "POST",
    body: JSON.stringify({ file_name: fileName })
  });

  const uploadResponse = await fetch(upload.upload_url, {
    method: "PUT",
    body: buffer
  });
  if (!uploadResponse.ok) {
    throw new Error(`Typefully media upload failed with ${uploadResponse.status}`);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < TYPEFULLY_MEDIA_POLL_TIMEOUT_MS) {
    const status = await requestTypefully<TypefullyMediaStatusResponse>(
      `/social-sets/${socialSetId}/media/${upload.media_id}`
    );

    if (status.status === "ready") {
      return upload.media_id;
    }

    if (status.status === "error") {
      throw new Error(status.error_reason || "Typefully media processing failed");
    }

    await new Promise((resolve) => setTimeout(resolve, TYPEFULLY_MEDIA_POLL_INTERVAL_MS));
  }

  throw new Error("Timed out waiting for Typefully media processing to finish.");
}

export async function createTypefullyDraft(input: CreateTypefullyDraftRequest): Promise<CreateTypefullyDraftResult> {
  const socialSetId = resolveSocialSetId(input.socialSetId);
  const mediaId = input.mediaFilePath ? await uploadMediaToTypefully(socialSetId, input.mediaFilePath) : null;
  const targetUrl = input.mode === "new_post" ? null : normalizeXStatusUrl(input.replyToTweetUrl ?? null);

  if ((input.mode === "reply" || input.mode === "quote_post") && !targetUrl) {
    throw new Error(`${input.mode === "reply" ? "Reply" : "Quote"} drafts require a valid X status URL.`);
  }

  const draft = await requestTypefully<TypefullyDraftResponse>(`/social-sets/${socialSetId}/drafts`, {
    method: "POST",
    body: JSON.stringify({
      draft_title: input.draftTitle ?? null,
      scratchpad_text: input.scratchpadText ?? null,
      share: false,
      platforms: {
        x: {
          enabled: true,
          posts: [
            {
              text: input.text,
              ...(mediaId ? { media_ids: [mediaId] } : {}),
              ...(input.mode === "quote_post" && targetUrl ? { quote_post_url: targetUrl } : {})
            }
          ],
          settings: {
            ...(input.mode === "reply" && targetUrl ? { reply_to_url: targetUrl } : {})
          }
        }
      }
    })
  });

  return {
    ok: true,
    mode: input.mode,
    completedAt: new Date().toISOString(),
    socialSetId,
    typefullyDraftId: draft.id,
    status: draft.status,
    preview: draft.preview,
    privateUrl: draft.private_url,
    shareUrl: draft.share_url,
    mediaId,
    draftId: input.draftId ?? null,
    outputIndex: input.outputIndex ?? null
  };
}
