import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const projectRoot = process.cwd();
const rawMediaRoot = path.join(projectRoot, "data", "raw");
const assetVideoRoot = path.join(projectRoot, "data", "analysis", "media-assets", "videos");
const memeTemplateAssetRoot = path.join(projectRoot, "data", "analysis", "meme-templates", "assets");
const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
  ".bin": "application/octet-stream"
};

function inferMimeType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  const extensionMime = MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()];
  if (extensionMime && extensionMime !== "application/octet-stream") {
    return extensionMime;
  }

  if (lowerPath.includes("format-jpg") || lowerPath.includes(".jpg")) {
    return "image/jpeg";
  }

  if (lowerPath.includes("format-png") || lowerPath.includes(".png")) {
    return "image/png";
  }

  if (lowerPath.includes("format-webp") || lowerPath.includes(".webp")) {
    return "image/webp";
  }

  if (lowerPath.includes(".gif")) {
    return "image/gif";
  }

  return "application/octet-stream";
}

function inferMimeTypeFromBuffer(filePath: string, buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") {
    return "image/gif";
  }

  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }

  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }

  return inferMimeType(filePath);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");

  if (!requestedPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(path.normalize(requestedPath))
    : path.resolve(projectRoot, path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, ""));

  const allowedRoots = [rawMediaRoot, assetVideoRoot, memeTemplateAssetRoot];
  const isAllowedPath = allowedRoots.some(
    (root) => absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`)
  );

  if (!isAllowedPath) {
    return NextResponse.json({ error: "Path is outside allowed media directories" }, { status: 403 });
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return NextResponse.json({ error: "Media file not found" }, { status: 404 });
  }

  const buffer = await fs.promises.readFile(absolutePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": inferMimeTypeFromBuffer(absolutePath, buffer),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
