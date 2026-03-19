import { readRunHistory, triggerFollowUpTask } from "@/src/server/run-control";

function hasRunningTask(task: "analyze_missing" | "analyze_topics"): boolean {
  return readRunHistory().some((entry) => entry.task === task && entry.status === "running");
}

export function queueMissingUsageAnalysis(sourceLabel: string): boolean {
  try {
    const entry = triggerFollowUpTask("analyze_missing", sourceLabel);
    console.log(`Queued detached missing-usage analysis after ${sourceLabel}. run=${entry.runControlId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to queue detached missing-usage analysis after ${sourceLabel}: ${message}`);
    return false;
  }
}

export function queueMissingUsageAnalysisIfIdle(sourceLabel: string): boolean {
  if (hasRunningTask("analyze_missing")) {
    console.log(`Skipping detached missing-usage analysis after ${sourceLabel}; analyze_missing is already running.`);
    return false;
  }

  return queueMissingUsageAnalysis(sourceLabel);
}

export function queueTopicAnalysisRefresh(sourceLabel: string): boolean {
  try {
    const entry = triggerFollowUpTask("analyze_topics", sourceLabel);
    console.log(`Queued detached topic analysis after ${sourceLabel}. run=${entry.runControlId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to queue detached topic analysis after ${sourceLabel}: ${message}`);
    return false;
  }
}
