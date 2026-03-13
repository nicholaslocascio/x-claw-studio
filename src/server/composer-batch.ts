export async function composeAllGoals<TGoal extends string, TRequest extends { mode: "single" | "all_goals" }, TResult, TProgress extends {
  stage: string;
  message: string;
  detail?: string | null;
  goal?: TGoal | null;
  completedGoals?: number;
  totalGoals?: number;
  runningGoals?: number;
  queuedGoals?: number;
}>(input: {
  goals: readonly TGoal[];
  request: TRequest;
  runSingle: (request: TRequest, options?: { onProgress?: (event: TProgress) => void }) => Promise<TResult>;
  onProgress?: (event: TProgress) => void;
  maxConcurrency?: number;
}): Promise<TResult[]> {
  const { goals, request, runSingle, onProgress } = input;
  const totalGoals = goals.length;
  const maxConcurrency = Math.max(1, Math.min(input.maxConcurrency ?? totalGoals, totalGoals));
  const results = new Array<TResult>(totalGoals);
  let nextIndex = 0;
  let completedGoals = 0;
  let runningGoals = 0;
  let failure: unknown = null;

  function emit(event: TProgress): void {
    onProgress?.(event);
  }

  function emitBatchProgress(event: Omit<TProgress, "completedGoals" | "totalGoals" | "runningGoals" | "queuedGoals">): void {
    emit({
      ...event,
      completedGoals,
      totalGoals,
      runningGoals,
      queuedGoals: Math.max(0, totalGoals - completedGoals - runningGoals)
    } as TProgress);
  }

  emitBatchProgress({
    stage: "starting",
    message: `Starting ${totalGoals} goals with concurrency ${maxConcurrency}`,
    detail: goals.join(" | "),
    goal: null
  } as Omit<TProgress, "completedGoals" | "totalGoals" | "runningGoals" | "queuedGoals">);

  async function runNext(): Promise<void> {
    if (failure || nextIndex >= totalGoals) {
      return;
    }

    const index = nextIndex;
    nextIndex += 1;
    const goal = goals[index] as TGoal;

    runningGoals += 1;
    emitBatchProgress({
      stage: "starting",
      message: `Started ${goal}`,
      detail: `slot ${runningGoals} of ${maxConcurrency}`,
      goal
    } as Omit<TProgress, "completedGoals" | "totalGoals" | "runningGoals" | "queuedGoals">);

    try {
      const result = await runSingle(
        {
          ...request,
          goal,
          mode: "single"
        } as TRequest,
        {
          onProgress(event) {
            emit({
              ...event,
              goal,
              completedGoals,
              totalGoals,
              runningGoals,
              queuedGoals: Math.max(0, totalGoals - completedGoals - runningGoals)
            });
          }
        }
      );

      results[index] = result;
      completedGoals += 1;
      runningGoals -= 1;

      emitBatchProgress({
        stage: "completed",
        message: `Finished ${goal}`,
        detail: `${completedGoals} of ${totalGoals} complete`,
        goal
      } as Omit<TProgress, "completedGoals" | "totalGoals" | "runningGoals" | "queuedGoals">);

      await runNext();
    } catch (error) {
      runningGoals -= 1;
      failure = error;
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, totalGoals) }, () => runNext()));

  if (failure) {
    throw failure;
  }

  return results;
}
