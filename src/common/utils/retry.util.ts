interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: (error: any) => boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const isRetryable = options.retryableErrors(error);

      if (!isRetryable || attempt === options.maxAttempts) {
        throw error;
      }

      const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

      // Add full jitter: random value between 0 and cappedDelay
      const jitterDelay = Math.random() * cappedDelay;

      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }

  throw lastError || new Error('Retry loop exhausted without return or throw');
}
