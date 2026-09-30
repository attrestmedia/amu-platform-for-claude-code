export function getMailRetryDecision(input: {
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
  now: Date;
}) {
  if (!input.retryable || input.attempts >= input.maxAttempts) {
    return { status: "failed" as const, nextAttemptAt: null };
  }
  const delayMs = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, input.attempts - 1));
  return { status: "retry_wait" as const, nextAttemptAt: new Date(input.now.getTime() + delayMs) };
}
