import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCappedLineLogWriter } from "@/src/server/capped-line-log";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0).reverse()) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("createCappedLineLogWriter", () => {
  it("keeps only the newest lines once the file passes the cap", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twitter-trend-log-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "stack-errors.log");
    const writer = createCappedLineLogWriter({
      filePath,
      maxLines: 3
    });

    writer.appendLine("one");
    writer.appendLine("two");
    writer.appendLine("three");
    writer.appendLine("four");

    expect(fs.readFileSync(filePath, "utf8")).toBe("two\nthree\nfour\n");
  });

  it("continues capping correctly when the file already exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twitter-trend-log-"));
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "stack-errors.log");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "alpha\nbeta\ngamma\n");

    const writer = createCappedLineLogWriter({
      filePath,
      maxLines: 3
    });

    writer.appendLine("delta");

    expect(fs.readFileSync(filePath, "utf8")).toBe("beta\ngamma\ndelta\n");
  });
});
