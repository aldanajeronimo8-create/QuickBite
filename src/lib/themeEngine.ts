import type { ThemeMode } from '../types/theme';

export type ResolvedThemeMode = 'light' | 'dark';

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  return mode === 'dark' || (mode === 'system' && prefersDark) ? 'dark' : 'light';
}

export function isWhiteSurfaceColor(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === '#FFFFFF' || normalized === '#FFF' || normalized === 'RGB(255, 255, 255)' || normalized === 'RGBA(255, 255, 255, 1)';
}
