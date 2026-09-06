export type VisualViewport = 'base' | 'desktop' | 'tablet' | 'mobile';
export type VisualState = 'default' | 'hover' | 'active' | 'focus' | 'disabled';

export const VISUAL_VIEWPORTS: ReadonlyArray<{ id: VisualViewport; label: string; query?: string }> = [
  { id: 'base', label: 'Global' },
  { id: 'desktop', label: 'Escritorio', query: '(min-width: 1024px)' },
  { id: 'tablet', label: 'Tablet', query: '(min-width: 768px) and (max-width: 1023px)' },
  { id: 'mobile', label: 'Móvil', query: '(max-width: 767px)' },
];

export const VISUAL_STATES: ReadonlyArray<{ id: VisualState; label: string }> = [
  { id: 'default', label: 'Normal' },
  { id: 'hover', label: 'Hover' },
  { id: 'active', label: 'Activo' },
  { id: 'focus', label: 'Focus' },
  { id: 'disabled', label: 'Deshabilitado' },
];

const VIEWPORT_TOKEN = '::qb@viewport:';
const STATE_TOKEN = '::qb@state:';

export function visualVariantKey(selector: string, viewport: VisualViewport, state: VisualState): string {
  let key = selector;
  if (viewport !== 'base') key += `${VIEWPORT_TOKEN}${viewport}`;
  if (state !== 'default') key += `${STATE_TOKEN}${state}`;
  return key;
}

export function parseVisualVariantKey(key: string): { selector: string; viewport: VisualViewport; state: VisualState } {
  let selector = key;
  let viewport: VisualViewport = 'base';
  let state: VisualState = 'default';
  const stateIndex = selector.lastIndexOf(STATE_TOKEN);
  if (stateIndex >= 0) {
    const value = selector.slice(stateIndex + STATE_TOKEN.length) as VisualState;
    if (VISUAL_STATES.some((item) => item.id === value)) state = value;
    selector = selector.slice(0, stateIndex);
  }
  const viewportIndex = selector.lastIndexOf(VIEWPORT_TOKEN);
  if (viewportIndex >= 0) {
    const value = selector.slice(viewportIndex + VIEWPORT_TOKEN.length) as VisualViewport;
    if (VISUAL_VIEWPORTS.some((item) => item.id === value)) viewport = value;
    selector = selector.slice(0, viewportIndex);
  }
  return { selector, viewport, state };
}

export function visualVariantLabel(viewport: VisualViewport, state: VisualState): string {
  const viewportLabel = VISUAL_VIEWPORTS.find((item) => item.id === viewport)?.label ?? 'Global';
  const stateLabel = VISUAL_STATES.find((item) => item.id === state)?.label ?? 'Normal';
  return viewport === 'base' && state === 'default' ? 'Global · Normal' : `${viewportLabel} · ${stateLabel}`;
}
