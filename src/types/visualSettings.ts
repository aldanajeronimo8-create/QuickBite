export const ALLOWED_FONTS = ['Nunito', 'Inter', 'Poppins', 'Roboto', 'system-ui'] as const;
export const RADIUS_OPTIONS = ['sharp', 'small', 'medium', 'large', 'rounded'] as const;
export const SHADOW_OPTIONS = ['none', 'subtle', 'normal', 'elevated'] as const;
export const BUTTON_STYLES = ['solid', 'soft', 'outline', 'ghost'] as const;
export const HEADER_STYLES = ['standard', 'minimal', 'prominent'] as const;
export const NAVIGATION_STYLES = ['solid', 'soft', 'glass'] as const;
export const CARD_STYLES = ['flat', 'outlined', 'elevated', 'glass'] as const;
export const INPUT_STYLES = ['outlined', 'soft', 'filled'] as const;
export const DENSITY_OPTIONS = ['compact', 'normal', 'comfortable'] as const;
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type AllowedFont = typeof ALLOWED_FONTS[number];
export type RadiusOption = typeof RADIUS_OPTIONS[number];
export type ShadowStyle = typeof SHADOW_OPTIONS[number];
export type ButtonStyle = typeof BUTTON_STYLES[number];
export type HeaderStyle = typeof HEADER_STYLES[number];
export type NavigationStyle = typeof NAVIGATION_STYLES[number];
export type CardStyle = typeof CARD_STYLES[number];
export type InputStyle = typeof INPUT_STYLES[number];
export type Density = typeof DENSITY_OPTIONS[number];
export type ThemeMode = typeof THEME_MODES[number];
export const VISUAL_INTERFACE_SCOPES = ['login_student', 'login_parent', 'login_admin', 'student', 'parent', 'admin'] as const;
export type VisualInterfaceScope = typeof VISUAL_INTERFACE_SCOPES[number];

export type VisualElementStyle = Partial<{
  textContent: string; backgroundColor: string; backgroundImage: string; color: string; borderColor: string;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted' | 'double'; borderWidth: string; borderRadius: string; boxShadow: string;
  fontFamily: string; fontSize: string; fontWeight: '400' | '500' | '600' | '700' | '800' | '900'; lineHeight: string; letterSpacing: string;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; textDecoration: 'none' | 'underline' | 'line-through';
  textAlign: 'left' | 'center' | 'right' | 'justify'; padding: string; paddingTop: string; paddingRight: string; paddingBottom: string; paddingLeft: string;
  margin: string; marginTop: string; marginRight: string; marginBottom: string; marginLeft: string;
  width: string; minWidth: string; maxWidth: string; height: string; minHeight: string; maxHeight: string; opacity: string;
  display: 'block' | 'inline' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'none';
  position: 'static' | 'relative' | 'absolute' | 'sticky'; top: string; right: string; bottom: string; left: string; zIndex: string;
  flexDirection: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline'; gap: string; rowGap: string; columnGap: string; gridTemplateColumns: string;
  overflow: 'visible' | 'hidden' | 'auto' | 'scroll'; cursor: 'default' | 'pointer' | 'text' | 'not-allowed' | 'grab';
  objectFit: 'contain' | 'cover' | 'fill' | 'none'; transform: string; transition: string; filter: string; backdropFilter: string; outline: string; outlineOffset: string;
}>;
export type VisualElementOverrides = Record<string, VisualElementStyle>;
export type VisualInterfaceOverride = Partial<Omit<VisualSettingsDraft, 'interface_overrides'>>;
export type VisualInterfaceOverrides = Partial<Record<VisualInterfaceScope, VisualInterfaceOverride>>;

export interface VisualSettings {
  id: boolean; app_name: string; logo_url: string | null; favicon_url: string | null; login_logo_url: string | null;
  primary_color: string; secondary_color: string; accent_color: string; background_color: string; surface_color: string; text_color: string; muted_text_color: string; border_color: string; success_color: string; warning_color: string; danger_color: string;
  font_family: AllowedFont; heading_font: AllowedFont; border_radius: RadiusOption; card_radius: RadiusOption; button_radius: RadiusOption; shadow_style: ShadowStyle; button_style: ButtonStyle; header_style: HeaderStyle; navigation_style: NavigationStyle; card_style: CardStyle; input_style: InputStyle; density: Density; theme_mode: ThemeMode;
  interface_overrides: VisualInterfaceOverrides; element_overrides: VisualElementOverrides; updated_at: string; updated_by: string | null;
}
export type VisualSettingsDraft = Omit<VisualSettings, 'id' | 'updated_at' | 'updated_by'>;
export const DEFAULT_VISUAL_SETTINGS: VisualSettingsDraft = {
  app_name: 'QuickBite', logo_url: null, favicon_url: null, login_logo_url: null,
  primary_color: '#16A36A', secondary_color: '#E0ECFF', accent_color: '#14B8A6', background_color: '#F5F8F7', surface_color: '#FFFFFF', text_color: '#0F172A', muted_text_color: '#475569', border_color: '#E2E8F0', success_color: '#16A36A', warning_color: '#D97706', danger_color: '#DC2626',
  font_family: 'Nunito', heading_font: 'Nunito', border_radius: 'medium', card_radius: 'large', button_radius: 'medium', shadow_style: 'subtle', button_style: 'solid', header_style: 'standard', navigation_style: 'solid', card_style: 'elevated', input_style: 'outlined', density: 'normal', theme_mode: 'light', interface_overrides: {}, element_overrides: {},
};

export function isHexColor(value: string): boolean { return /^#[0-9A-Fa-f]{6}$/.test(value); }
const SAFE_CSS_VALUE = /^-?(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|vmin|vmax|ch)?$/;
const SAFE_LOOSE = /^[^{};<>]{0,300}$/;
const SAFE_OPACITY = /^(?:0|0?\.\d+|1)$/;
const SAFE_TRANSFORM = /^(?:none|translate[XYZ]?\([^;{}]+\)|scale(?:[XYZ])?\([^;{}]+\)|rotate(?:X|Y|Z)?\([^;{}]+\)|skew[XY]?\([^;{}]+\))(?:\s+(?:translate[XYZ]?|scale(?:[XYZ])?|rotate(?:X|Y|Z)?|skew[XY]?)[^;{}]*)*$/;
const SAFE_FILTER = /^(?:none|blur|brightness|contrast|grayscale|saturate|sepia|drop-shadow)\([^;{}]+\)(?:\s+(?:blur|brightness|contrast|grayscale|saturate|sepia|drop-shadow)\([^;{}]+\))*$/;
const SAFE_SHADOW = /^(?:none|(?:-?\d{1,3}px\s+){2}-?\d{1,3}px(?:\s+-?\d{1,3}px)?(?:\s+(?:#[0-9a-fA-F]{6}|rgba?\([^;{}]{1,100}\)))?)$/;
const ELEMENT_OVERRIDE_KEYS = ['textContent','backgroundColor','backgroundImage','color','borderColor','borderStyle','borderWidth','borderRadius','boxShadow','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','textDecoration','textAlign','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','width','minWidth','maxWidth','height','minHeight','maxHeight','opacity','display','position','top','right','bottom','left','zIndex','flexDirection','justifyContent','alignItems','gap','rowGap','columnGap','gridTemplateColumns','overflow','cursor','objectFit','transform','transition','filter','backdropFilter','outline','outlineOffset'] as const;
function hasControlCharacters(value: string): boolean { for (const char of value) { const code = char.charCodeAt(0); if ((code >= 0 && code <= 31) || code === 127) return true; } return false; }
function safeCss(value: unknown): value is string { return typeof value === 'string' && SAFE_CSS_VALUE.test(value); }
function safeLoose(value: unknown): value is string { return typeof value === 'string' && value.length <= 300 && !hasControlCharacters(value) && SAFE_LOOSE.test(value); }

export function sanitizeVisualElementStyle(value: unknown): VisualElementStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>; const result: VisualElementStyle = {};
  if (typeof source.textContent === 'string' && source.textContent.length <= 500 && !hasControlCharacters(source.textContent)) result.textContent = source.textContent;
  for (const key of ['backgroundColor','color','borderColor'] as const) if (typeof source[key] === 'string' && isHexColor(source[key])) result[key] = source[key].toUpperCase();
  if (typeof source.backgroundImage === 'string' && /^(none|linear-gradient\([^;{}]+\))$/.test(source.backgroundImage)) result.backgroundImage = source.backgroundImage;
  if (source.borderStyle === 'none' || source.borderStyle === 'solid' || source.borderStyle === 'dashed' || source.borderStyle === 'dotted' || source.borderStyle === 'double') result.borderStyle = source.borderStyle;
  for (const key of ['borderWidth','borderRadius','fontSize','lineHeight','letterSpacing','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','width','minWidth','maxWidth','height','minHeight','maxHeight','top','right','bottom','left','zIndex','gap','rowGap','columnGap','outlineOffset'] as const) if (safeCss(source[key])) result[key] = source[key];
  if (typeof source.boxShadow === 'string' && SAFE_SHADOW.test(source.boxShadow)) result.boxShadow = source.boxShadow;
  if (safeLoose(source.fontFamily)) result.fontFamily = source.fontFamily;
  if (source.fontWeight === '400' || source.fontWeight === '500' || source.fontWeight === '600' || source.fontWeight === '700' || source.fontWeight === '800' || source.fontWeight === '900') result.fontWeight = source.fontWeight;
  if (source.textTransform === 'none' || source.textTransform === 'uppercase' || source.textTransform === 'lowercase' || source.textTransform === 'capitalize') result.textTransform = source.textTransform;
  if (source.textDecoration === 'none' || source.textDecoration === 'underline' || source.textDecoration === 'line-through') result.textDecoration = source.textDecoration;
  if (source.textAlign === 'left' || source.textAlign === 'center' || source.textAlign === 'right' || source.textAlign === 'justify') result.textAlign = source.textAlign;
  if (typeof source.opacity === 'string' && SAFE_OPACITY.test(source.opacity)) result.opacity = source.opacity;
  if (['block','inline','inline-block','flex','inline-flex','grid','none'].includes(source.display as string)) result.display = source.display as VisualElementStyle['display'];
  if (['static','relative','absolute','sticky'].includes(source.position as string)) result.position = source.position as VisualElementStyle['position'];
  if (['row','row-reverse','column','column-reverse'].includes(source.flexDirection as string)) result.flexDirection = source.flexDirection as VisualElementStyle['flexDirection'];
  if (['flex-start','center','flex-end','space-between','space-around','space-evenly'].includes(source.justifyContent as string)) result.justifyContent = source.justifyContent as VisualElementStyle['justifyContent'];
  if (['flex-start','center','flex-end','stretch','baseline'].includes(source.alignItems as string)) result.alignItems = source.alignItems as VisualElementStyle['alignItems'];
  if (safeLoose(source.gridTemplateColumns)) result.gridTemplateColumns = source.gridTemplateColumns;
  if (['visible','hidden','auto','scroll'].includes(source.overflow as string)) result.overflow = source.overflow as VisualElementStyle['overflow'];
  if (['default','pointer','text','not-allowed','grab'].includes(source.cursor as string)) result.cursor = source.cursor as VisualElementStyle['cursor'];
  if (['contain','cover','fill','none'].includes(source.objectFit as string)) result.objectFit = source.objectFit as VisualElementStyle['objectFit'];
  if (typeof source.transform === 'string' && SAFE_TRANSFORM.test(source.transform)) result.transform = source.transform;
  if (safeLoose(source.transition)) result.transition = source.transition;
  if (typeof source.filter === 'string' && SAFE_FILTER.test(source.filter)) result.filter = source.filter;
  if (typeof source.backdropFilter === 'string' && /^(none|blur\([^;{}]+\))$/.test(source.backdropFilter)) result.backdropFilter = source.backdropFilter;
  if (safeLoose(source.outline)) result.outline = source.outline;
  return result;
}
export function sanitizeVisualElementOverrides(value: unknown): VisualElementOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: VisualElementOverrides = {};
  for (const [selector, style] of Object.entries(value as Record<string, unknown>)) { if (!selector || selector.length > 900 || /[{};]/.test(selector)) continue; const safe = sanitizeVisualElementStyle(style); if (Object.keys(safe).some((key) => ELEMENT_OVERRIDE_KEYS.includes(key as typeof ELEMENT_OVERRIDE_KEYS[number]))) result[selector] = safe; }
  return result;
}
function sanitizeOverride(value: unknown): VisualInterfaceOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>; const result: VisualInterfaceOverride = {};
  const colors = ['primary_color','secondary_color','accent_color','background_color','surface_color','text_color','muted_text_color','border_color','success_color','warning_color','danger_color'] as const;
  for (const key of colors) if (typeof source[key] === 'string' && isHexColor(source[key])) result[key] = source[key];
  if (typeof source.app_name === 'string' && source.app_name.trim().length <= 60 && source.app_name.trim()) result.app_name = source.app_name.trim();
  for (const key of ['logo_url','favicon_url','login_logo_url'] as const) if (typeof source[key] === 'string' || source[key] === null) result[key] = source[key] as string | null;
  if (ALLOWED_FONTS.includes(source.font_family as AllowedFont)) result.font_family = source.font_family as AllowedFont;
  if (ALLOWED_FONTS.includes(source.heading_font as AllowedFont)) result.heading_font = source.heading_font as AllowedFont;
  if (RADIUS_OPTIONS.includes(source.border_radius as RadiusOption)) result.border_radius = source.border_radius as RadiusOption;
  if (RADIUS_OPTIONS.includes(source.card_radius as RadiusOption)) result.card_radius = source.card_radius as RadiusOption;
  if (RADIUS_OPTIONS.includes(source.button_radius as RadiusOption)) result.button_radius = source.button_radius as RadiusOption;
  if (SHADOW_OPTIONS.includes(source.shadow_style as ShadowStyle)) result.shadow_style = source.shadow_style as ShadowStyle;
  if (BUTTON_STYLES.includes(source.button_style as ButtonStyle)) result.button_style = source.button_style as ButtonStyle;
  if (HEADER_STYLES.includes(source.header_style as HeaderStyle)) result.header_style = source.header_style as HeaderStyle;
  if (NAVIGATION_STYLES.includes(source.navigation_style as NavigationStyle)) result.navigation_style = source.navigation_style as NavigationStyle;
  if (CARD_STYLES.includes(source.card_style as CardStyle)) result.card_style = source.card_style as CardStyle;
  if (INPUT_STYLES.includes(source.input_style as InputStyle)) result.input_style = source.input_style as InputStyle;
  if (DENSITY_OPTIONS.includes(source.density as Density)) result.density = source.density as Density;
  if (THEME_MODES.includes(source.theme_mode as ThemeMode)) result.theme_mode = source.theme_mode as ThemeMode;
  if (source.element_overrides) result.element_overrides = sanitizeVisualElementOverrides(source.element_overrides);
  return result;
}
export function sanitizeVisualSettings(value: Partial<VisualSettingsDraft> | null | undefined): VisualSettingsDraft {
  const source = value ?? {}; const result: VisualSettingsDraft = { ...DEFAULT_VISUAL_SETTINGS };
  const colors = ['primary_color','secondary_color','accent_color','background_color','surface_color','text_color','muted_text_color','border_color','success_color','warning_color','danger_color'] as const;
  for (const key of colors) if (typeof source[key] === 'string' && isHexColor(source[key])) result[key] = source[key];
  if (typeof source.app_name === 'string' && source.app_name.trim().length <= 60 && source.app_name.trim()) result.app_name = source.app_name.trim();
  for (const key of ['logo_url','favicon_url','login_logo_url'] as const) if (typeof source[key] === 'string' || source[key] === null) result[key] = source[key] as string | null;
  if (ALLOWED_FONTS.includes(source.font_family as AllowedFont)) result.font_family = source.font_family as AllowedFont;
  if (ALLOWED_FONTS.includes(source.heading_font as AllowedFont)) result.heading_font = source.heading_font as AllowedFont;
  if (RADIUS_OPTIONS.includes(source.border_radius as RadiusOption)) result.border_radius = source.border_radius as RadiusOption;
  if (RADIUS_OPTIONS.includes(source.card_radius as RadiusOption)) result.card_radius = source.card_radius as RadiusOption;
  if (RADIUS_OPTIONS.includes(source.button_radius as RadiusOption)) result.button_radius = source.button_radius as RadiusOption;
  if (SHADOW_OPTIONS.includes(source.shadow_style as ShadowStyle)) result.shadow_style = source.shadow_style as ShadowStyle;
  if (BUTTON_STYLES.includes(source.button_style as ButtonStyle)) result.button_style = source.button_style as ButtonStyle;
  if (HEADER_STYLES.includes(source.header_style as HeaderStyle)) result.header_style = source.header_style as HeaderStyle;
  if (NAVIGATION_STYLES.includes(source.navigation_style as NavigationStyle)) result.navigation_style = source.navigation_style as NavigationStyle;
  if (CARD_STYLES.includes(source.card_style as CardStyle)) result.card_style = source.card_style as CardStyle;
  if (INPUT_STYLES.includes(source.input_style as InputStyle)) result.input_style = source.input_style as InputStyle;
  if (DENSITY_OPTIONS.includes(source.density as Density)) result.density = source.density as Density;
  if (THEME_MODES.includes(source.theme_mode as ThemeMode)) result.theme_mode = source.theme_mode as ThemeMode;
  result.element_overrides = sanitizeVisualElementOverrides(source.element_overrides);
  if (source.interface_overrides && typeof source.interface_overrides === 'object' && !Array.isArray(source.interface_overrides)) { const safe: VisualInterfaceOverrides = {}; for (const scope of VISUAL_INTERFACE_SCOPES) safe[scope] = sanitizeOverride((source.interface_overrides as Record<string, unknown>)[scope]); result.interface_overrides = safe; }
  return result;
}
export function resolveVisualSettings(settings: VisualSettings | VisualSettingsDraft, scope: VisualInterfaceScope): VisualSettingsDraft { const base = sanitizeVisualSettings(settings); const override = base.interface_overrides?.[scope] ?? {}; return sanitizeVisualSettings({ ...base, ...override, element_overrides: override.element_overrides ?? base.element_overrides, interface_overrides: base.interface_overrides }); }
export function radiusToCss(value: RadiusOption): string { return { sharp:'0px', small:'0.375rem', medium:'0.75rem', large:'1rem', rounded:'999px' }[value]; }
export function shadowToCss(value: ShadowStyle): string { return { none:'none', subtle:'0 2px 10px rgba(15, 23, 42, 0.06)', normal:'0 8px 24px rgba(15, 23, 42, 0.10)', elevated:'0 18px 45px rgba(15, 23, 42, 0.16)' }[value]; }
export function densityToCss(value: Density): { spacing: string; controlHeight: string } { return { compact:{spacing:'0.75rem',controlHeight:'2.5rem'}, normal:{spacing:'1rem',controlHeight:'2.75rem'}, comfortable:{spacing:'1.25rem',controlHeight:'3rem'} }[value]; }
export function getVisualCssVariables(settings: VisualSettingsDraft): Record<string, string> {
  const radius = radiusToCss(settings.border_radius), cardRadius = radiusToCss(settings.card_radius), buttonRadius = radiusToCss(settings.button_radius), density = densityToCss(settings.density), dark = settings.theme_mode === 'dark';
  const secondaryForeground = settings.secondary_color.toLowerCase() === '#e0ecff' ? '#1747B8' : '#FFFFFF';
  return {'--qb-primary':settings.primary_color,'--qb-secondary':settings.secondary_color,'--qb-accent':settings.accent_color,'--qb-background':dark?'#070B14':settings.background_color,'--qb-surface':dark?'#0F172A':settings.surface_color,'--qb-text':dark?'#F8FAFC':settings.text_color,'--qb-text-secondary':dark?'#CBD5E1':settings.muted_text_color,'--qb-text-muted':dark?'#94A3B8':settings.muted_text_color,'--qb-border':dark?'#334155':settings.border_color,'--qb-success':settings.success_color,'--qb-warning':settings.warning_color,'--qb-error':settings.danger_color,'--qb-radius':radius,'--qb-card-radius':cardRadius,'--qb-button-radius':buttonRadius,'--qb-shadow':shadowToCss(settings.shadow_style),'--qb-density-spacing':density.spacing,'--qb-control-height':density.controlHeight,'--qb-font-family':settings.font_family==='system-ui'?'ui-sans-serif, system-ui, sans-serif':`"${settings.font_family}", ui-sans-serif, system-ui, sans-serif`,'--qb-heading-font':settings.heading_font==='system-ui'?'ui-sans-serif, system-ui, sans-serif':`"${settings.heading_font}", ui-sans-serif, system-ui, sans-serif`,'--background':dark?'#070B14':settings.background_color,'--foreground':dark?'#F8FAFC':settings.text_color,'--card':dark?'#0F172A':settings.surface_color,'--card-foreground':dark?'#F8FAFC':settings.text_color,'--popover':dark?'#0F172A':settings.surface_color,'--popover-foreground':dark?'#F8FAFC':settings.text_color,'--primary':settings.primary_color,'--primary-foreground':'#FFFFFF','--secondary':settings.secondary_color,'--secondary-foreground':secondaryForeground,'--accent':settings.accent_color,'--accent-foreground':'#FFFFFF','--destructive':settings.danger_color,'--destructive-foreground':'#FFFFFF','--border':dark?'#334155':settings.border_color,'--input':dark?'#334155':settings.border_color,'--ring':settings.accent_color,'--sidebar':'#1747B8','--sidebar-foreground':'#FFFFFF','--sidebar-primary':'#2563EB','--sidebar-primary-foreground':'#FFFFFF','--sidebar-accent':'rgba(255,255,255,0.12)','--sidebar-accent-foreground':'#FFFFFF','--sidebar-border':'rgba(255,255,255,0.12)','--sidebar-ring':'#E0ECFF'};
}
