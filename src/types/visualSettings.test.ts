import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_SETTINGS, getVisualCssVariables, sanitizeVisualSettings } from './visualSettings';

describe('visual settings', () => {
  it('falls back to safe defaults for unsupported values', () => {
    const settings = sanitizeVisualSettings({
      primary_color: 'javascript:alert(1)',
      font_family: 'Comic Sans MS' as never,
      border_radius: '9999px' as never,
      density: 'huge' as never,
    });
    expect(settings.primary_color).toBe(DEFAULT_VISUAL_SETTINGS.primary_color);
    expect(settings.font_family).toBe(DEFAULT_VISUAL_SETTINGS.font_family);
    expect(settings.border_radius).toBe(DEFAULT_VISUAL_SETTINGS.border_radius);
    expect(settings.density).toBe(DEFAULT_VISUAL_SETTINGS.density);
  });

  it('converts structured settings into CSS variables only', () => {
    const variables = getVisualCssVariables({ ...DEFAULT_VISUAL_SETTINGS, primary_color: '#123456', button_radius: 'rounded', density: 'compact' });
    expect(variables['--qb-primary']).toBe('#123456');
    expect(variables['--qb-button-radius']).toBe('999px');
    expect(variables['--qb-control-height']).toBe('2.5rem');
    expect(Object.keys(variables).some((key) => key.includes('javascript'))).toBe(false);
  });
});
