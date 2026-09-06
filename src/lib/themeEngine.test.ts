import { describe, expect, it } from 'vitest';
import { isWhiteSurfaceColor, resolveThemeMode } from './themeEngine';

describe('themeEngine', () => {
  it('resolves explicit appearance before system appearance', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });

  it('detects literal white surfaces that must not survive dark mode', () => {
    expect(isWhiteSurfaceColor('#FFFFFF')).toBe(true);
    expect(isWhiteSurfaceColor('#FFF')).toBe(true);
    expect(isWhiteSurfaceColor('rgba(255, 255, 255, 1)')).toBe(true);
    expect(isWhiteSurfaceColor('#111C30')).toBe(false);
  });
});
