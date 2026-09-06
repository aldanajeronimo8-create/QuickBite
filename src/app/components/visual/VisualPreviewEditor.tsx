import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Edit3, RotateCcw, X } from 'lucide-react';
import { useVisualTheme } from '../../contexts/VisualThemeProvider';
import { sanitizeVisualElementStyle, type VisualElementStyle, type VisualInterfaceScope } from '../../../types/visualSettings';

const PREVIEW_STORAGE_KEY = 'quickbite_visual_preview_settings';
const ROOT_SELECTOR = 'html[data-qb-visual-preview="1"]';
const PROTECTED_SELECTOR = '.admin-sidebar, [data-qb-visual-editor]';
const CLICK_DELAY = 220;

type Props = { scope: VisualInterfaceScope };
type Selected = { element: HTMLElement; selector: string } | null;

const FIELDS: Array<{ key: keyof VisualElementStyle; label: string; type: 'color' | 'text' | 'select'; options?: string[] }> = [
  { key: 'backgroundColor', label: 'Fondo', type: 'color' },
  { key: 'color', label: 'Texto', type: 'color' },
  { key: 'borderColor', label: 'Borde', type: 'color' },
  { key: 'borderRadius', label: 'Radio', type: 'text' },
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
  try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

function isDynamicId(value: string) {
  return /^([0-9a-f]{8}-[0-9a-f-]{27,}|radix-|headlessui-|:r)/i.test(value) || /^\d+$/.test(value);
}

function attrSelector(name: string, value: string) {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
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

function readComputedStyle(element: HTMLElement): VisualElementStyle {
  const style = window.getComputedStyle(element);
  return sanitizeVisualElementStyle({
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

export function VisualPreviewEditor({ scope }: Props) {
  const { settings } = useVisualTheme();
  const [selected, setSelected] = useState<Selected>(null);
  const [draftStyle, setDraftStyle] = useState<VisualElementStyle>({});
  const [message, setMessage] = useState('Triple clic para editar cualquier elemento');
  const clickState = useRef<{ element: HTMLElement | null; count: number; timer: number | null }>({ element: null, count: 0, timer: null });
  const replayingClick = useRef(false);

  const existingOverrides = settings.element_overrides ?? {};
  const selectedStyle = useMemo(() => selected ? { ...existingOverrides[selected.selector], ...draftStyle } : {}, [existingOverrides, selected, draftStyle]);

  useEffect(() => {
    const handleSelection = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || replayingClick.current) return;
      if (target.closest(PROTECTED_SELECTOR) || target.closest('[data-qb-visual-editor-panel]')) return;
      const editable = target.closest('button, a, input, select, textarea, label, [role], [tabindex], div, section, header, nav, main, aside, footer, form, article, img, p, h1, h2, h3, h4, h5, h6, span') as HTMLElement | null;
      if (!editable || editable === document.body || editable === document.documentElement) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const state = clickState.current;
      const same = state.element === editable;
      state.count = same ? state.count + 1 : 1;
      state.element = editable;
      if (state.timer) window.clearTimeout(state.timer);

      if (state.count >= 3) {
        state.count = 0;
        state.timer = null;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const selector = buildSelector(editable);
        setSelected({ element: editable, selector });
        setDraftStyle(existingOverrides[selector] ?? readComputedStyle(editable));
        setMessage('Elemento seleccionado: ajusta los valores del panel.');
        return;
      }

      state.timer = window.setTimeout(() => {
        const current = clickState.current;
        if (current.element !== editable || current.count < 1) return;
        replayingClick.current = true;
        try { editable.click(); } finally { window.setTimeout(() => { replayingClick.current = false; }, 0); }
        current.element = null;
        current.count = 0;
        current.timer = null;
      }, CLICK_DELAY);
      if (state.count > 1) event.preventDefault();
    };

    document.addEventListener('click', handleSelection, true);
    return () => {
      document.removeEventListener('click', handleSelection, true);
      if (clickState.current.timer) window.clearTimeout(clickState.current.timer);
    };
  }, [existingOverrides]);

  useEffect(() => {
    if (!selected) return;
    const el = selected.element;
    const previous = new Map<string, string>();
    Object.entries(selectedStyle).forEach(([key, value]) => {
      if (!value) return;
      const property = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      previous.set(property, el.style.getPropertyValue(property));
      el.style.setProperty(property, value, 'important');
    });
    return () => previous.forEach((value, property) => value ? el.style.setProperty(property, value) : el.style.removeProperty(property));
  }, [selected, selectedStyle]);

  const commit = (patch: VisualElementStyle) => {
    if (!selected) return;
    const next = sanitizeVisualElementStyle({ ...selectedStyle, ...patch });
    setDraftStyle(next);
    const full = { ...(settings.element_overrides ?? {}), [selected.selector]: next };
    const payload = { type: 'quickbite-visual-element-edit', scope, selector: selected.selector, styles: next, settings: { ...settings, element_overrides: full } };
    window.postMessage(payload, window.location.origin);
    window.opener?.postMessage(payload, window.location.origin);
    try { localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ ...settings, element_overrides: full })); } catch { /* ignore storage failures */ }
    setMessage('Cambio aplicado a la previsualización. Se guardará al pulsar Guardar.');
  };

  const reset = () => {
    if (!selected) return;
    const next = { ...(settings.element_overrides ?? {}) };
    delete next[selected.selector];
    setDraftStyle({});
    const payload = { type: 'quickbite-visual-element-reset', scope, selector: selected.selector, settings: { ...settings, element_overrides: next } };
    window.postMessage(payload, window.location.origin);
    window.opener?.postMessage(payload, window.location.origin);
    try { localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ ...settings, element_overrides: next })); } catch { /* ignore */ }
    setMessage('Se restauró el estilo original del elemento.');
  };

  return (
    <>
      <div data-qb-visual-editor className="fixed left-4 top-4 z-[9998] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Edit3 className="size-4" /></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-300">Editor visual</p><p className="truncate text-xs font-bold">{message}</p></div>
      </div>
      {selected && (
        <aside data-qb-visual-editor-panel className="fixed bottom-4 right-4 z-[9999] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Editar elemento</p><p className="mt-1 truncate text-sm font-black text-slate-900">{selected.selector}</p></div>
            <button type="button" onClick={() => setSelected(null)} className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Cerrar"><X className="size-4" /></button>
          </div>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
            {FIELDS.map((field) => {
              const value = selectedStyle[field.key] ?? '';
              return <label key={field.key} className="block"><span className="mb-1 block text-xs font-black text-slate-600">{field.label}</span>{field.type === 'color' ? <div className="flex gap-2"><input type="color" value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="size-10 rounded-lg border border-slate-200 p-1" /><input value={String(value)} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div> : field.type === 'select' ? <select value={String(value)} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input value={String(value)} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Auto" />}</label>;
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><RotateCcw className="size-4" /> Restablecer</button><button type="button" onClick={() => { setSelected(null); setMessage('Triple clic para editar cualquier elemento'); }} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Check className="size-4" /> Listo</button></div>
        </aside>
      )}
    </>
  );
}
