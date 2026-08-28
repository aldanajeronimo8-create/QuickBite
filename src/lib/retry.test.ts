import { describe, expect, it, vi } from 'vitest';
import { isTransientError, withRetry } from './retry';

describe('withRetry', () => {
  it('reintenta un fallo temporal con un máximo de tres intentos', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(new Error('Gateway timeout'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(operation, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores de validación', async () => {
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('insufficient_stock'));

    await expect(withRetry(operation, { baseDelayMs: 0 })).rejects.toThrow('insufficient_stock');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('reconoce errores temporales de Supabase y red', () => {
    expect(isTransientError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isTransientError(new Error('invalid_quantity'))).toBe(false);
  });
});
