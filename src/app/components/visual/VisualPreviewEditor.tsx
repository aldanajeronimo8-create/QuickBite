import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Edit3, RotateCcw, X } from 'lucide-react';
import { useVisualTheme } from '../../contexts/VisualThemeProvider';
import {
  sanitizeVisualElementStyle,
  sanitizeVisualSettings,
  type VisualElementStyle,
  type VisualInterfaceScope,
  type VisualSettingsDraft,
} from '../../../types/visualSettings';

type Props = { scope: VisualInterfaceScope };
type Selected = { element: HTMLElement; selector: string; label: string } | null;
type Field = {
  key: keyof VisualElementStyle;
  label: string;
  type: 'color' | 'text' | 'textarea' | 'select';
  options?: string[];
};

const PROTECTED_SELECTOR = '.admin-sidebar, [data-qb-visual-editor]';
const CLICK_DELAY = 220;

const FIELDS: Field[] = [
  { key: 'textContent', label: 'Texto visible', type: 'textarea' },
  { key: 'backgroundColor', label: 'Fondo', type: 'color' },
  { key: 'color', label: 'Color del texto', type: 'color' },
  { key: 'borderColor', label: 'Borde', type: 'color' },
  { key: 'borderRadius', label: 'Radio', type: 'text' },
  { key: 'boxShadow', label: 'Sombra', type: 'text' },
  { key: 'fontSize', label: 'Tamaño de texto', type: 'text' },
  { key: 'fontWeight', label: 'Peso', type: 'select', options: ['400', '500', '600', '700', '800', '900'] },
  { key: 'padding', label: 'Padding', type: 'text' },
  { key: 'margin', label: 'Margin', type: 'text' },
  { key: 'width', label: 'Ancho', type: 'text' },
  { key: 'height', label: 'Alto', type: 'text' },
  { key: 'opacity', label: 'Opacidad', type: 'text' },
  { key: 'textAlign', label: 'Alineación', type: 'select', options: ['left', 'center', 'right'] },
];

function cssEscape(value: string): string {
  try { return CSS.escape(value); }
  catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

function isDynamicId(value: string) {
  return /^([0-9a-f]{8}-[0-9a-f-]{27,}|radix-|headlessui-|:r)/i.test(value) || /^\d+$/.test(value);
}

function attrSelector(name: string, value: string) {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name}="${escaped}"]`;
}

function buildSelector(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.documentElement && current !== document.body) {
    let part = current.tagName.toLowerCase();
    const testId = current.getAttribute('data-testid');
    const slot = current.getAttribute('data-slot');
    const name = current.getAttribute('name');
    const aria = current.getAttribute('aria-label');
    const id = current.id;
    if (testId) part += attrSelector('data-testid', testId);
    else if (slot) part += attrSelector('data-slot', slot);
    else if (id && !isDynamicId(id)) part += `#${cssEscape(id)}`;
    else if (name) part += attrSelector('name', name);
    else if (aria) part += attrSelector('aria-label', aria);
    else if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children).filter((child) => child.tagName === current?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    if (testId || slot || (id && !isDynamicId(id)) || name || aria) break;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function readVisibleText(element: HTMLElement): string {
  const direct = Array.from(element.childNodes).filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  if (direct.length) return direct.map((node) => node.textContent?.trim() ?? '').join(' ');
  if (element.childElementCount === 0) return element.textContent?.trim() ?? '';
  return '';
}

function describeElement(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const label = element.getAttribute('aria-label') || element.getAttribute('title') || readVisibleText(element).replace(/\s+/g, ' ').trim().slice(0, 70);
  const names: Record<string, string> = {
    button: 'Botón', a: 'Enlace', input: 'Campo', select: 'Selector', textarea: 'Texto', img: 'Imagen',
    nav: 'Navegación', header: 'Cabecera', section: 'Sección', form: 'Formulario', label: 'Etiqueta',
    p: 'Texto', h1: 'Título', h2: 'Título', h3: 'Título',
  };
  return `${names[tag] ?? 'Elemento'}${label ? ` — “${label}”` : ''}`;
}

function readComputedStyle(element: HTMLElement): VisualElementStyle {
  const style = window.getComputedStyle(element);
  return sanitizeVisualElementStyle({
    textContent: readVisibleText(element),
    backgroundColor: toHex(style.backgroundColor),
    color: toHex(style.color),
    borderColor: toHex(style.borderTopColor),
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    padding: style.padding,
    margin: style.margin,
    width: style.width,
    height: style.height,
    opacity: style.opacity,
    textAlign: style.textAlign,
  });
}

function toHex(value: string): string | undefined {
  const match = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
  return `#${[1, 2, 3].map((index) => Number(match[index]).toString(16).padStart(2, '0')).join('')}`;
}

function cloneOverrides(source: VisualSettingsDraft['element_overrides']) {
  return Object.fromEntries(Object.entries(source ?? {}).map(([selector, style]) => [selector, { ...style }]));
}

export function VisualPreviewEditor({ scope }: Props) {
  const { settings } = useVisualTheme();
  const [selected, setSelected] = useState<Selected>(null);
  const [draftStyle, setDraftStyle] = useState<VisualElementStyle>({});
  const [inspectedStyle, setInspectedStyle] = useState<VisualElementStyle>({});
  const [sessionOverrides, setSessionOverrides] = useState(() => cloneOverrides(settings.element_overrides));
  const sessionOverridesRef = useRef(sessionOverrides);
  const [message, setMessage] = useState('1 clic ejecuta la acción · 3 clics editan el elemento');
  const [designMode, setDesignMode] = useState(false);
  const clickState = useRef<{ element: HTMLElement | null; count: number; timer: number | null }>({ element: null, count: 0, timer: null });
  const replayingClick = useRef(false);

  const selectedStyle = useMemo(() => {
    if (!selected) return {};
    return { ...inspectedStyle, ...(sessionOverrides[selected.selector] ?? {}), ...draftStyle };
  }, [draftStyle, inspectedStyle, selected, sessionOverrides]);

  const syncSessionOverrides = (next: VisualSettingsDraft['element_overrides']) => {
    const cloned = cloneOverrides(next);
    sessionOverridesRef.current = cloned;
    setSessionOverrides(cloned);
  };

  useEffect(() => { sessionOverridesRef.current = sessionOverrides; }, [sessionOverrides]);

  const selectElement = (element: HTMLElement) => {
    const selector = buildSelector(element);
    setSelected({ element, selector, label: describeElement(element) });
    setInspectedStyle(readComputedStyle(element));
    setDraftStyle({ ...(sessionOverridesRef.current[selector] ?? {}) });
  };

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview') return;
      if (!event.data?.settings || typeof event.data.settings !== 'object') return;
      const next = sanitizeVisualSettings(event.data.settings as Partial<VisualSettingsDraft>);
      const incoming = next.element_overrides ?? {};
      if (JSON.stringify(incoming) === JSON.stringify(sessionOverridesRef.current)) return;
      syncSessionOverrides(incoming);
      if (selected) setDraftStyle({ ...(incoming[selected.selector] ?? {}) });
    };
    window.addEventListener('message', onPreviewMessage);
    return () => window.removeEventListener('message', onPreviewMessage);
  }, [selected]);

  useEffect(() => {
    const handleSelection = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || replayingClick.current) return;
      if (target.closest(PROTECTED_SELECTOR) || target.closest('[data-qb-visual-editor-panel]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const interactive = target.closest('button, a, input, select, textarea, [role="button"]') as HTMLElement | null;
      const editable = interactive ?? (target.closest('label, div, section, header, nav, main, aside, footer, form, article, img, p, h1, h2, h3, h4, h5, h6, span, li, ul, ol, table, tr, td, th') as HTMLElement | null);
      if (!editable || editable === document.body || editable === document.documentElement) return;

      const state = clickState.current;
      state.count = state.element === editable ? state.count + 1 : 1;
      state.element = editable;
      if (state.timer) window.clearTimeout(state.timer);

      if (designMode) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Modo diseño: elemento inspeccionado sin modificarlo.');
        state.element = null; state.count = 0; state.timer = null;
        return;
      }

      event.preventDefault(); event.stopPropagation();
      if (state.count >= 3) {
        state.count = 0; state.timer = null; event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Elemento inspeccionado: sus valores actuales están cargados.');
        return;
      }

      state.timer = window.setTimeout(() => {
        const current = clickState.current;
        if (current.element !== editable || current.count < 1) return;
        replayingClick.current = true;
        try { editable.click(); }
        finally { window.setTimeout(() => { replayingClick.current = false; }, 0); }
        current.element = null; current.count = 0; current.timer = null;
      }, CLICK_DELAY);
    };
    document.addEventListener('click', handleSelection, true);
    return () => {
      document.removeEventListener('click', handleSelection, true);
      if (clickState.current.timer) window.clearTimeout(clickState.current.timer);
    };
  }, [designMode, selected]);

  useEffect(() => {
    if (!selected) return;
    const element = selected.element;
    const previous = new Map<string, string>();
    Object.entries(draftStyle).forEach(([key, value]) => {
      if (!value || key === 'textContent') return;
      const property = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      previous.set(property, element.style.getPropertyValue(property));
      element.style.setProperty(property, value, 'important');
    });
    return () => previous.forEach((value, property) => value ? element.style.setProperty(property, value) : element.style.removeProperty(property));
  }, [draftStyle, selected]);

  const buildDraftSettings = (nextOverrides: Record<string, VisualElementStyle>) => {
    const currentScope = settings.interface_overrides?.[scope] ?? {};
    return sanitizeVisualSettings({
      ...settings,
      element_overrides: nextOverrides,
      interface_overrides: {
        ...(settings.interface_overrides ?? {}),
        [scope]: { ...currentScope, element_overrides: nextOverrides },
      },
    });
  };

  const notifyHost = (
    type: 'quickbite-visual-element-edit' | 'quickbite-visual-element-reset',
    fullSettings: VisualSettingsDraft,
    selector: string,
    styles?: VisualElementStyle,
  ) => {
    const payload = { type, scope, selector, ...(styles ? { styles } : {}), settings: fullSettings };
    try {
      if (window.parent !== window) window.parent.postMessage(payload, window.location.origin);
      else window.opener?.postMessage(payload, window.location.origin);
    } catch {
      // Preview host is optional.
    }
  };

  const commit = (patch: VisualElementStyle) => {
    if (!selected) return;
    const currentOverride = sessionOverridesRef.current[selected.selector] ?? {};
    const next = sanitizeVisualElementStyle({ ...currentOverride, ...draftStyle, ...patch });
    const nextOverrides = { ...sessionOverridesRef.current, [selected.selector]: next };
    syncSessionOverrides(nextOverrides);
    setDraftStyle(next);
    notifyHost('quickbite-visual-element-edit', buildDraftSettings(nextOverrides), selected.selector, next);
    setMessage('Cambio aplicado al borrador. Puedes seguir editando otros elementos; Guardar cambios lo persiste todo.');
  };

  const reset = () => {
    if (!selected) return;
    const nextOverrides = { ...sessionOverridesRef.current };
    delete nextOverrides[selected.selector];
    syncSessionOverrides(nextOverrides);
    setDraftStyle({});
    setInspectedStyle(readComputedStyle(selected.element));
    notifyHost('quickbite-visual-element-reset', buildDraftSettings(nextOverrides), selected.selector);
    setMessage('Elemento restaurado en el borrador. Puedes seguir editando y guardar todo al final.');
  };

  const closeEditor = () => {
    setSelected(null);
    setMessage(designMode ? 'Modo diseño: selecciona un elemento.' : '1 clic ejecuta la acción · 3 clics editan el elemento');
  };

  return (
    <>
      <div
        data-qb-visual-editor
        className="fixed left-4 top-4 z-[9998] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur"
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Edit3 className="size-4" /></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-300">Editor visual</p><p className="truncate text-xs font-bold">{message}</p></div>
        <button type="button" onClick={() => setDesignMode((value) => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${designMode ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/15'}`}>
          {designMode ? 'Modo diseño' : 'Interactivo'}
        </button>
      </div>

      {selected && (
        <aside data-qb-visual-editor-panel className="fixed bottom-4 right-4 z-[9999] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">Editar elemento</p>
              <p className="mt-1 truncate text-sm font-black text-slate-900">{selected.label}</p>
              <p className="mt-1 truncate text-[10px] text-slate-400">{selected.selector}</p>
              <p className="mt-2 text-[10px] font-semibold text-slate-500">Seleccionar solo inspecciona. Los cambios se acumulan en el borrador de la sesión.</p>
            </div>
            <button type="button" onClick={closeEditor} className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
            {FIELDS.map((field) => {
              const value = selectedStyle[field.key] ?? '';
              const stringValue = String(value);
              return (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-black text-slate-600">{field.label}</span>
                  {field.type === 'color' && (
                    <div className="flex gap-2">
                      <input type="color" value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="size-10 cursor-pointer rounded-lg border border-slate-200 p-1" />
                      <input value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                  )}
                  {field.type === 'select' && (
                    <select value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  )}
                  {field.type === 'textarea' && (
                    <textarea value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Texto visible" maxLength={500} />
                  )}
                  {field.type === 'text' && (
                    <input value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Auto" />
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
              <RotateCcw className="size-4" /> Restablecer
            </button>
            <button type="button" onClick={closeEditor} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
              <Check className="size-4" /> Listo
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
