import { describe, expect, it } from "vitest";
import { composeAllGoals } from "@/src/server/composer-batch";

type BatchProgressEvent = {
  stage: string;
  message: string;
  detail?: string | null;
  goal?: string | null;
  completedGoals?: number;
  totalGoals?: number;
  runningGoals?: number;
  queuedGoals?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("composeAllGoals", () => {
  it("runs goals in parallel up to the requested concurrency and preserves result order", async () => {
    let activeRuns = 0;
    let maxActiveRuns = 0;
    const progressEvents: BatchProgressEvent[] = [];

    const results = await composeAllGoals<string, { mode: "single" | "all_goals"; goal?: string }, string, BatchProgressEvent>({
      goals: ["insight", "support", "critique", "signal_boost"],
      request: {
        mode: "all_goals",
        goal: "insight"
      },
      maxConcurrency: 2,
      async runSingle(request, options) {
        activeRuns += 1;
        maxActiveRuns = Math.max(maxActiveRuns, activeRuns);

        options?.onProgress?.({
          stage: "planning",
          message: `planning ${request.goal}`,
          goal: request.goal ?? null
        });

        await delay(request.goal === "insight" || request.goal === "critique" ? 20 : 5);

        options?.onProgress?.({
          stage: "completed",
          message: `completed ${request.goal}`,
          goal: request.goal ?? null
        });

        activeRuns -= 1;
        return request.goal ?? "unknown";
      },
      onProgress(event) {
        progressEvents.push(event);
      }
    });

    expect(results).toEqual(["insight", "support", "critique", "signal_boost"]);
    expect(maxActiveRuns).toBe(2);
    expect(progressEvents[0]).toMatchObject({
      stage: "starting",
      completedGoals: 0,
      totalGoals: 4,
      runningGoals: 0,
      queuedGoals: 4
    });
    expect(progressEvents).toContainEqual(
      expect.objectContaining({
        goal: "support",
        stage: "planning",
        runningGoals: 2,
        queuedGoals: 2
      })
    );
    expect(progressEvents.at(-1)).toMatchObject({
      stage: "completed",
      completedGoals: 4,
      totalGoals: 4,
      runningGoals: 0,
      queuedGoals: 0
    });
  });
});
