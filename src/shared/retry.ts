/** Retry only operations whose caller can safely replay. The first attempt is immediate. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options: {
    retries?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  } = {},
): Promise<T> {
  const {
    retries = 2,
    baseDelayMs = 300,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      await sleep(Math.min(baseDelayMs * 2 ** attempt, 3000) * (0.75 + random() * 0.5));
    }
  }
}
