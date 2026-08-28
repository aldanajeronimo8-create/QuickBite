import { getErrorMessage } from './errorMessage';

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (context: { attempt: number; delayMs: number; error: unknown }) => void;
};

const TRANSIENT_ERROR_PATTERN = /failed to fetch|network(?:\s+error)?|network request failed|fetch failed|timeout|timed out|connection (?:reset|refused|closed)|econnreset|econnrefused|enotfound|gateway timeout|bad gateway|service unavailable|\b(?:429|502|503|504)\b/i;

export function isTransientError(error: unknown) {
  return TRANSIENT_ERROR_PATTERN.test(getErrorMessage(error, ''));
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

/**
 * Retries only errors that are likely temporary. Call this for reads or for
 * mutations that have a server-side idempotency key; it must not be used for
 * a blind retry of a non-idempotent write.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const shouldRetry = options.shouldRetry ?? isTransientError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !shouldRetry(error)) throw error;

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      options.onRetry?.({ attempt, delayMs, error });
      await wait(delayMs);
    }
  }

  throw new Error('No fue posible completar la operación.');
}
