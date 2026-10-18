import { describe, expect, it } from 'vitest';
import { nextAuthorizedOrderStatus } from './orderStatusTransitions';

describe('nextAuthorizedOrderStatus', () => {
  it.each([
    ['preparing', 'confirmed', 'ready'],
    ['ready', 'confirmed', 'delivered'],
    ['pending', 'confirmed', 'preparing'],
    ['preparing', 'pending', null],
    ['preparing', 'rejected', null],
    ['delivered', 'confirmed', null],
    ['rejected', 'confirmed', null],
    ['cancelled', 'confirmed', null],
  ] as const)('only allows the next authorized step for %s with payment %s', (status, paymentStatus, expected) => {
    expect(nextAuthorizedOrderStatus(status, paymentStatus)).toBe(expected);
  });
}
