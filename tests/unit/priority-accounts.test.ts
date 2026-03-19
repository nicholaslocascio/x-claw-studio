import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("priority accounts store", () => {
  const configPath = path.join(process.cwd(), "data", "control", "priority-accounts.json");
  let previousFile: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    previousFile = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : null;
    fs.rmSync(configPath, { force: true });
  });

  afterEach(() => {
    if (previousFile === null) {
      fs.rmSync(configPath, { force: true });
      return;
    }

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, previousFile, "utf8");
  });

  it("normalizes and persists watched handles", async () => {
    const { readPriorityAccountsConfig, writePriorityAccountsConfig } = await import("@/src/server/priority-accounts");

    writePriorityAccountsConfig({
      enabled: true,
      handles: "@OpenAI\nopenai\n@sama, @_akhaliq"
    });

    const config = readPriorityAccountsConfig();
    expect(config.enabled).toBe(true);
    expect(config.accounts.map((entry) => entry.username)).toEqual(["_akhaliq", "openai", "sama"]);
  });
});
