import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerFollowUpTask = vi.fn(() => ({ runControlId: "run-1" }));

vi.mock("@/src/server/run-control", () => ({
  triggerFollowUpTask
}));

describe("auto-analysis queues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues missing-usage analysis as a tracked follow-up task", async () => {
    const { queueMissingUsageAnalysis } = await import("@/src/server/auto-analysis");

    expect(queueMissingUsageAnalysis("test source")).toBe(true);
    expect(triggerFollowUpTask).toHaveBeenCalledWith("analyze_missing", "test source");
  });

  it("queues topic analysis as a tracked follow-up task", async () => {
    const { queueTopicAnalysisRefresh } = await import("@/src/server/auto-analysis");

    expect(queueTopicAnalysisRefresh("test source")).toBe(true);
    expect(triggerFollowUpTask).toHaveBeenCalledWith("analyze_topics", "test source");
  });
});
