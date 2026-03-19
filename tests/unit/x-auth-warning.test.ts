import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunHistoryEntry } from "@/src/lib/types";

const readXAuthRecord = vi.fn();

vi.mock("@/src/server/x-auth", () => ({
  readXAuthRecord
}));

function createRunHistoryEntry(overrides: Partial<RunHistoryEntry>): RunHistoryEntry {
  return {
    runControlId: "run-1",
    task: "crawl_x_api",
    trigger: "scheduled",
    status: "failed",
    startedAt: "2026-03-16T22:02:38.365Z",
    completedAt: "2026-03-16T22:02:39.118Z",
    exitCode: 1,
    errorMessage: "Process exited with code 1",
    logPath: "data/control/logs/missing.log",
    manifestRunId: null,
    ...overrides
  };
}

describe("detectLatestXAuthWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readXAuthRecord.mockReturnValue(null);
  });

  it("clears the warning when active X auth was obtained after the failed crawl", async () => {
    readXAuthRecord.mockReturnValue({
      accountId: "nick",
      accessToken: "token",
      refreshToken: "refresh",
      tokenType: "bearer",
      scope: "tweet.read users.read offline.access",
      expiresAt: "2026-03-17T00:02:00.000Z",
      obtainedAt: "2026-03-16T22:05:00.000Z",
      userId: "1",
      username: "nick",
      name: "Nick",
      label: "@Nick"
    });

    const { detectLatestXAuthWarning } = await import("@/src/server/data");

    const warning = detectLatestXAuthWarning([
      createRunHistoryEntry({
        errorMessage: "Home timeline access needs a user-context token. The current token appears to be application-only."
      })
    ]);

    expect(warning).toBeNull();
  });

  it("clears the warning when a later X crawl succeeded", async () => {
    const { detectLatestXAuthWarning } = await import("@/src/server/data");

    const warning = detectLatestXAuthWarning([
      createRunHistoryEntry({
        runControlId: "run-success",
        status: "completed",
        startedAt: "2026-03-16T22:10:00.000Z",
        completedAt: "2026-03-16T22:11:00.000Z",
        exitCode: 0,
        errorMessage: null
      }),
      createRunHistoryEntry({
        runControlId: "run-failed",
        startedAt: "2026-03-16T22:02:38.365Z",
        errorMessage: "Home timeline access needs a user-context token. The current token appears to be application-only."
      })
    ]);

    expect(warning).toBeNull();
  });

  it("explains when the latest X crawl used an app-only bearer token", async () => {
    const { detectLatestXAuthWarning } = await import("@/src/server/data");

    const warning = detectLatestXAuthWarning([
      createRunHistoryEntry({
        errorMessage:
          "Home timeline access needs a user-context token. The current token appears to be application-only."
      })
    ]);

    expect(warning?.reason).toContain("app-only token");
    expect(warning?.reason).toContain("X_BEARER_TOKEN");
    expect(warning?.reason).toContain("connect X in Control");
  });
});
