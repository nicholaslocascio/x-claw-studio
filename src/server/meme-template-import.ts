import fs from "node:fs";
import path from "node:path";
import { ensureMemeTemplateAssetDir, upsertMemeTemplate, buildMemeTemplateId } from "@/src/server/meme-template-store";
import { inferMediaExtension, inferMediaExtensionFromBuffer, slugify } from "@/src/lib/fs";
import { resolveMemingWorldAssets, fetchMemingWorldPage } from "@/src/server/meming-world";
import { fetchGenericMemePage, researchGroundedMemePage } from "@/src/server/grounded-meme-search";
import { researchMemingWorldMeme, summarizeMemingWorldMeme } from "@/src/server/meme-template-gemini";
import {
  findRelatedReplyMediaWishlistKeys,
  readReplyMediaWishlist,
  setReplyMediaWishlistStatuses
} from "@/src/server/reply-media-wishlist";
import type {
  MemeTemplateAssetRecord,
  MemeTemplateImportProgressEvent,
  MemeTemplateRecord
} from "@/src/lib/meme-template";

async function resolveImportSource(input: {
  label: string;
  key: string;
  onProgress?: (event: MemeTemplateImportProgressEvent) => void;
}): Promise<{
  source: "meming_world" | "grounded_web";
  research: { pageUrl: string; title: string; alternateNames: string[]; matchReason: string };
  page: {
    title: string;
    about: string | null;
    origin: string | null;
    meaning: string | null;
  };
  assets: {
    baseTemplateImageUrls: string[];
    exampleImageUrls: string[];
  };
}> {
  input.onProgress?.({
    stage: "researching",
    key: input.key,
    message: "Agent is finding the best meming.world page",
    detail: input.label
  });

  try {
    const research = await researchMemingWorldMeme(input.label);
    input.onProgress?.({
      stage: "researching",
      key: input.key,
      message: "Found matching meming.world page",
      detail: research.title
    });
    input.onProgress?.({
      stage: "fetching_page",
      key: input.key,
      message: "Fetching meming.world page details",
      detail: research.pageUrl
    });
    const page = await fetchMemingWorldPage({ pageUrl: research.pageUrl });
    input.onProgress?.({
      stage: "fetching_page",
      key: input.key,
      message: "Parsed meming.world page sections",
      detail: `${page.baseTemplateFilePageUrls.length} template refs | ${page.exampleFilePageUrls.length} example refs`
    });
    input.onProgress?.({
      stage: "resolving_assets",
      key: input.key,
      message: "Resolving meming.world image assets",
      detail: page.title || research.title
    });
    const assets = await resolveMemingWorldAssets({
      baseTemplateFilePageUrls: page.baseTemplateFilePageUrls,
      exampleFilePageUrls: page.exampleFilePageUrls
    });

    if (assets.baseTemplateImageUrls.length > 0 || assets.exampleImageUrls.length > 0) {
      return {
        source: "meming_world",
        research,
        page,
        assets
      };
    }
  } catch (error) {
    input.onProgress?.({
      stage: "researching",
      key: input.key,
      message: "Meming.world lookup failed, trying grounded web search",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  input.onProgress?.({
    stage: "researching",
    key: input.key,
    message: "Using grounded web search for fallback source",
    detail: input.label
  });
  const research = await researchGroundedMemePage(input.label);
  input.onProgress?.({
    stage: "researching",
    key: input.key,
    message: "Found grounded fallback page",
    detail: research.title
  });
  input.onProgress?.({
    stage: "fetching_page",
    key: input.key,
    message: "Fetching fallback page details",
    detail: research.pageUrl
  });
  const page = await fetchGenericMemePage({ pageUrl: research.pageUrl });
  const assets = {
    baseTemplateImageUrls: page.baseTemplateImageUrls,
    exampleImageUrls: page.exampleImageUrls
  };
  input.onProgress?.({
    stage: "resolving_assets",
    key: input.key,
    message: "Resolved fallback page assets",
    detail: `${assets.baseTemplateImageUrls.length} base | ${assets.exampleImageUrls.length} examples`
  });

  if (assets.baseTemplateImageUrls.length === 0 && assets.exampleImageUrls.length === 0) {
    throw new Error(`No usable images found on grounded fallback page ${research.pageUrl}`);
  }

  return {
    source: "grounded_web",
    research,
    page: {
      title: page.title,
      about: page.about,
      origin: page.origin,
      meaning: page.meaning
    },
    assets
  };
}

async function downloadAsset(input: {
  templateId: string;
  kind: "base_template" | "example";
  index: number;
  url: string;
  onProgress?: (event: MemeTemplateImportProgressEvent) => void;
  key?: string | null;
}): Promise<string> {
  input.onProgress?.({
    stage: "downloading_assets",
    key: input.key ?? null,
    message: `Downloading ${input.kind} asset ${input.index + 1}`,
    detail: input.url
  });
  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${input.url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension =
    inferMediaExtension(input.url, response.headers.get("content-type")) ??
    inferMediaExtensionFromBuffer(buffer) ??
    ".bin";
  const dir = ensureMemeTemplateAssetDir(input.templateId);
  const filePath = path.join(dir, `${input.kind}-${String(input.index + 1).padStart(2, "0")}${extension}`);
  fs.writeFileSync(filePath, buffer);
  input.onProgress?.({
    stage: "downloading_assets",
    key: input.key ?? null,
    message: `Saved ${input.kind} asset ${input.index + 1}`,
    detail: path.basename(filePath)
  });
  return filePath;
}

function buildAssetRecord(input: {
  kind: "base_template" | "example";
  url: string;
  localFilePath: string;
  caption?: string | null;
}): MemeTemplateAssetRecord {
  return {
    kind: input.kind,
    sourceUrl: input.url,
    localFilePath: input.localFilePath,
    caption: input.caption ?? null
  };
}

export async function importWishlistMemeFromMemingWorld(
  key: string,
  options?: {
    onProgress?: (event: MemeTemplateImportProgressEvent) => void;
  }
): Promise<MemeTemplateRecord> {
  const entry = readReplyMediaWishlist().find((item) => item.key === key);
  if (!entry) {
    throw new Error(`Unknown wishlist key "${key}"`);
  }

  options?.onProgress?.({
    stage: "starting",
    key: entry.key,
    message: "Loading wishlist entry",
    detail: entry.label
  });
  const resolved = await resolveImportSource({
    label: entry.label,
    key: entry.key,
    onProgress: options?.onProgress
  });
  const { research, page, assets } = resolved;
  options?.onProgress?.({
    stage: "resolving_assets",
    key: entry.key,
    message: "Resolved downloadable asset URLs",
    detail: `${assets.baseTemplateImageUrls.length} base | ${assets.exampleImageUrls.length} examples`
  });
  options?.onProgress?.({
    stage: "summarizing",
    key: entry.key,
    message: "Agent is summarizing how the meme is generally used",
    detail: `${assets.baseTemplateImageUrls.length} base | ${assets.exampleImageUrls.length} examples`
  });
  const summary = await summarizeMemingWorldMeme({
    label: entry.label,
    title: page.title || research.title,
    about: page.about,
    origin: page.origin,
    meaning: page.meaning
  });

  const templateId = buildMemeTemplateId(page.title || entry.label);
  options?.onProgress?.({
    stage: "downloading_assets",
    key: entry.key,
    message: "Downloading meme template assets locally",
    detail: `${assets.baseTemplateImageUrls.length + Math.min(4, assets.exampleImageUrls.length)} files planned`
  });
  const baseTemplate =
    assets.baseTemplateImageUrls[0]
      ? buildAssetRecord({
          kind: "base_template",
          url: assets.baseTemplateImageUrls[0],
          localFilePath: await downloadAsset({
            templateId,
            kind: "base_template",
            index: 0,
            url: assets.baseTemplateImageUrls[0],
            onProgress: options?.onProgress,
            key: entry.key
          })
        })
      : null;

  if (!assets.baseTemplateImageUrls[0]) {
    options?.onProgress?.({
      stage: "downloading_assets",
      key: entry.key,
      message: "No base template image was available",
      detail: page.title || research.title
    });
  }

  const examples = await Promise.all(
    assets.exampleImageUrls.slice(0, 4).map(async (url, index) =>
      buildAssetRecord({
        kind: "example",
        url,
        localFilePath: await downloadAsset({
          templateId,
          kind: "example",
          index,
          url,
          onProgress: options?.onProgress,
          key: entry.key
        })
      })
    )
  );

  const now = new Date().toISOString();
  options?.onProgress?.({
    stage: "saving",
    key: entry.key,
    message: "Saving template record and updating wishlist status",
    detail: templateId
  });
  const record = upsertMemeTemplate({
    templateId,
    key: entry.key || slugify(entry.label),
    label: entry.label,
    source: resolved.source,
    pageUrl: research.pageUrl,
    title: page.title || research.title,
    alternateNames: Array.from(new Set([research.title, ...research.alternateNames])).filter(Boolean),
    matchReason: research.matchReason,
    about: page.about,
    origin: page.origin,
    meaning: page.meaning,
    usageSummary: summary.usageSummary,
    commonUseCases: summary.commonUseCases,
    whyItWorks: summary.whyItWorks,
    toneTags: summary.toneTags,
    baseTemplate,
    examples,
    importedAt: now,
    updatedAt: now
  });

  const relatedWishlistKeys = findRelatedReplyMediaWishlistKeys({
    key: entry.key,
    label: entry.label,
    relatedLabels: [record.title, ...record.alternateNames]
  });
  setReplyMediaWishlistStatuses(relatedWishlistKeys, "collected");
  options?.onProgress?.({
    stage: "completed",
    key: entry.key,
    message: "Import complete",
    detail: `${record.title}${relatedWishlistKeys.length > 1 ? ` | synced ${relatedWishlistKeys.length} wishlist aliases` : ""}`
  });
  return record;
}
