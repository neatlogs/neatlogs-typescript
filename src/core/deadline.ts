export interface DeadlineOutcome<T> {
  completed: boolean;
  value?: T;
  error?: unknown;
}

/** Bound a third-party exporter/lifecycle promise by one absolute deadline. */
export async function runByDeadline<T>(
  operation: () => T | PromiseLike<T>,
  deadlineMs: number,
): Promise<DeadlineOutcome<T>> {
  const remaining = Math.max(0, deadlineMs - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("NEATLOGS_DEADLINE_EXCEEDED")),
      remaining,
    );
  });
  try {
    const value = await Promise.race([
      Promise.resolve().then(operation),
      timeout,
    ]);
    return { completed: true, value };
  } catch (error) {
    return { completed: false, error };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
