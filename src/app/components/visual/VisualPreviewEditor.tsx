import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
type VisualTarget = HTMLElement | SVGElement;
type Selected = { element: VisualTarget; selector: string; label: string; tag: string } | null;
type FieldType = 'color' | 'text' | 'textarea' | 'select';
type Field = { key: keyof VisualElementStyle; label: string; type: FieldType; options?: string[]; hint?: string };
type SectionId = 'presets' | 'button' | 'shape' | 'text' | 'colors' | 'spacing' | 'layout' | 'media' | 'effects';

const PROTECTED_SELECTOR = '[data-qb-visual-editor], [data-qb-visual-editor-panel]';
const FONT_OPTIONS = [
  'Nunito', 'Inter', 'Poppins', 'Roboto', 'Montserrat', 'Open Sans', 'Lato', 'Raleway',
  'Merriweather', 'Playfair Display', 'Source Sans 3', 'Ubuntu', 'DM Sans', 'Manrope',
  'Work Sans', 'system-ui', 'ui-sans-serif', 'Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'serif',
];

const TEXT_FIELDS: Field[] = [
  { key: 'textContent', label: 'Texto visible', type: 'textarea' },
  { key: 'fontFamily', label: 'Tipo de letra', type: 'select', options: FONT_OPTIONS },
  { key: 'fontSize', label: 'Tamaño de fuente', type: 'text', hint: '16px, 1rem, 1.1em…' },
  { key: 'fontWeight', label: 'Peso', type: 'select', options: ['400', '500', '600', '700', '800', '900'] },
  { key: 'lineHeight', label: 'Altura de línea', type: 'text', hint: '1.2, 1.5, 24px…' },
  { key: 'letterSpacing', label: 'Espaciado de letras', type: 'text', hint: '0, 0.02em…' },
  { key: 'textTransform', label: 'Transformación', type: 'select', options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  { key: 'textDecoration', label: 'Decoración', type: 'select', options: ['none', 'underline', 'line-through'] },
  { key: 'textAlign', label: 'Alineación', type: 'select', options: ['left', 'center', 'right', 'justify'] },
];

const COLOR_FIELDS: Field[] = [
  { key: 'backgroundColor', label: 'Color de fondo', type: 'color' },
  { key: 'backgroundImage', label: 'Gradiente / imagen de fondo', type: 'text', hint: 'linear-gradient(...) o none' },
  { key: 'color', label: 'Color del contenido', type: 'color' },
  { key: 'borderColor', label: 'Color del borde', type: 'color' },
  { key: 'borderStyle', label: 'Tipo de borde', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { key: 'borderWidth', label: 'Grosor del borde', type: 'text', hint: '0, 1px, 2px…' },
];

const SPACING_FIELDS: Field[] = [
  { key: 'padding', label: 'Padding', type: 'text', hint: '12px 16px' },
  { key: 'paddingTop', label: 'Padding superior', type: 'text' },
  { key: 'paddingRight', label: 'Padding derecho', type: 'text' },
  { key: 'paddingBottom', label: 'Padding inferior', type: 'text' },
  { key: 'paddingLeft', label: 'Padding izquierdo', type: 'text' },
  { key: 'margin', label: 'Margin', type: 'text', hint: '8px 0' },
  { key: 'marginTop', label: 'Margin superior', type: 'text' },
  { key: 'marginRight', label: 'Margin derecho', type: 'text' },
  { key: 'marginBottom', label: 'Margin inferior', type: 'text' },
  { key: 'marginLeft', label: 'Margin izquierdo', type: 'text' },
];

const LAYOUT_FIELDS: Field[] = [
  { key: 'width', label: 'Ancho', type: 'text', hint: 'px, %, rem, auto' },
  { key: 'minWidth', label: 'Ancho mínimo', type: 'text' },
  { key: 'maxWidth', label: 'Ancho máximo', type: 'text' },
  { key: 'height', label: 'Alto', type: 'text' },
  { key: 'minHeight', label: 'Alto mínimo', type: 'text' },
  { key: 'maxHeight', label: 'Alto máximo', type: 'text' },
  { key: 'display', label: 'Display', type: 'select', options: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'] },
  { key: 'position', label: 'Posición', type: 'select', options: ['static', 'relative', 'absolute', 'sticky'] },
  { key: 'top', label: 'Top', type: 'text' },
  { key: 'right', label: 'Right', type: 'text' },
  { key: 'bottom', label: 'Bottom', type: 'text' },
  { key: 'left', label: 'Left', type: 'text' },
  { key: 'zIndex', label: 'Z-index', type: 'text' },
  { key: 'flexDirection', label: 'Dirección flex', type: 'select', options: ['row', 'row-reverse', 'column', 'column-reverse'] },
  { key: 'justifyContent', label: 'Justificación', type: 'select', options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] },
  { key: 'alignItems', label: 'Alineación', type: 'select', options: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] },
  { key: 'gap', label: 'Gap', type: 'text' },
  { key: 'rowGap', label: 'Gap filas', type: 'text' },
  { key: 'columnGap', label: 'Gap columnas', type: 'text' },
  { key: 'gridTemplateColumns', label: 'Columnas grid', type: 'text', hint: 'repeat(3, 1fr)' },
  { key: 'overflow', label: 'Overflow', type: 'select', options: ['visible', 'hidden', 'auto', 'scroll'] },
  { key: 'cursor', label: 'Cursor', type: 'select', options: ['default', 'pointer', 'text', 'not-allowed', 'grab'] },
];

const MEDIA_FIELDS: Field[] = [
  { key: 'objectFit', label: 'Ajuste multimedia', type: 'select', options: ['contain', 'cover', 'fill', 'none'] },
  { key: 'width', label: 'Ancho multimedia', type: 'text' },
  { key: 'height', label: 'Alto multimedia', type: 'text' },
];

const EFFECT_FIELDS: Field[] = [
  { key: 'opacity', label: 'Opacidad', type: 'text', hint: '0 a 1' },
  { key: 'boxShadow', label: 'Sombra', type: 'text', hint: '0 8px 24px rgba(...)' },
  { key: 'borderRadius', label: 'Radio de borde', type: 'text', hint: '12px, 999px…' },
  { key: 'transform', label: 'Transformación', type: 'text', hint: 'rotate(...) scale(...)' },
  { key: 'transition', label: 'Transición', type: 'text', hint: 'all .2s ease' },
  { key: 'filter', label: 'Filtro', type: 'text', hint: 'brightness(1.05)' },
  { key: 'backdropFilter', label: 'Blur de fondo', type: 'text', hint: 'blur(12px)' },
  { key: 'outline', label: 'Outline', type: 'text' },
  { key: 'outlineOffset', label: 'Offset del outline', type: 'text' },
];

const UNIVERSAL_PRESETS: Array<{ id: string; label: string; description: string; style: VisualElementStyle }> = [
  { id: 'brand', label: 'Marca', description: 'Verde QuickBite', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', borderRadius: '12px' } },
  { id: 'neutral', label: 'Neutro', description: 'Superficie limpia', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'soft-green', label: 'Verde suave', description: 'Acento ligero', style: { backgroundColor: '#E8F7F0', color: '#11613F', borderColor: '#BCEBD7', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'soft-blue', label: 'Azul suave', description: 'Acento informativo', style: { backgroundColor: '#EAF1FF', color: '#1747B8', borderColor: '#C7DAFF', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'soft-amber', label: 'Ámbar suave', description: 'Acento de atención', style: { backgroundColor: '#FFF4D6', color: '#8A4B00', borderColor: '#F7D68A', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'soft-red', label: 'Rojo suave', description: 'Acento de error', style: { backgroundColor: '#FFE7E7', color: '#991B1B', borderColor: '#F7B4B4', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'outline-green', label: 'Outline verde', description: 'Solo borde', style: { backgroundColor: 'transparent', color: '#16A36A', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '2px' } },
  { id: 'outline-blue', label: 'Outline azul', description: 'Solo borde', style: { backgroundColor: 'transparent', color: '#2563EB', borderColor: '#2563EB', borderStyle: 'solid', borderWidth: '2px' } },
  { id: 'ghost', label: 'Ghost', description: 'Sin relleno visual', style: { backgroundColor: 'transparent', color: '#334155', borderColor: 'transparent', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'glass', label: 'Glass', description: 'Cristal', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 18px 45px rgba(15,23,42,.16)', backdropFilter: 'blur(12px)' } },
  { id: 'elevated', label: 'Elevado', description: 'Profundidad', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: '0 18px 45px rgba(15,23,42,.16)' } },
  { id: 'flat', label: 'Plano', description: 'Sin sombra', style: { backgroundColor: '#FFFFFF', color: '#0F172A', borderColor: '#E2E8F0', borderStyle: 'solid', borderWidth: '1px', boxShadow: 'none' } },
  { id: 'dark', label: 'Oscuro', description: 'Contraste alto', style: { backgroundColor: '#0F172A', color: '#FFFFFF', borderColor: '#0F172A', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'deep-green', label: 'Verde profundo', description: 'Marca intensa', style: { backgroundColor: '#087A50', color: '#FFFFFF', borderColor: '#087A50', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'cyan', label: 'Cian', description: 'Acento moderno', style: { backgroundColor: '#E3FBFF', color: '#0E7490', borderColor: '#A5F3FC', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'violet', label: 'Violeta', description: 'Acento premium', style: { backgroundColor: '#F1EAFF', color: '#6D28D9', borderColor: '#DDD6FE', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'rose', label: 'Rosa', description: 'Acento visual', style: { backgroundColor: '#FFE8EE', color: '#BE123C', borderColor: '#FECDD3', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'dashed', label: 'Discontinuo', description: 'Borde dashed', style: { backgroundColor: 'transparent', color: '#334155', borderColor: '#94A3B8', borderStyle: 'dashed', borderWidth: '2px' } },
  { id: 'double', label: 'Doble', description: 'Borde doble', style: { backgroundColor: 'transparent', color: '#0F172A', borderColor: '#0F172A', borderStyle: 'double', borderWidth: '3px' } },
  { id: 'pill', label: 'Píldora', description: 'Radio completo', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', borderRadius: '999px' } },
  { id: 'compact', label: 'Compacto', description: 'Más pequeño', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', padding: '8px 12px' } },
  { id: 'large', label: 'Grande', description: 'Más presencia', style: { backgroundColor: '#16A36A', color: '#FFFFFF', borderColor: '#16A36A', borderStyle: 'solid', borderWidth: '1px', padding: '16px 24px' } },
];

const BUTTON_PRESETS = [
  ...UNIVERSAL_PRESETS,
  { id: 'warning', label: 'Advertencia', description: 'Acción preventiva', style: { backgroundColor: '#D97706', color: '#FFFFFF', borderColor: '#D97706', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'danger', label: 'Peligro', description: 'Acción destructiva', style: { backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#DC2626', borderStyle: 'solid', borderWidth: '1px' } },
  { id: 'info', label: 'Info', description: 'Acción informativa', style: { backgroundColor: '#2563EB', color: '#FFFFFF', borderColor: '#2563EB', borderStyle: 'solid', borderWidth: '1px' } },
] as const;

const SHAPES = [
  ['square', 'Cuadrado', '0px'], ['soft', 'Suave', '6px'], ['rounded', 'Redondeado', '12px'], ['curved', 'Curvo', '16px'],
  ['large-rounded', 'Grande', '20px'], ['pill', 'Píldora', '999px'], ['capsule', 'Cápsula', '32px'], ['oval', 'Ovalado', '50%'],
  ['squircle', 'Squircle', '22%'], ['arch', 'Arco', '32px 32px 8px 8px'], ['reverse-arch', 'Arco invertido', '8px 8px 32px 32px'],
  ['top', 'Curva superior', '24px 24px 4px 4px'], ['bottom', 'Curva inferior', '4px 4px 24px 24px'], ['cut', 'Corte suave', '18px 6px 18px 6px'],
  ['reverse-cut', 'Corte invertido', '6px 18px 6px 18px'], ['wide', 'Ancho suave', '12px 28px'], ['high', 'Alto suave', '28px 12px'], ['asymmetric', 'Asimétrico', '28px 10px 18px 36px'],
] as const;

function cssEscape(value: string) {
  try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

function attrSelector(name: string, value: string) {
  const safe = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name}="${safe}"]`;
}

function isDynamicId(value: string) {
  return value.startsWith('radix-') || value.startsWith('headlessui-') || value.startsWith(':r') || value.length > 20 || value.split('').every(char => char >= '0' && char <= '9');
}

function selectorMatchesOnlyElement(selector: string, element: Element) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch { return false; }
}

function getNthOfType(element: Element) {
  if (!element.parentElement) return '';
  const siblings = Array.from(element.parentElement.children).filter(child => child.tagName === element.tagName);
  return siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : '';
}

function buildSelector(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && current !== document.body) {
    let part = current.tagName.toLowerCase();
    const testId = current.getAttribute('data-testid');
    const slot = current.getAttribute('data-slot');
    const name = current.getAttribute('name');
    const aria = current.getAttribute('aria-label');
    const id = current.id;
    const classes = Array.from(current.classList).filter(name => !name.startsWith('dark:') && !name.includes(':') && name.length < 80);
    if (testId && selectorMatchesOnlyElement(attrSelector('data-testid', testId), current)) part += attrSelector('data-testid', testId);
    else if (slot && selectorMatchesOnlyElement(attrSelector('data-slot', slot), current)) part += attrSelector('data-slot', slot);
    else if (id && !isDynamicId(id) && selectorMatchesOnlyElement(`#${cssEscape(id)}`, current)) part += `#${cssEscape(id)}`;
    else if (name && selectorMatchesOnlyElement(`${part}${attrSelector('name', name)}`, current)) part += attrSelector('name', name);
    else if (aria && selectorMatchesOnlyElement(`${part}${attrSelector('aria-label', aria)}`, current)) part += attrSelector('aria-label', aria);
    else {
      const classCandidate = classes.slice(0, 4).map(cssEscape).join('.');
      if (classCandidate && selectorMatchesOnlyElement(`${part}.${classCandidate}`, current)) part += `.${classCandidate}`;
      else part += getNthOfType(current);
    }
    parts.unshift(part);
    const candidate = parts.join(' > ');
    if (selectorMatchesOnlyElement(candidate, element)) return candidate;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function readVisibleText(element: Element) {
  const direct = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()));
  if (direct.length) return direct.map(node => node.textContent?.trim() ?? '').join(' ');
  return element.childElementCount === 0 ? element.textContent?.trim() ?? '' : '';
}

function toHex(value: string): string | undefined {
  if (value.startsWith('#') && value.length === 7) return value.toUpperCase();
  const match = value.match(/^rgba?\(\s*(\d+)\s*[ ,]\s*(\d+)\s*[ ,]\s*(\d+)/i);
  if (!match) return undefined;
  return `#${[match[1], match[2], match[3]].map(part => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function readComputedStyle(element: Element): VisualElementStyle {
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

function describeElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  const text = readVisibleText(element).replace(/\s+/g, ' ').trim().slice(0, 70);
  const label = element.getAttribute('aria-label') || element.getAttribute('title') || text;
  const names: Record<string, string> = {
    button: 'Botón', a: 'Enlace', input: 'Campo', select: 'Selector', textarea: 'Área de texto', img: 'Imagen', video: 'Video',
    nav: 'Navegación', header: 'Cabecera', section: 'Sección', main: 'Contenedor', aside: 'Barra lateral', article: 'Tarjeta',
    div: 'Contenedor', span: 'Texto', p: 'Párrafo', h1: 'Título', h2: 'Título', h3: 'Título', h4: 'Título', h5: 'Título', h6: 'Título',
    li: 'Elemento de lista', ul: 'Lista', ol: 'Lista', table: 'Tabla', tr: 'Fila', td: 'Celda', th: 'Celda', svg: 'Icono', path: 'Trazo',
  };
  return `${names[tag] ?? 'Elemento'}${label ? ` — “${label}”` : ''}`;
}

function isButtonElement(element: Element) { return element.tagName === 'BUTTON' || element.tagName === 'A' || element.getAttribute('role') === 'button'; }
function isTextElement(element: Element) { return ['P', 'SPAN', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH'].includes(element.tagName); }
function isMediaElement(element: Element) { return ['IMG', 'VIDEO', 'PICTURE', 'CANVAS', 'SVG', 'PATH'].includes(element.tagName); }

type FieldEditorProps = { field: Field; value: VisualElementStyle[keyof VisualElementStyle]; onCommit: (patch: VisualElementStyle) => void };
function FieldEditor({ field, value, onCommit }: FieldEditorProps) {
  const stringValue = String(value ?? '');
  const colorValue = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  const update = (next: string) => onCommit({ [field.key]: next } as VisualElementStyle);
  return <label className="block">
    <span className="mb-1 block text-xs font-black qb-text-secondary">{field.label}</span>
    {field.hint && <span className="mb-1 block text-[10px] qb-text-muted">{field.hint}</span>}
    {field.type === 'color' && <div className="flex gap-2"><input aria-label={field.label} type="color" value={colorValue} onChange={e => update(e.target.value)} className="size-10 cursor-pointer rounded-lg border qb-border p-1" /><input aria-label={`${field.label} hexadecimal`} value={stringValue} onChange={e => update(e.target.value)} className="min-w-0 flex-1 rounded-xl border qb-border qb-surface-muted px-3 py-2 text-sm qb-text" /></div>}
    {field.type === 'select' && <select value={stringValue} onChange={e => update(e.target.value)} className="w-full rounded-xl border qb-border qb-surface-muted px-3 py-2 text-sm qb-text">{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select>}
    {field.type === 'textarea' && <textarea value={stringValue} onChange={e => update(e.target.value)} className="min-h-20 w-full resize-y rounded-xl border qb-border qb-surface-muted px-3 py-2 text-sm qb-text" maxLength={500} />}
    {field.type === 'text' && <input value={stringValue} onChange={e => update(e.target.value)} className="w-full rounded-xl border qb-border qb-surface-muted px-3 py-2 text-sm qb-text" />}
  </label>;
}

type SectionProps = { id: SectionId; title: string; openSection: SectionId | null; setOpenSection: (id: SectionId | null) => void; children: ReactNode };
function InspectorSection({ id, title, openSection, setOpenSection, children }: SectionProps) {
  const open = openSection === id;
  return <div className="overflow-hidden rounded-2xl border qb-border"><button type="button" onClick={() => setOpenSection(open ? null : id)} className="flex w-full items-center justify-between qb-surface-muted px-4 py-3 text-left"><span className="text-[11px] font-black uppercase tracking-[.12em] qb-text">{title}</span><ChevronDown className={`size-4 qb-text-muted transition ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="p-4">{children}</div>}</div>;
}

function PresetGrid({ presets, current, onApply, compact = false }: { presets: ReadonlyArray<{ id: string; label: string; description: string; style: VisualElementStyle }>; current: VisualElementStyle; onApply: (style: VisualElementStyle) => void; compact?: boolean }) {
  return <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
    {presets.map(preset => {
      const active = preset.style.backgroundColor === current.backgroundColor && preset.style.color === current.color && preset.style.borderStyle === current.borderStyle && (!preset.style.borderRadius || preset.style.borderRadius === current.borderRadius);
      return <button key={preset.id} type="button" onClick={() => onApply(preset.style)} className={`group rounded-xl border p-2 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/80 dark:border-emerald-300/40 dark:bg-emerald-500/10' : 'qb-border qb-surface hover:border-slate-400'}`}>
        <span className="flex h-9 items-center justify-center rounded-lg border text-[10px] font-black" style={{ backgroundColor: preset.style.backgroundColor, backgroundImage: preset.style.backgroundImage, color: preset.style.color, borderColor: preset.style.borderColor, borderStyle: preset.style.borderStyle, borderWidth: preset.style.borderWidth, borderRadius: preset.style.borderRadius }}>{preset.label}</span>
        <span className="mt-1 block text-[9px] qb-text-muted">{preset.description}</span>
      </button>;
    })}
  </div>;
}

export function VisualPreviewEditor({ scope }: Props) {
  const { settings } = useVisualTheme();
  const [selected, setSelected] = useState<Selected>(null);
  const [draftStyle, setDraftStyle] = useState<VisualElementStyle>({});
  const [inspectedStyle, setInspectedStyle] = useState<VisualElementStyle>({});
  const [sessionOverrides, setSessionOverrides] = useState(() => getInitialOverrides(settings, scope));
  const sessionOverridesRef = useRef(sessionOverrides);
  const [message, setMessage] = useState('Modo diseño activo · haz clic sobre cualquier elemento para editarlo');
  const [designMode, setDesignMode] = useState(true);
  const [openSection, setOpenSection] = useState<SectionId | null>('presets');

  const isButton = Boolean(selected && isButtonElement(selected.element));
  const isMedia = Boolean(selected && isMediaElement(selected.element));
  const isText = Boolean(selected && isTextElement(selected.element));
  const selectedStyle = useMemo(() => selected ? { ...inspectedStyle, ...(sessionOverrides[selected.selector] ?? {}), ...draftStyle } : {}, [draftStyle, inspectedStyle, selected, sessionOverrides]);
  const hasCustomStyle = Boolean(selected && Object.keys(sessionOverrides[selected.selector] ?? {}).length);

  useEffect(() => { sessionOverridesRef.current = sessionOverrides; }, [sessionOverrides]);

  const syncSessionOverrides = (next: VisualSettingsDraft['element_overrides']) => {
    const cloned = cloneOverrides(next);
    sessionOverridesRef.current = cloned;
    setSessionOverrides(cloned);
  };

  const selectElement = (element: Element) => {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return;
    const selector = buildSelector(element);
    if (!selector || !selectorMatchesOnlyElement(selector, element)) {
      setMessage('No se pudo identificar este elemento; se puede intentar seleccionar uno de sus contenedores.');
      return;
    }
    setSelected({ element: element as VisualTarget, selector, label: describeElement(element), tag: element.tagName.toLowerCase() });
    setInspectedStyle(readComputedStyle(element));
    setDraftStyle({ ...(sessionOverridesRef.current[selector] ?? {}) });
    setOpenSection(isButtonElement(element) ? 'button' : 'presets');
    setMessage('Elemento seleccionado. Todas las propiedades editables están disponibles.');
  };

  useEffect(() => {
    const handleSelection = (event: MouseEvent) => {
      const rawTarget = event.target;
      if (!(rawTarget instanceof Element) || rawTarget.closest(PROTECTED_SELECTOR)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(rawTarget.tagName)) return;
      if (!designMode) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      selectElement(rawTarget);
    };
    document.addEventListener('click', handleSelection, true);
    return () => document.removeEventListener('click', handleSelection, true);
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
      interface_overrides: { ...(settings.interface_overrides ?? {}), [scope]: { ...currentScope, element_overrides: nextOverrides } },
    });
  };

  const notifyHost = (type: 'quickbite-visual-element-edit' | 'quickbite-visual-element-reset', fullSettings: VisualSettingsDraft, selector: string, styles?: VisualElementStyle) => {
    try {
      const target = window.parent !== window ? window.parent : window.opener;
      target?.postMessage({ type, scope, selector, ...(styles ? { styles } : {}), settings: fullSettings }, window.location.origin);
    } catch { /* preview host communication is optional */ }
  };

  const commit = (patch: VisualElementStyle) => {
    if (!selected) return;
    const current = sessionOverridesRef.current[selected.selector] ?? {};
    const next = sanitizeVisualElementStyle({ ...current, ...draftStyle, ...patch });
    const nextOverrides = { ...sessionOverridesRef.current, [selected.selector]: next };
    syncSessionOverrides(nextOverrides);
    setDraftStyle(next);
    notifyHost('quickbite-visual-element-edit', buildDraftSettings(nextOverrides), selected.selector, next);
    setMessage('Cambio aplicado a este elemento.');
  };

  const reset = () => {
    if (!selected) return;
    const next = { ...sessionOverridesRef.current };
    delete next[selected.selector];
    syncSessionOverrides(next);
    setDraftStyle({});
    setInspectedStyle(readComputedStyle(selected.element));
    notifyHost('quickbite-visual-element-reset', buildDraftSettings(next), selected.selector);
    setMessage('Elemento restaurado a sus valores originales.');
  };

  return <>
    <div data-qb-visual-editor className="fixed left-4 top-4 z-[9998] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10"><Edit3 className="size-4" /></div>
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-300">Editor visual universal</p><p className="truncate text-xs font-bold">{message}</p></div>
      <button type="button" onClick={() => setDesignMode(value => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${designMode ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/15'}`}>{designMode ? 'Modo diseño' : 'Modo interactivo'}</button>
    </div>

    {selected && <aside data-qb-visual-editor-panel className="fixed bottom-4 right-4 z-[9999] max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-3xl border qb-border qb-surface shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b qb-border px-5 py-4">
        <div className="min-w-0"><div className="flex items-center gap-2"><Sparkles className="size-4 text-emerald-500" /><p className="truncate text-sm font-black qb-text">{selected.label}</p></div><p className="mt-1 truncate text-[10px] font-mono qb-text-muted" title={selected.selector}>{selected.selector}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full qb-surface-elevated px-2 py-1 text-[9px] font-black qb-text-secondary">TAG: {selected.tag}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black ${hasCustomStyle ? 'bg-emerald-500/15 text-emerald-500' : 'qb-surface-elevated qb-text-muted'}`}>{hasCustomStyle ? 'PERSONALIZADO' : 'VALOR ORIGINAL'}</span><span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black text-blue-500">EDITABLE</span></div></div>
        <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 qb-text-muted hover:bg-black/5 dark:hover:bg-white/5"><X className="size-4" /></button>
      </div>
      <div className="max-h-[calc(100vh-10rem)] space-y-2 overflow-y-auto p-4">
        <InspectorSection id="presets" title="Estilos rápidos · 20+ opciones" openSection={openSection} setOpenSection={setOpenSection}><p className="mb-3 text-[11px] leading-5 qb-text-secondary">Cada elemento puede probar estos estilos y después ajustar cualquier propiedad individual.</p><PresetGrid presets={UNIVERSAL_PRESETS} current={selectedStyle} onApply={commit} /></InspectorSection>
        {isButton && <InspectorSection id="button" title={`Botón / enlace · ${BUTTON_PRESETS.length} opciones`} openSection={openSection} setOpenSection={setOpenSection}><p className="mb-3 text-[11px] leading-5 qb-text-secondary">Los botones tienen más de 18 variantes y control independiente de tipografía.</p><PresetGrid presets={BUTTON_PRESETS} current={selectedStyle} onApply={commit} /></InspectorSection>}
        <InspectorSection id="shape" title="Forma y bordes" openSection={openSection} setOpenSection={setOpenSection}><div className="grid grid-cols-3 gap-2">{SHAPES.map(([id, label, radius]) => <button key={id} type="button" onClick={() => commit({ borderRadius: radius })} className={`rounded-xl border p-2 text-center text-[10px] font-black ${selectedStyle.borderRadius === radius ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/10 dark:text-emerald-300' : 'qb-border qb-text-secondary'}`}><span className="mx-auto mb-1 block h-7 w-12 border qb-border qb-surface-muted" style={{ borderRadius: radius }} />{label}</button>)}</div><div className="mt-3"><FieldEditor field={{ key: 'borderRadius', label: 'Radio personalizado', type: 'text', hint: '0px, 12px, 999px, 20px 8px…' }} value={selectedStyle.borderRadius} onCommit={commit} /></div></InspectorSection>
        <InspectorSection id="text" title={isText ? 'Texto y tipografía' : 'Contenido y tipografía'} openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{TEXT_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>
        <InspectorSection id="colors" title="Colores y borde" openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{COLOR_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>
        <InspectorSection id="spacing" title="Espaciado" openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{SPACING_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>
        <InspectorSection id="layout" title="Tamaño, posición y distribución" openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{LAYOUT_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>
        {isMedia && <InspectorSection id="media" title="Multimedia" openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{MEDIA_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>}
        <InspectorSection id="effects" title="Efectos y comportamiento visual" openSection={openSection} setOpenSection={setOpenSection}><div className="space-y-3">{EFFECT_FIELDS.map(field => <FieldEditor key={String(field.key)} field={field} value={selectedStyle[field.key]} onCommit={commit} />)}</div></InspectorSection>
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-[10px] leading-5 text-blue-500"><strong>Editor universal:</strong> todos los elementos seleccionables reciben inspector completo; no hay bloqueo por tipo de componente. Los cambios se aplican al elemento exacto seleccionado y se envían al editor padre.</div>
        <div className="flex gap-2 pt-1"><button type="button" onClick={reset} className="flex flex-1 items-center justify-center gap-2 rounded-xl border qb-border qb-surface-muted px-3 py-2 text-xs font-black qb-text-secondary hover:brightness-95"><RotateCcw className="size-3.5" />Restaurar</button><button type="button" onClick={() => setSelected(null)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white dark:bg-white dark:text-slate-950"><Check className="size-3.5" />Terminar</button></div>
      </div>
    </aside>}
  </>;
}
