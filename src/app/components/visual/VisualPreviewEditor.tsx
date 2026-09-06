import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Edit3, RotateCcw, Sparkles, X } from 'lucide-react';
import { useVisualTheme } from '../../contexts/VisualThemeProvider';
import {
  sanitizeVisualElementStyle,
  sanitizeVisualSettings,
  type VisualElementStyle,
  type VisualInterfaceScope,
  type VisualSettingsDraft,
} from '../../../types/visualSettings';

type Props = { scope: VisualInterfaceScope };
type Selected = { element: HTMLElement; selector: string; label: string; tag: string } | null;
type Field = {
  key: keyof VisualElementStyle;
  label: string;
  type: 'color' | 'text' | 'textarea' | 'select';
  options?: string[];
};

const PROTECTED_SELECTOR = '[data-qb-visual-editor], [data-qb-visual-editor-panel]';
const CLICK_DELAY = 220;

const FIELDS: Field[] = [
  { key: 'textContent', label: 'Texto visible', type: 'textarea' },
  { key: 'backgroundColor', label: 'Fondo', type: 'color' },
  { key: 'color', label: 'Color del texto', type: 'color' },
  { key: 'borderColor', label: 'Color del borde', type: 'color' },
  { key: 'borderRadius', label: 'Radio / forma', type: 'text' },
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

const BUTTON_PRESETS: Array<{ id: string; label: string; description: string; style: VisualElementStyle }> = [
  { id: 'solid', label: 'Sólido', description: 'Relleno clásico', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' } },
  { id: 'soft', label: 'Suave', description: 'Relleno ligero', style: { backgroundColor: '#E8F7F0', color: '#11613F', borderColor: '#E8F7F0', boxShadow: 'none' } },
  { id: 'outline', label: 'Outline', description: 'Solo contorno', style: { backgroundColor: '#FFFFFF', color: '#16A36A', borderColor: '#16A36A', boxShadow: 'none' } },
  { id: 'ghost', label: 'Ghost', description: 'Transparente', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', boxShadow: 'none' } },
  { id: 'gradient', label: 'Gradiente', description: 'Efecto degradado', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)' } },
  { id: 'glass', label: 'Liquid Glass', description: 'Cristal translúcido', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)' } },
  { id: 'elevated', label: 'Elevado', description: 'Volumen marcado', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)' } },
  { id: 'flat', label: 'Plano', description: 'Sin sombra', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: 'none' } },
  { id: 'dark', label: 'Dark', description: 'Contraste oscuro', style: { backgroundColor: '#0F172A', color: '#FFFFFF', borderColor: '#0F172A', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' } },
  { id: 'light', label: 'Light', description: 'Minimalista claro', style: { backgroundColor: '#FFFFFF', color: '#334155', borderColor: '#CBD5E1', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)' } },
  { id: 'success', label: 'Éxito', description: 'Acción positiva', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' } },
  { id: 'warning', label: 'Advertencia', description: 'Atención', style: { backgroundColor: '#D97706', color: '#FFFFFF', borderColor: '#D97706', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' } },
  { id: 'danger', label: 'Peligro', description: 'Acción destructiva', style: { backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' } },
  { id: 'link', label: 'Link', description: 'Apariencia de enlace', style: { backgroundColor: '#FFFFFF', color: '#2563EB', borderColor: '#FFFFFF', boxShadow: 'none', padding: '0px' } },
  { id: 'compact', label: 'Compacto', description: 'Control pequeño', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: 'none', padding: '0.5rem 0.75rem' } },
  { id: 'large', label: 'Grande', description: 'CTA destacado', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)', padding: '1rem 1.5rem' } },
];

const SHAPES: Array<{ id: string; label: string; value: string }> = [
  { id: 'square', label: 'Cuadrado', value: '0px' },
  { id: 'soft', label: 'Suave', value: '0.375rem' },
  { id: 'rounded', label: 'Redondeado', value: '0.75rem' },
  { id: 'large', label: 'Curvo', value: '1rem' },
  { id: 'pill', label: 'Píldora', value: '999px' },
  { id: 'capsule', label: 'Cápsula', value: '2rem' },
  { id: 'oval', label: 'Ovalado', value: '50%' },
  { id: 'squircle', label: 'Squircle', value: '22%' },
  { id: 'arch', label: 'Arco', value: '2rem 2rem 0.5rem 0.5rem' },
  { id: 'reverse-arch', label: 'Arco invertido', value: '0.5rem 0.5rem 2rem 2rem' },
  { id: 'top-round', label: 'Curva superior', value: '1.5rem 1.5rem 0.25rem 0.25rem' },
  { id: 'bottom-round', label: 'Curva inferior', value: '0.25rem 0.25rem 1.5rem 1.5rem' },
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

function selectorMatchesOnlyElement(selector: string, element: HTMLElement) {
  try {
    const matches = document.querySelectorAll<HTMLElement>(selector);
    return matches.length === 1 && matches[0] === element;
  } catch { return false; }
}

function getNthOfType(element: HTMLElement) {
  if (!element.parentElement) return '';
  const siblings = Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName);
  return siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : '';
}

function buildFallbackSelector(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.documentElement && current !== document.body) {
    parts.unshift(`${current.tagName.toLowerCase()}${getNthOfType(current)}`);
    const candidate = parts.join(' > ');
    if (selectorMatchesOnlyElement(candidate, element)) return candidate;
    current = current.parentElement;
  }
  return parts.join(' > ');
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
    else part += getNthOfType(current);
    parts.unshift(part);
    const candidate = parts.join(' > ');
    if (selectorMatchesOnlyElement(candidate, element)) return candidate;
    current = current.parentElement;
  }
  const fallback = buildFallbackSelector(element);
  return selectorMatchesOnlyElement(fallback, element) ? fallback : '';
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
    main: 'Contenedor', aside: 'Barra lateral', article: 'Tarjeta', div: 'Contenedor', span: 'Texto',
    p: 'Texto', h1: 'Título', h2: 'Título', h3: 'Título', h4: 'Título', h5: 'Título', h6: 'Título',
    li: 'Elemento de lista', ul: 'Lista', ol: 'Lista', table: 'Tabla', tr: 'Fila', td: 'Celda', th: 'Celda',
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

function getInitialOverrides(settings: ReturnType<typeof useVisualTheme>['settings'], scope: VisualInterfaceScope) {
  const scoped = settings.interface_overrides?.[scope]?.element_overrides;
  return cloneOverrides(scoped ?? settings.element_overrides);
}

function ButtonPresetGrid({ onApply }: { onApply: (style: VisualElementStyle) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {BUTTON_PRESETS.map((preset) => (
        <button key={preset.id} type="button" onClick={() => onApply(preset.style)} className="group rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-slate-400 hover:shadow-sm">
          <span className="flex h-9 items-center justify-center rounded-lg border text-[10px] font-black transition group-hover:scale-[1.01]" style={{ backgroundColor: preset.style.backgroundColor, color: preset.style.color, borderColor: preset.style.borderColor, borderRadius: preset.style.borderRadius }}>
            {preset.label}
          </span>
          <span className="mt-1 block text-[9px] text-slate-400">{preset.description}</span>
        </button>
      ))}
    </div>
  );
}

export function VisualPreviewEditor({ scope }: Props) {
  const { settings } = useVisualTheme();
  const [selected, setSelected] = useState<Selected>(null);
  const [draftStyle, setDraftStyle] = useState<VisualElementStyle>({});
  const [inspectedStyle, setInspectedStyle] = useState<VisualElementStyle>({});
  const [sessionOverrides, setSessionOverrides] = useState(() => getInitialOverrides(settings, scope));
  const sessionOverridesRef = useRef(sessionOverrides);
  const [message, setMessage] = useState('1 clic ejecuta · 3 clics editan · Modo diseño selecciona directamente');
  const [designMode, setDesignMode] = useState(false);
  const clickState = useRef<{ element: HTMLElement | null; count: number; timer: number | null }>({ element: null, count: 0, timer: null });
  const replayingClick = useRef(false);
  const [openSection, setOpenSection] = useState<'button' | 'shape' | 'style' | 'advanced' | null>('style');

  const selectedStyle = useMemo(() => {
    if (!selected) return {};
    return { ...inspectedStyle, ...(sessionOverrides[selected.selector] ?? {}), ...draftStyle };
  }, [draftStyle, inspectedStyle, selected, sessionOverrides]);

  const isButton = Boolean(selected && /^(button|a)$/i.test(selected.tag) || selected?.element.getAttribute('role') === 'button');

  const syncSessionOverrides = (next: VisualSettingsDraft['element_overrides']) => {
    const cloned = cloneOverrides(next);
    sessionOverridesRef.current = cloned;
    setSessionOverrides(cloned);
  };

  useEffect(() => { sessionOverridesRef.current = sessionOverrides; }, [sessionOverrides]);

  const selectElement = (element: HTMLElement) => {
    const selector = buildSelector(element);
    if (!selector || !selectorMatchesOnlyElement(selector, element)) {
      setSelected(null);
      setMessage('No se pudo crear un selector único para este elemento.');
      return;
    }
    setSelected({ element, selector, label: describeElement(element), tag: element.tagName.toLowerCase() });
    setInspectedStyle(readComputedStyle(element));
    setDraftStyle({ ...(sessionOverridesRef.current[selector] ?? {}) });
    setOpenSection(/^(button|a)$/i.test(element.tagName) || element.getAttribute('role') === 'button' ? 'button' : 'style');
  };

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview') return;
      if (!event.data?.settings || typeof event.data.settings !== 'object') return;
      const next = sanitizeVisualSettings(event.data.settings as Partial<VisualSettingsDraft>);
      const incoming = next.element_overrides ?? {};
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
      if (target.closest(PROTECTED_SELECTOR)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const editable = target.closest('*') as HTMLElement | null;
      if (!editable || editable === document.body || editable === document.documentElement) return;
      if (/^(script|style|link|meta|noscript)$/i.test(editable.tagName)) return;

      const state = clickState.current;
      state.count = state.element === editable ? state.count + 1 : 1;
      state.element = editable;
      if (state.timer) window.clearTimeout(state.timer);

      if (designMode) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Modo diseño: elemento seleccionado. Todos sus controles están disponibles.');
        state.element = null; state.count = 0; state.timer = null;
        return;
      }

      event.preventDefault(); event.stopPropagation();
      if (state.count >= 3) {
        state.count = 0; state.timer = null; event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Elemento seleccionado: puedes modificarlo por completo.');
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
  }, [designMode]);

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
      interface_overrides: { ...(settings.interface_overrides ?? {}), [scope]: { ...currentScope, element_overrides: nextOverrides } },
    });
  };

  const notifyHost = (type: 'quickbite-visual-element-edit' | 'quickbite-visual-element-reset', fullSettings: VisualSettingsDraft, selector: string, styles?: VisualElementStyle) => {
    const payload = { type, scope, selector, ...(styles ? { styles } : {}), settings: fullSettings };
    try {
      if (window.parent !== window) window.parent.postMessage(payload, window.location.origin);
      else window.opener?.postMessage(payload, window.location.origin);
    } catch { /* Preview host is optional. */ }
  };

  const commit = (patch: VisualElementStyle) => {
    if (!selected) return;
    const currentOverride = sessionOverridesRef.current[selected.selector] ?? {};
    const next = sanitizeVisualElementStyle({ ...currentOverride, ...draftStyle, ...patch });
    const nextOverrides = { ...sessionOverridesRef.current, [selected.selector]: next };
    syncSessionOverrides(nextOverrides);
    setDraftStyle(next);
    notifyHost('quickbite-visual-element-edit', buildDraftSettings(nextOverrides), selected.selector, next);
    setMessage('Cambio aplicado al borrador. Puedes seguir editando sin salir de la preview.');
  };

  const reset = () => {
    if (!selected) return;
    const nextOverrides = { ...sessionOverridesRef.current };
    delete nextOverrides[selected.selector];
    syncSessionOverrides(nextOverrides);
    setDraftStyle({});
    setInspectedStyle(readComputedStyle(selected.element));
    notifyHost('quickbite-visual-element-reset', buildDraftSettings(nextOverrides), selected.selector);
    setMessage('Elemento restaurado al estilo original.');
  };

  const closeEditor = () => {
    setSelected(null);
    setMessage(designMode ? 'Modo diseño: selecciona cualquier elemento.' : '1 clic ejecuta · 3 clics editan · Modo diseño selecciona directamente');
  };

  const Section = ({ id, title, children }: { id: NonNullable<typeof openSection>; title: string; children: React.ReactNode }) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <button type="button" onClick={() => setOpenSection(openSection === id ? null : id)} className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-700">{title}</span>
        <ChevronDown className={`size-4 text-slate-400 transition ${openSection === id ? 'rotate-180' : ''}`} />
      </button>
      {openSection === id && <div className="p-4">{children}</div>}
    </div>
  );

  return (
    <>
      <div data-qb-visual-editor className="fixed left-4 top-4 z-[9998] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Edit3 className="size-4" /></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-300">Editor visual universal</p><p className="truncate text-xs font-bold">{message}</p></div>
        <button type="button" onClick={() => setDesignMode((value) => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${designMode ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/15'}`}>{designMode ? 'Modo diseño' : 'Interactivo'}</button>
      </div>

      {selected && (
        <aside data-qb-visual-editor-panel className="fixed bottom-4 right-4 z-[9999] w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-emerald-600" /><p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">Editar todo</p></div>
              <p className="mt-1 truncate text-sm font-black text-slate-900">{selected.label}</p>
              <p className="mt-1 truncate text-[10px] text-slate-400">{selected.selector}</p>
              <p className="mt-2 text-[10px] font-semibold text-slate-500">Los cambios son visuales y se acumulan en el borrador hasta Guardar.</p>
            </div>
            <button type="button" onClick={closeEditor} className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Cerrar"><X className="size-4" /></button>
          </div>

          <div className="max-h-[72vh] space-y-3 overflow-y-auto p-4">
            {isButton && (
              <Section id="button" title="Tipo de botón">
                <p className="mb-3 text-[10px] leading-4 text-slate-500">Elige entre múltiples estilos. El preset aplica una base que luego puedes modificar campo por campo.</p>
                <ButtonPresetGrid onApply={commit} />
              </Section>
            )}

            {isButton && (
              <Section id="shape" title="Shape / forma del botón">
                <div className="grid grid-cols-3 gap-2">
                  {SHAPES.map((shape) => (
                    <button key={shape.id} type="button" onClick={() => commit({ borderRadius: shape.value })} className="rounded-xl border border-slate-200 bg-white p-2 text-center hover:border-slate-400">
                      <span className="mx-auto block h-8 w-16 border border-slate-300 bg-slate-100" style={{ borderRadius: shape.value }} />
                      <span className="mt-1 block text-[9px] font-black text-slate-600">{shape.label}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section id="style" title="Estilo completo">
              <div className="space-y-3">
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
                      {field.type === 'select' && <select value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                      {field.type === 'textarea' && <textarea value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Texto visible" maxLength={500} />}
                      {field.type === 'text' && <input value={stringValue} onChange={(event) => commit({ [field.key]: event.target.value } as VisualElementStyle)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Auto" />}
                    </label>
                  );
                })}
              </div>
            </Section>

            <Section id="advanced" title="Acciones">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700"><RotateCcw className="size-4" /> Restablecer</button>
                <button type="button" onClick={closeEditor} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white"><Check className="size-4" /> Listo</button>
              </div>
              <p className="mt-3 text-[9px] leading-4 text-slate-400">El editor nunca modifica HTML, JavaScript, permisos, pagos, pedidos ni datos. Solo guarda overrides visuales del elemento seleccionado.</p>
            </Section>
          </div>
        </aside>
      )}
    </>
  );
}
