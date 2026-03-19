import fs from "node:fs";
import path from "node:path";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "application/vnd.apple.mpegurl": ".m3u8",
  "application/x-mpegurl": ".m3u8",
  "audio/mpegurl": ".m3u8",
  "audio/x-mpegurl": ".m3u8",
  "video/iso.segment": ".m4s"
};

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2));
  fs.renameSync(tempFilePath, filePath);
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeContentType(contentType: string | null | undefined): string | null {
  const value = contentType?.split(";")[0]?.trim().toLowerCase();
  return value || null;
}

function inferExtensionFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const formatParam = parsedUrl.searchParams.get("format")?.trim().toLowerCase();
    if (formatParam) {
      if (formatParam === "jpeg") {
        return ".jpg";
      }

      if (/^[a-z0-9]+$/.test(formatParam)) {
        return `.${formatParam}`;
      }
    }

    const pathnameExtension = path.extname(parsedUrl.pathname).trim().toLowerCase();
    return pathnameExtension || null;
  } catch {
    return null;
  }
}

export function inferMediaExtension(
  url: string,
  contentType: string | null | undefined
): string | null {
  const normalizedContentType = normalizeContentType(contentType);
  if (normalizedContentType) {
    const contentTypeExtension = EXTENSION_BY_CONTENT_TYPE[normalizedContentType];
    if (contentTypeExtension) {
      return contentTypeExtension;
    }
  }

  return inferExtensionFromUrl(url);
}

export function inferMediaExtensionFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return ".png";
  }

  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") {
    return ".gif";
  }

  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return ".gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return ".mp4";
  }

  return null;
}
