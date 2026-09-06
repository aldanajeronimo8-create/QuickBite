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
type Selected = {
  element: HTMLElement;
  selector: string;
  label: string;
  tag: string;
} | null;
type FieldType = 'color' | 'text' | 'textarea' | 'select';
type Field = {
  key: keyof VisualElementStyle;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
};
type SectionId = 'button' | 'shape' | 'text' | 'colors' | 'spacing' | 'layout' | 'media' | 'effects';

const PROTECTED_SELECTOR = '[data-qb-visual-editor], [data-qb-visual-editor-panel]';
const CLICK_DELAY = 220;

const TEXT_FIELDS: Field[] = [
  { key: 'textContent', label: 'Texto visible', type: 'textarea' },
  { key: 'fontFamily', label: 'Fuente', type: 'text', hint: 'Ej. Nunito, Inter, system-ui' },
  { key: 'fontSize', label: 'Tamaño de fuente', type: 'text', hint: 'Ej. 16px, 1rem' },
  { key: 'fontWeight', label: 'Peso', type: 'select', options: ['400', '500', '600', '700', '800', '900'] },
  { key: 'lineHeight', label: 'Altura de línea', type: 'text', hint: 'Ej. 1.5' },
  { key: 'letterSpacing', label: 'Espaciado de letras', type: 'text', hint: 'Ej. 0.02em' },
  { key: 'textTransform', label: 'Mayúsculas / minúsculas', type: 'select', options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  { key: 'textDecoration', label: 'Decoración', type: 'select', options: ['none', 'underline', 'line-through'] },
  { key: 'textAlign', label: 'Alineación del texto', type: 'select', options: ['left', 'center', 'right', 'justify'] },
];

const COLOR_FIELDS: Field[] = [
  { key: 'backgroundColor', label: 'Fondo', type: 'color' },
  { key: 'backgroundImage', label: 'Fondo / gradiente', type: 'text', hint: 'Ej. linear-gradient(...)' },
  { key: 'color', label: 'Texto / contenido', type: 'color' },
  { key: 'borderColor', label: 'Borde', type: 'color' },
  { key: 'borderStyle', label: 'Tipo de borde', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { key: 'borderWidth', label: 'Grosor de borde', type: 'text', hint: 'Ej. 1px' },
];

const SPACING_FIELDS: Field[] = [
  { key: 'padding', label: 'Padding general', type: 'text', hint: 'Ej. 12px 16px' },
  { key: 'paddingTop', label: 'Padding superior', type: 'text' },
  { key: 'paddingRight', label: 'Padding derecho', type: 'text' },
  { key: 'paddingBottom', label: 'Padding inferior', type: 'text' },
  { key: 'paddingLeft', label: 'Padding izquierdo', type: 'text' },
  { key: 'margin', label: 'Margin general', type: 'text', hint: 'Ej. 8px 0' },
  { key: 'marginTop', label: 'Margin superior', type: 'text' },
  { key: 'marginRight', label: 'Margin derecho', type: 'text' },
  { key: 'marginBottom', label: 'Margin inferior', type: 'text' },
  { key: 'marginLeft', label: 'Margin izquierdo', type: 'text' },
];

const LAYOUT_FIELDS: Field[] = [
  { key: 'width', label: 'Ancho', type: 'text', hint: 'px, %, rem, auto...' },
  { key: 'minWidth', label: 'Ancho mínimo', type: 'text' },
  { key: 'maxWidth', label: 'Ancho máximo', type: 'text' },
  { key: 'height', label: 'Alto', type: 'text' },
  { key: 'minHeight', label: 'Alto mínimo', type: 'text' },
  { key: 'maxHeight', label: 'Alto máximo', type: 'text' },
  { key: 'display', label: 'Tipo de disposición', type: 'select', options: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'] },
  { key: 'position', label: 'Posicionamiento', type: 'select', options: ['static', 'relative', 'absolute', 'sticky'] },
  { key: 'top', label: 'Desplazamiento superior', type: 'text' },
  { key: 'right', label: 'Desplazamiento derecho', type: 'text' },
  { key: 'bottom', label: 'Desplazamiento inferior', type: 'text' },
  { key: 'left', label: 'Desplazamiento izquierdo', type: 'text' },
  { key: 'zIndex', label: 'Profundidad (z-index)', type: 'text' },
  { key: 'flexDirection', label: 'Dirección del contenido', type: 'select', options: ['row', 'row-reverse', 'column', 'column-reverse'] },
  { key: 'justifyContent', label: 'Distribución horizontal', type: 'select', options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] },
  { key: 'alignItems', label: 'Alineación transversal', type: 'select', options: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] },
  { key: 'gap', label: 'Separación entre elementos', type: 'text' },
  { key: 'rowGap', label: 'Separación entre filas', type: 'text' },
  { key: 'columnGap', label: 'Separación entre columnas', type: 'text' },
  { key: 'gridTemplateColumns', label: 'Columnas del grid', type: 'text', hint: 'Ej. repeat(3, 1fr)' },
  { key: 'overflow', label: 'Contenido desbordado', type: 'select', options: ['visible', 'hidden', 'auto', 'scroll'] },
];

const MEDIA_FIELDS: Field[] = [
  { key: 'objectFit', label: 'Ajuste de imagen', type: 'select', options: ['contain', 'cover', 'fill', 'none'] },
  { key: 'width', label: 'Ancho del elemento', type: 'text' },
  { key: 'height', label: 'Alto del elemento', type: 'text' },
];

const EFFECT_FIELDS: Field[] = [
  { key: 'opacity', label: 'Opacidad', type: 'text', hint: '0 a 1' },
  { key: 'boxShadow', label: 'Sombra', type: 'text' },
  { key: 'transform', label: 'Transformación visual', type: 'text', hint: 'Ej. rotate(2deg) scale(1.02)' },
  { key: 'transition', label: 'Transición visual', type: 'text', hint: 'Ej. all .2s ease' },
  { key: 'filter', label: 'Filtro visual', type: 'text', hint: 'Ej. brightness(1.05)' },
  { key: 'backdropFilter', label: 'Desenfoque de fondo', type: 'text', hint: 'Ej. blur(12px)' },
  { key: 'outline', label: 'Contorno de enfoque', type: 'text' },
  { key: 'outlineOffset', label: 'Separación del contorno', type: 'text' },
];

const BUTTON_PRESETS: Array<{ id: string; label: string; description: string; style: VisualElementStyle }> = [
  { id: 'solid', label: 'Sólido', description: 'Relleno clásico', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 8px 24px rgba(15,23,42,.10)' } },
  { id: 'soft', label: 'Soft', description: 'Relleno ligero', style: { backgroundColor: '#E8F7F0', color: '#11613F', borderColor: '#E8F7F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none' } },
  { id: 'outline', label: 'Outline', description: 'Solo contorno', style: { backgroundColor: '#FFFFFF', color: '#16A36A', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none' } },
  { id: 'ghost', label: 'Ghost', description: 'Visual transparente', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none' } },
  { id: 'glass', label: 'Liquid Glass', description: 'Cristal con blur', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 18px 45px rgba(15,23,42,.16)', backdropFilter: 'blur(12px)' } },
  { id: 'elevated', label: 'Elevado', description: 'Sombra profunda', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 18px 45px rgba(15,23,42,.16)' } },
  { id: 'dark', label: 'Dark', description: 'Contraste fuerte', style: { backgroundColor: '#0F172A', color: '#FFFFFF', borderColor: '#0F172A', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 8px 24px rgba(15,23,42,.10)' } },
  { id: 'light', label: 'Light', description: 'Minimalista', style: { backgroundColor: '#FFFFFF', color: '#334155', borderColor: '#CBD5E1', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 2px 10px rgba(15,23,42,.06)' } },
  { id: 'success', label: 'Éxito', description: 'Acción positiva', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 8px 24px rgba(15,23,42,.10)' } },
  { id: 'warning', label: 'Advertencia', description: 'Atención', style: { backgroundColor: '#D97706', color: '#FFFFFF', borderColor: '#D97706', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 8px 24px rgba(15,23,42,.10)' } },
  { id: 'danger', label: 'Peligro', description: 'Acción destructiva', style: { backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 8px 24px rgba(15,23,42,.10)' } },
  { id: 'compact', label: 'Compacto', description: 'Control pequeño', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none', padding: '8px 12px' } },
  { id: 'large', label: 'Grande', description: 'CTA destacado', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 18px 45px rgba(15,23,42,.16)', padding: '16px 24px' } },
  { id: 'softui', label: 'Soft UI', description: 'Volumen suave', style: { backgroundColor: '#F1F5F9', color: '#334155', borderColor: '#F1F5F9', borderStyle: 'solid', borderWidth: '1px', boxShadow: '8px 8px 18px rgba(15,23,42,.16)' } },
  { id: 'dashed', label: 'Dashed', description: 'Borde discontinuo', style: { backgroundColor: '#FFFFFF', color: '#334155', borderColor: '#94A3B8', borderStyle: 'dashed', borderWidth: '2px', boxShadow: 'none' } },
  { id: 'double', label: 'Double', description: 'Borde doble', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#0F172A', borderStyle: 'double', borderWidth: '3px', boxShadow: 'none' } },
];

const SHAPES = [
  ['square', 'Cuadrado', '0px'], ['soft', 'Suave', '6px'], ['rounded', 'Redondeado', '12px'], ['curved', 'Curvo', '16px'],
  ['pill', 'Píldora', '999px'], ['capsule', 'Cápsula', '32px'], ['oval', 'Ovalado', '50%'], ['squircle', 'Squircle', '22%'],
  ['arch', 'Arco', '32px 32px 8px 8px'], ['reverse', 'Arco invertido', '8px 8px 32px 32px'], ['top', 'Curva superior', '24px 24px 4px 4px'], ['bottom', 'Curva inferior', '4px 4px 24px 24px'],
] as const;

function cssEscape(value: string) {
  try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

function isDynamicId(value: string) {
  return value.startsWith('radix-') || value.startsWith('headlessui-') || value.startsWith(':r') || value.length > 20 || value.split('').every(char => char >= '0' && char <= '9');
}

function attrSelector(name: string, value: string) {
  const safe = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name}="${safe}"]`;
}

function selectorMatchesOnlyElement(selector: string, element: HTMLElement) {
  try {
    const matches = document.querySelectorAll<HTMLElement>(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function getNthOfType(element: HTMLElement) {
  if (!element.parentElement) return '';
  const siblings = Array.from(element.parentElement.children).filter(child => child.tagName === element.tagName);
  return siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : '';
}

function buildFallbackSelector(element: HTMLElement) {
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

function buildSelector(element: HTMLElement) {
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
  return buildFallbackSelector(element);
}

function readVisibleText(element: HTMLElement) {
  const direct = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()));
  if (direct.length) return direct.map(node => node.textContent?.trim() ?? '').join(' ');
  return element.childElementCount === 0 ? element.textContent?.trim() ?? '' : '';
}

function describeElement(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  const text = readVisibleText(element).replace(/\s+/g, ' ').trim().slice(0, 70);
  const label = element.getAttribute('aria-label') || element.getAttribute('title') || text;
  const names: Record<string, string> = {
    button: 'Botón', a: 'Enlace', input: 'Campo de entrada', select: 'Selector', textarea: 'Área de texto',
    img: 'Imagen', video: 'Video', canvas: 'Lienzo', nav: 'Navegación', header: 'Cabecera', section: 'Sección',
    form: 'Formulario', label: 'Etiqueta', main: 'Contenedor principal', aside: 'Barra lateral', article: 'Tarjeta',
    div: 'Contenedor', span: 'Texto', p: 'Párrafo', h1: 'Título', h2: 'Título', h3: 'Título', h4: 'Título',
    h5: 'Título', h6: 'Título', li: 'Elemento de lista', ul: 'Lista', ol: 'Lista', table: 'Tabla', tr: 'Fila', td: 'Celda', th: 'Celda',
  };
  return `${names[tag] ?? 'Elemento'}${label ? ` — “${label}”` : ''}`;
}

function toHex(value: string): string | undefined {
  if (value.startsWith('#') && value.length === 7) return value;
  const match = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return undefined;
  return `#${[1, 2, 3].map(index => Number(match[Number(index)]).toString(16).padStart(2, '0')).join('')}`;
}

function readComputedStyle(element: HTMLElement): VisualElementStyle {
  const s = window.getComputedStyle(element);
  return sanitizeVisualElementStyle({
    textContent: readVisibleText(element),
    backgroundColor: toHex(s.backgroundColor),
    backgroundImage: s.backgroundImage.startsWith('linear-gradient(') ? s.backgroundImage : undefined,
    color: toHex(s.color),
    borderColor: toHex(s.borderTopColor),
    borderStyle: s.borderTopStyle,
    borderWidth: s.borderTopWidth,
    borderRadius: s.borderRadius,
    boxShadow: s.boxShadow,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    textTransform: s.textTransform,
    textDecoration: s.textDecorationLine === 'none' ? 'none' : s.textDecorationLine.includes('line-through') ? 'line-through' : 'underline',
    textAlign: s.textAlign,
    padding: s.padding,
    paddingTop: s.paddingTop,
    paddingRight: s.paddingRight,
    paddingBottom: s.paddingBottom,
    paddingLeft: s.paddingLeft,
    margin: s.margin,
    marginTop: s.marginTop,
    marginRight: s.marginRight,
    marginBottom: s.marginBottom,
    marginLeft: s.marginLeft,
    width: s.width,
    minWidth: s.minWidth,
    maxWidth: s.maxWidth,
    height: s.height,
    minHeight: s.minHeight,
    maxHeight: s.maxHeight,
    opacity: s.opacity,
    display: s.display as VisualElementStyle['display'],
    position: s.position as VisualElementStyle['position'],
    top: s.top,
    right: s.right,
    bottom: s.bottom,
    left: s.left,
    zIndex: s.zIndex,
    flexDirection: s.flexDirection as VisualElementStyle['flexDirection'],
    justifyContent: s.justifyContent as VisualElementStyle['justifyContent'],
    alignItems: s.alignItems as VisualElementStyle['alignItems'],
    gap: s.gap,
    rowGap: s.rowGap,
    columnGap: s.columnGap,
    gridTemplateColumns: s.gridTemplateColumns,
    overflow: s.overflow as VisualElementStyle['overflow'],
    cursor: s.cursor as VisualElementStyle['cursor'],
    objectFit: s.objectFit as VisualElementStyle['objectFit'],
    transform: s.transform === 'none' ? 'none' : s.transform,
    transition: s.transition,
    filter: s.filter === 'none' ? 'none' : s.filter,
    backdropFilter: s.backdropFilter === 'none' ? 'none' : s.backdropFilter,
    outline: s.outline,
    outlineOffset: s.outlineOffset,
  });
}

function cloneOverrides(source: VisualSettingsDraft['element_overrides']) {
  return Object.fromEntries(Object.entries(source ?? {}).map(([selector, style]) => [selector, { ...style }]));
}

function getInitialOverrides(settings: ReturnType<typeof useVisualTheme>['settings'], scope: VisualInterfaceScope) {
  return cloneOverrides(settings.interface_overrides?.[scope]?.element_overrides ?? settings.element_overrides);
}

function isButtonElement(element: HTMLElement) {
  return element.tagName === 'BUTTON' || element.tagName === 'A' || element.getAttribute('role') === 'button';
}

function isTextElement(element: HTMLElement) {
  return ['P', 'SPAN', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH'].includes(element.tagName);
}

function isMediaElement(element: HTMLElement) {
  return ['IMG', 'VIDEO', 'PICTURE', 'CANVAS'].includes(element.tagName);
}

type FieldEditorProps = {
  field: Field;
  value: VisualElementStyle[keyof VisualElementStyle];
  onCommit: (patch: VisualElementStyle) => void;
};

function FieldEditor({ field, value, onCommit }: FieldEditorProps) {
  const stringValue = String(value ?? '');
  const colorValue = typeof value === 'string' && value.startsWith('#') && value.length === 7 ? value : '#ffffff';
  const update = (nextValue: string) => onCommit({ [field.key]: nextValue } as VisualElementStyle);

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-600">{field.label}</span>
      {field.hint && <span className="mb-1 block text-[10px] text-slate-400">{field.hint}</span>}
      {field.type === 'color' && (
        <div className="flex gap-2">
          <input
            aria-label={field.label}
            type="color"
            value={colorValue}
            onChange={event => update(event.target.value)}
            className="size-10 cursor-pointer rounded-lg border border-slate-200 p-1"
          />
          <input
            aria-label={`${field.label} hexadecimal`}
            value={stringValue}
            onChange={event => update(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      )}
      {field.type === 'select' && (
        <select
          value={stringValue}
          onChange={event => update(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
      {field.type === 'textarea' && (
        <textarea
          value={stringValue}
          onChange={event => update(event.target.value)}
          className="min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm"
          maxLength={500}
        />
      )}
      {field.type === 'text' && (
        <input
          value={stringValue}
          onChange={event => update(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      )}
    </label>
  );
}

type SectionProps = {
  id: SectionId;
  title: string;
  openSection: SectionId | null;
  setOpenSection: (id: SectionId | null) => void;
  children: React.ReactNode;
};

function InspectorSection({ id, title, openSection, setOpenSection, children }: SectionProps) {
  const open = openSection === id;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpenSection(open ? null : id)}
        className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left"
      >
        <span className="text-[11px] font-black uppercase tracking-[.12em] text-slate-700">{title}</span>
        <ChevronDown className={`size-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function ButtonPresetGrid({ onApply, current }: { onApply: (style: VisualElementStyle) => void; current: VisualElementStyle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {BUTTON_PRESETS.map(preset => {
        const active = preset.style.backgroundColor === current.backgroundColor && preset.style.color === current.color && preset.style.borderStyle === current.borderStyle;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.style)}
            className={`group rounded-xl border p-2 text-left transition ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}
          >
            <span
              className="flex h-9 items-center justify-center rounded-lg border text-[10px] font-black"
              style={{
                backgroundColor: preset.style.backgroundColor,
                color: preset.style.color,
                borderColor: preset.style.borderColor,
                borderStyle: preset.style.borderStyle,
                borderWidth: preset.style.borderWidth,
              }}
            >
              {preset.label}
            </span>
            <span className="mt-1 block text-[9px] text-slate-400">{preset.description}</span>
          </button>
        );
      })}
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
  const [message, setMessage] = useState('1 clic ejecuta · 3 clics edita · Modo diseño selecciona');
  const [designMode, setDesignMode] = useState(false);
  const [openSection, setOpenSection] = useState<SectionId | null>('text');
  const clickState = useRef<{ element: HTMLElement | null; count: number; timer: number | null }>({ element: null, count: 0, timer: null });
  const replayingClick = useRef(false);

  const isButton = Boolean(selected && isButtonElement(selected.element));
  const isText = Boolean(selected && isTextElement(selected.element));
  const isMedia = Boolean(selected && isMediaElement(selected.element));
  const selectedStyle = useMemo(
    () => selected ? { ...inspectedStyle, ...(sessionOverrides[selected.selector] ?? {}), ...draftStyle } : {},
    [draftStyle, inspectedStyle, selected, sessionOverrides],
  );
  const hasCustomStyle = Boolean(selected && Object.keys(sessionOverrides[selected.selector] ?? {}).length);

  useEffect(() => { sessionOverridesRef.current = sessionOverrides; }, [sessionOverrides]);

  const syncSessionOverrides = (next: VisualSettingsDraft['element_overrides']) => {
    const cloned = cloneOverrides(next);
    sessionOverridesRef.current = cloned;
    setSessionOverrides(cloned);
  };

  const selectElement = (element: HTMLElement) => {
    const selector = buildSelector(element);
    if (!selector || !selectorMatchesOnlyElement(selector, element)) {
      setSelected(null);
      setMessage('No se pudo identificar este elemento de forma independiente.');
      return;
    }
    const computed = readComputedStyle(element);
    setSelected({ element, selector, label: describeElement(element), tag: element.tagName.toLowerCase() });
    setInspectedStyle(computed);
    setDraftStyle({ ...(sessionOverridesRef.current[selector] ?? {}) });
    setOpenSection(isButtonElement(element) ? 'button' : isMediaElement(element) ? 'media' : isTextElement(element) ? 'text' : 'colors');
  };

  useEffect(() => {
    const onPreviewMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview' || !event.data?.settings) return;
      const next = sanitizeVisualSettings(event.data.settings as Partial<VisualSettingsDraft>);
      syncSessionOverrides(next.element_overrides ?? {});
      if (selected) setDraftStyle({ ...(next.element_overrides?.[selected.selector] ?? {}) });
    };
    window.addEventListener('message', onPreviewMessage);
    return () => window.removeEventListener('message', onPreviewMessage);
  }, [selected]);

  useEffect(() => {
    const handleSelection = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || replayingClick.current || target.closest(PROTECTED_SELECTOR)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const editable = target.closest('*') as HTMLElement | null;
      if (!editable || editable === document.body || editable === document.documentElement) return;
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(editable.tagName)) return;

      const state = clickState.current;
      state.count = state.element === editable ? state.count + 1 : 1;
      state.element = editable;
      if (state.timer) window.clearTimeout(state.timer);

      if (designMode) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Elemento seleccionado. Sus valores actuales aparecen en cada campo.');
        state.element = null;
        state.count = 0;
        state.timer = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (state.count >= 3) {
        state.count = 0;
        state.timer = null;
        event.stopImmediatePropagation();
        selectElement(editable);
        setMessage('Elemento seleccionado de forma independiente.');
        return;
      }

      state.timer = window.setTimeout(() => {
        const current = clickState.current;
        if (current.element !== editable || current.count < 1) return;
        replayingClick.current = true;
        try { editable.click(); } finally {
          window.setTimeout(() => { replayingClick.current = false; }, 0);
        }
        current.element = null;
        current.count = 0;
        current.timer = null;
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
      const property = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      previous.set(property, element.style.getPropertyValue(property));
      element.style.setProperty(property, value, 'important');
    });
    return () => previous.forEach((value, property) => value ? element.style.setProperty(property, value) : element.style.removeProperty(property));
  }, [draftStyle, selected]);

  const buildDraftSettings = (nextOverrides: Record<string, VisualElementStyle>) => {
    const currentScope = settings.interface_overrides?.[scope] ?? {};
    return sanitizeVisualSettings({
      ...settings,
      element_overrides: settings.element_overrides ?? {},
      interface_overrides: {
        ...(settings.interface_overrides ?? {}),
        [scope]: { ...currentScope, element_overrides: nextOverrides },
      },
    });
  };

  const notifyHost = (type: 'quickbite-visual-element-edit' | 'quickbite-visual-element-reset', fullSettings: VisualSettingsDraft, selector: string, styles?: VisualElementStyle) => {
    try {
      const target = window.parent !== window ? window.parent : window.opener;
      target?.postMessage({ type, scope, selector, ...(styles ? { styles } : {}), settings: fullSettings }, window.location.origin);
    } catch {
      // Host communication is optional in standalone preview mode.
    }
  };

  const commit = (patch: VisualElementStyle) => {
    if (!selected) return;
    const current = sessionOverridesRef.current[selected.selector] ?? {};
    const next = sanitizeVisualElementStyle({ ...current, ...draftStyle, ...patch });
    const nextOverrides = { ...sessionOverridesRef.current, [selected.selector]: next };
    syncSessionOverrides(nextOverrides);
    setDraftStyle(next);
    notifyHost('quickbite-visual-element-edit', buildDraftSettings(nextOverrides), selected.selector, next);
    setMessage('Guardado en el borrador de este elemento únicamente.');
  };

  const reset = () => {
    if (!selected) return;
    const next = { ...sessionOverridesRef.current };
    delete next[selected.selector];
    syncSessionOverrides(next);
    setDraftStyle({});
    setInspectedStyle(readComputedStyle(selected.element));
    notifyHost('quickbite-visual-element-reset', buildDraftSettings(next), selected.selector);
    setMessage('Este elemento volvió a sus valores originales.');
  };

  return (
    <>
      <div data-qb-visual-editor className="fixed left-4 top-4 z-[9998] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Edit3 className="size-4" /></div>
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-300">Editor visual universal</p><p className="truncate text-xs font-bold">{message}</p></div>
        <button type="button" onClick={() => setDesignMode(value => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${designMode ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/15'}`}>{designMode ? 'Modo diseño' : 'Interactivo'}</button>
      </div>

      {selected && (
        <aside data-qb-visual-editor-panel className="fixed bottom-4 right-4 z-[9999] max-h-[calc(100vh-2rem)] w-[min(500px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-emerald-600" /><p className="truncate text-sm font-black text-slate-900">{selected.label}</p></div>
              <p className="mt-1 truncate text-[10px] font-mono text-slate-400" title={selected.selector}>{selected.selector}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">TAG: {selected.tag}</span>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black ${hasCustomStyle ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{hasCustomStyle ? 'PERSONALIZADO' : 'VALOR ORIGINAL'}</span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">INDEPENDIENTE</span>
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
          </div>

          <div className="max-h-[calc(100vh-10rem)] space-y-2 overflow-y-auto p-4">
            {isButton && (
              <InspectorSection id="button" title="Botón — tipo visual" openSection={openSection} setOpenSection={setOpenSection}>
                <p className="mb-3 text-[11px] leading-5 text-slate-500">Estas opciones modifican únicamente este botón o enlace.</p>
                <ButtonPresetGrid current={selectedStyle} onApply={commit} />
              </InspectorSection>
            )}

            {(isButton || ['input', 'select', 'textarea'].includes(selected.tag)) && (
              <InspectorSection id="shape" title="Forma — shape" openSection={openSection} setOpenSection={setOpenSection}>
                <div className="grid grid-cols-3 gap-2">
                  {SHAPES.map(([id, label, radius]) => (
                    <button key={id} type="button" onClick={() => commit({ borderRadius: radius })} className={`rounded-xl border p-2 text-center text-[10px] font-black ${selectedStyle.borderRadius === radius ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                      <span className="mx-auto mb-1 block h-7 w-12 border border-slate-400 bg-slate-100" style={{ borderRadius: radius }} />{label}
                    </button>
                  ))}
                </div>
                <div className="mt-3"><FieldEditor field={{ key: 'borderRadius', label: 'Radio personalizado', type: 'text', hint: 'Cualquier valor CSS válido' }} value={selectedStyle.borderRadius} onCommit={commit} /></div>
              </InspectorSection>
            )}

            <InspectorSection id="text" title={isText ? 'Texto y tipografía' : 'Contenido y tipografía'} openSection={openSection} setOpenSection={setOpenSection}>
              <div className="space-y-3">
                {TEXT_FIELDS.filter(field => field.key !== 'textContent' || isText || selected.element.childElementCount === 0).map(field => (
                  <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />
                ))}
              </div>
            </InspectorSection>

            <InspectorSection id="colors" title={isButton ? 'Colores y borde del botón' : 'Colores y borde del elemento'} openSection={openSection} setOpenSection={setOpenSection}>
              <div className="space-y-3">{COLOR_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div>
            </InspectorSection>

            <InspectorSection id="spacing" title="Espaciado individual" openSection={openSection} setOpenSection={setOpenSection}>
              <div className="space-y-3">{SPACING_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div>
            </InspectorSection>

            <InspectorSection id="layout" title="Tamaño y posición" openSection={openSection} setOpenSection={setOpenSection}>
              <div className="space-y-3">{LAYOUT_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div>
            </InspectorSection>

            {isMedia && (
              <InspectorSection id="media" title="Imagen / multimedia" openSection={openSection} setOpenSection={setOpenSection}>
                <div className="space-y-3">{MEDIA_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div>
              </InspectorSection>
            )}

            <InspectorSection id="effects" title="Efectos y comportamiento visual" openSection={openSection} setOpenSection={setOpenSection}>
              <div className="space-y-3">{EFFECT_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div>
            </InspectorSection>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[10px] leading-5 text-blue-800"><strong>Configuración actual:</strong> cada campo muestra el valor calculado de este elemento. Los cambios se guardan bajo un selector único.</div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={reset} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"><RotateCcw className="size-3.5" />Restaurar este elemento</button>
              <button type="button" onClick={() => setSelected(null)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Check className="size-3.5" />Terminar edición</button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
