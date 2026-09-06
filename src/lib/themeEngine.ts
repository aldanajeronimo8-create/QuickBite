import type { RadiusOption, ThemeMode, VisualSettingsDraft } from '../types/visualSettings';

export type ResolvedThemeMode = 'light' | 'dark';

export const DARK_SURFACE_TOKENS = {
  background: '#070D19', surface: '#0D1628', surfaceMuted: '#111C30', surfaceElevated: '#16243A',
  text: '#F5F7FA', textSecondary: '#AAB7C9', textMuted: '#718096', border: 'rgba(170, 183, 201, 0.20)',
  separator: 'rgba(170, 183, 201, 0.12)', overlay: 'rgba(0, 0, 0, 0.62)',
} as const;

export const LIGHT_SURFACE_FALLBACKS = {
  background: '#F5F8F7', surface: '#FFFFFF', surfaceMuted: '#F1F5F9', surfaceElevated: '#EAF0F7',
  text: '#0F172A', textSecondary: '#475569', textMuted: '#64748B', border: '#E2E8F0',
  separator: '#E2E8F0', overlay: 'rgba(15, 23, 42, 0.48)',
} as const;

const RADIUS_CSS: Record<RadiusOption, string> = { sharp: '0px', small: '0.375rem', medium: '0.75rem', large: '1rem', rounded: '9999px' };
const CARD_RADIUS_CSS: Record<RadiusOption, string> = { sharp: '0px', small: '0.5rem', medium: '0.75rem', large: '1rem', rounded: '1.5rem' };

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  return mode === 'dark' || (mode === 'system' && prefersDark) ? 'dark' : 'light';
}

export function getThemeRuntimeVariables(settings: VisualSettingsDraft): Record<string, string> {
  const shadow = {
    none: 'none',
    subtle: '0 2px 10px rgba(15, 23, 42, 0.06)',
    normal: '0 8px 24px rgba(15, 23, 42, 0.10)',
    elevated: '0 16px 40px rgba(15, 23, 42, 0.14)',
  }[settings.shadow_style];

  return {
    '--qb-primary': settings.primary_color,
    '--qb-secondary': settings.secondary_color,
    '--qb-accent': settings.accent_color,
    '--qb-success': settings.success_color,
    '--qb-warning': settings.warning_color,
    '--qb-error': settings.danger_color,
    '--qb-light-background': settings.background_color,
    '--qb-light-surface': settings.surface_color,
    '--qb-light-text': settings.text_color,
    '--qb-light-text-secondary': settings.muted_text_color,
    '--qb-light-border': settings.border_color,
    '--qb-shadow': shadow,
    '--qb-radius': RADIUS_CSS[settings.border_radius],
    '--qb-card-radius': CARD_RADIUS_CSS[settings.card_radius],
    '--qb-button-radius': RADIUS_CSS[settings.button_radius],
    '--qb-font-family': settings.font_family === 'system-ui' ? 'ui-sans-serif, system-ui, sans-serif' : `${settings.font_family}, ui-sans-serif, system-ui, sans-serif`,
    '--qb-heading-font': settings.heading_font === 'system-ui' ? 'ui-sans-serif, system-ui, sans-serif' : `${settings.heading_font}, ui-sans-serif, system-ui, sans-serif`,
    '--qb-density-spacing': settings.density === 'compact' ? '0.75rem' : settings.density === 'comfortable' ? '1.25rem' : '1rem',
    '--qb-control-height': settings.density === 'compact' ? '2.5rem' : settings.density === 'comfortable' ? '3rem' : '2.75rem',
    '--qb-header-style': settings.header_style,
    '--qb-navigation-style': settings.navigation_style,
    '--qb-card-style': settings.card_style,
    '--qb-input-style': settings.input_style,
  };
}

export function isWhiteSurfaceColor(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === '#FFFFFF' || normalized === '#FFF' || normalized === 'RGB(255, 255, 255)' || normalized === 'RGBA(255, 255, 255, 1)';
}
