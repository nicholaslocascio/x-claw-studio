import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { force: true, recursive: true });
  }
});

describe("/api/media/local", () => {
  it("serves meme-template assets from an absolute in-repo path", async () => {
    const assetDir = path.join(
      projectRoot,
      "data",
      "analysis",
      "meme-templates",
      "assets",
      `test-${Date.now()}`
    );
    const assetPath = path.join(assetDir, "template.jpg");

    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(assetPath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
    createdPaths.push(assetDir);

    const { GET } = await import("@/app/api/media/local/route");
    const response = await GET(
      new Request(`http://localhost:4105/api/media/local?path=${encodeURIComponent(assetPath)}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
  });

  it("rejects absolute paths outside the allowed media roots", async () => {
    const outsidePath = path.join(projectRoot, "package.json");
    const { GET } = await import("@/app/api/media/local/route");
    const response = await GET(
      new Request(`http://localhost:4105/api/media/local?path=${encodeURIComponent(outsidePath)}`)
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Path is outside allowed media directories"
    });
  });
});
