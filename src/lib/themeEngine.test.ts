import { describe, expect, it } from 'vitest';
import { resolveThemeMode } from './themeEngine';

describe('themeEngine', () => {
  it('resolves explicit appearance before system appearance', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });
});
