interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: (error: any) => boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = options.retryableErrors(error);
      if (!isRetryable || attempt === options.maxAttempts) {
        throw new Error('Bad request');
      }
      const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

      // 3. Add full jitter: random value between 0 and cappedDelay
      const jitterDelay = Math.random() * cappedDelay;

      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }

  throw new Error('Retry loop exhausted without return or throw');
}
