import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('uses the message from structured API errors', () => {
    expect(getErrorMessage({ message: 'Permiso denegado', code: '42501' })).toBe('Permiso denegado');
  });

  it('does not render an object as [object Object]', () => {
    expect(getErrorMessage({ code: '42501' }, 'No se pudo actualizar el pedido.')).toBe('42501');
  });

  it('uses the fallback when an error has no readable fields', () => {
    expect(getErrorMessage({}, 'No se pudo actualizar el pedido.')).toBe('No se pudo actualizar el pedido.');
  });
});
