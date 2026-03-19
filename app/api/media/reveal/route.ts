import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const rawMediaRoot = path.join(projectRoot, "data", "raw");
const assetVideoRoot = path.join(projectRoot, "data", "analysis", "media-assets", "videos");
const memeTemplateAssetRoot = path.join(projectRoot, "data", "analysis", "meme-templates", "assets");

function resolveAllowedMediaPath(requestedPath: string | null | undefined): string | null {
  if (!requestedPath) {
    return null;
  }

  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(path.normalize(requestedPath))
    : path.resolve(projectRoot, path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, ""));

  const allowedRoots = [rawMediaRoot, assetVideoRoot, memeTemplateAssetRoot];
  const isAllowedPath = allowedRoots.some(
    (root) => absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`)
  );

  if (!isAllowedPath) {
    return null;
  }

  return absolutePath;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestedPath = typeof body?.path === "string" ? body.path : null;

  if (!requestedPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const absolutePath = resolveAllowedMediaPath(requestedPath);
  if (!absolutePath) {
    return NextResponse.json({ error: "Path is outside allowed media directories" }, { status: 403 });
  }

  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "Media path not found" }, { status: 404 });
  }

  try {
    await execFileAsync("open", ["-R", absolutePath]);
    return NextResponse.json({ ok: true, path: absolutePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open Finder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
