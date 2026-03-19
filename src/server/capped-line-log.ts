import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "@/src/lib/fs";

function countLines(text: string): number {
  if (!text) {
    return 0;
  }

  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}

export function createCappedLineLogWriter(input: {
  filePath: string;
  maxLines: number;
}): {
  appendLine: (line: string) => void;
} {
  ensureDir(path.dirname(input.filePath));

  let lineCount = 0;
  if (fs.existsSync(input.filePath)) {
    lineCount = countLines(fs.readFileSync(input.filePath, "utf8"));
  }

  function trimToCap(): void {
    if (lineCount <= input.maxLines) {
      return;
    }

    const lines = fs
      .readFileSync(input.filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
    const trimmed = lines.slice(-input.maxLines);
    fs.writeFileSync(input.filePath, trimmed.length > 0 ? `${trimmed.join("\n")}\n` : "");
    lineCount = trimmed.length;
  }

  return {
    appendLine(line: string): void {
      const normalized = line.replace(/\r?\n/g, " ").trim();
      if (!normalized) {
        return;
      }

      fs.appendFileSync(input.filePath, `${normalized}\n`);
      lineCount += 1;
      trimToCap();
    }
  };
}
