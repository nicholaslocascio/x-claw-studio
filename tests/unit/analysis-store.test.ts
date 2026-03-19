import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
let tempDir: string;

describe("analysis-store", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-store-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("skips malformed analysis files when reading the full directory", async () => {
    const analysisDir = path.join(tempDir, "data", "analysis", "tweet-usages");
    fs.mkdirSync(analysisDir, { recursive: true });

    fs.writeFileSync(
      path.join(analysisDir, "good.json"),
      JSON.stringify({
        usageId: "usage-good",
        tweetId: "tweet-good",
        mediaIndex: 0,
        mediaKind: "image",
        status: "complete"
      })
    );
    fs.writeFileSync(
      path.join(analysisDir, "bad.json"),
      '{"usageId":"usage-bad","tweetId":"tweet-bad","mediaIndex":1,"mediaKind":"image","status":"complete"} trailing'
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { readAllUsageAnalyses } = await import("@/src/server/analysis-store");

    expect(readAllUsageAnalyses()).toEqual([
      expect.objectContaining({
        usageId: "usage-good",
        tweetId: "tweet-good",
        mediaIndex: 0,
        mediaKind: "image",
        status: "complete"
      })
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("bad.json");
  });

  it("returns null for a malformed single analysis file", async () => {
    const analysisDir = path.join(tempDir, "data", "analysis", "tweet-usages");
    fs.mkdirSync(analysisDir, { recursive: true });
    fs.writeFileSync(
      path.join(analysisDir, "usage-bad.json"),
      '{"usageId":"usage-bad","tweetId":"tweet-bad","mediaIndex":0,"mediaKind":"image","status":"complete"} nope'
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { readUsageAnalysis } = await import("@/src/server/analysis-store");

    expect(readUsageAnalysis("usage-bad")).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("usage-bad.json");
  });
});
