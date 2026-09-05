import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, ImagePlus, Palette, RotateCcw, Save, ShieldCheck, Type, Upload, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualTheme } from '../../../contexts/VisualThemeProvider';
import { resetVisualSettings, saveVisualSettings, uploadBrandingImage } from '../../../../services/visualSettingsService';
import { DEFAULT_VISUAL_SETTINGS, isHexColor, type VisualSettingsDraft } from '../../../../types/visualSettings';
import { VisualPreview } from './VisualPreview';

const tabs = [
  { id: 'branding', label: 'Branding', icon: ImagePlus },
  { id: 'colors', label: 'Colores', icon: Palette },
  { id: 'type', label: 'Tipografía', icon: Type },
  { id: 'components', label: 'Componentes', icon: WandSparkles },
] as const;
type Tab = typeof tabs[number]['id'];

const colorFields: Array<[keyof VisualSettingsDraft, string]> = [
  ['primary_color', 'Primario'], ['secondary_color', 'Secundario'], ['accent_color', 'Acento'], ['background_color', 'Fondo'], ['surface_color', 'Superficies'], ['text_color', 'Texto principal'], ['muted_text_color', 'Texto secundario'], ['border_color', 'Bordes'], ['success_color', 'Éxito'], ['warning_color', 'Advertencia'], ['danger_color', 'Error'],
];

const selectOptions = {
  radius: [['sharp', 'Sharp'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['rounded', 'Rounded']],
  shadow: [['none', 'Sin sombra'], ['subtle', 'Sutil'], ['normal', 'Normal'], ['elevated', 'Elevada']],
  button: [['solid', 'Sólido'], ['soft', 'Suave'], ['outline', 'Contorno'], ['ghost', 'Fantasma']],
  header: [['standard', 'Estándar'], ['minimal', 'Minimal'], ['prominent', 'Destacado']],
  navigation: [['solid', 'Sólida'], ['soft', 'Suave'], ['glass', 'Cristal']],
  card: [['flat', 'Plana'], ['outlined', 'Con borde'], ['elevated', 'Elevada'], ['glass', 'Cristal']],
  input: [['outlined', 'Contorno'], ['soft', 'Suave'], ['filled', 'Relleno']],
  density: [['compact', 'Compacta'], ['normal', 'Normal'], ['comfortable', 'Cómoda']],
  theme: [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']],
};

function contrastRatio(hexA: string, hexB: string): number {
  const channel = (value: string) => {
    const n = parseInt(value, 16) / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const luminance = (hex: string) => {
    const clean = hex.slice(1);
    return 0.2126 * channel(clean.slice(0, 2)) + 0.7152 * channel(clean.slice(2, 4)) + 0.0722 * channel(clean.slice(4, 6));
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function updateFaviconPreview(url: string | null) {
  if (typeof document === 'undefined') return;
  const link = document.querySelector<HTMLLinkElement>('link[data-quickbite-favicon]');
  if (link && url) link.href = url;
}

export function VisualSettingsPanel() {
  const { settings, loading: themeLoading, applyLocal, refresh } = useVisualTheme();
  const [draft, setDraft] = useState<VisualSettingsDraft>(settings);
  const [tab, setTab] = useState<Tab>('branding');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'login_logo' | 'favicon' | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<VisualSettingsDraft>(settings);

  useEffect(() => {
    setDraft(settings);
    setSavedSnapshot(settings);
  }, [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSnapshot), [draft, savedSnapshot]);
  const contrast = contrastRatio(draft.text_color, draft.background_color);
  const contrastWarning = contrast < 4.5;

  const patch = <K extends keyof VisualSettingsDraft>(key: K, value: VisualSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const upload = async (kind: 'logo' | 'login_logo' | 'favicon', file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Selecciona una imagen válida.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen supera el límite de 2 MB.'); return; }
    setUploading(kind);
    try {
      const url = await uploadBrandingImage(file);
      const key = kind === 'logo' ? 'logo_url' : kind === 'login_logo' ? 'login_logo_url' : 'favicon_url';
      patch(key, url);
      if (kind === 'favicon') updateFaviconPreview(url);
      toast.success('Imagen cargada. Guarda los cambios para publicarla.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar la imagen.');
    } finally { setUploading(null); }
  };

  const handleSave = async () => {
    if (!isHexColor(draft.primary_color) || !isHexColor(draft.background_color) || !isHexColor(draft.text_color)) {
      toast.error('Revisa los colores antes de guardar.');
      return;
    }
    if (contrast < 3) { toast.error('El contraste es demasiado bajo para guardar esta combinación.'); return; }
    setSaving(true);
    try {
      const saved = await saveVisualSettings(draft);
      applyLocal(saved);
      setDraft(saved);
      setSavedSnapshot(saved);
      toast.success('Apariencia guardada correctamente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los cambios visuales.');
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!window.confirm('¿Restablecer toda la apariencia a los valores predeterminados?')) return;
    setSaving(true);
    try {
      const saved = await resetVisualSettings();
      applyLocal(saved);
      setDraft(saved);
      setSavedSnapshot(saved);
      await refresh();
      toast.success('Apariencia restablecida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo restablecer la apariencia.');
    } finally { setSaving(false); }
  };

  const select = (label: string, value: string, options: string[][], onChange: (value: string) => void) => <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Apariencia</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Personalización visual</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Administra el branding y los tokens visuales de QuickBite sin tocar código ni lógica de negocio.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${dirty ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{dirty ? '• Cambios sin guardar' : <><Check className="h-3.5 w-3.5" />Cambios guardados</>}</span><button type="button" onClick={() => setDraft(savedSnapshot)} disabled={!dirty || saving} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Cancelar</button><button type="button" onClick={() => void handleReset()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Restablecer</button><button type="button" onClick={() => void handleSave()} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-[var(--qb-primary)] px-4 py-2 text-xs font-black text-white shadow-lg disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 pt-3">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-black transition ${tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
        <div className="p-5 sm:p-7">
          {tab === 'branding' && <div className="space-y-6"><div><h2 className="text-lg font-black text-slate-900">Marca</h2><p className="mt-1 text-sm text-slate-500">Elementos visuales seguros, sin HTML ni código personalizado.</p></div><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Nombre visual</span><input value={draft.app_name} maxLength={60} onChange={(e) => patch('app_name', e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><div className="grid gap-4 md:grid-cols-3">{([['logo', 'Logo principal', draft.logo_url], ['login_logo', 'Logo de login', draft.login_logo_url], ['favicon', 'Favicon', draft.favicon_url]] as const).map(([kind, label, url]) => <div key={kind} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black text-slate-700">{label}</p><div className="mt-3 grid h-24 place-items-center rounded-xl border border-dashed border-slate-300 bg-white">{url ? <img src={url} alt={label} className="max-h-16 max-w-[75%] object-contain" /> : <ImagePlus className="h-8 w-8 text-slate-300" />}</div><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" />{uploading === kind ? 'Cargando…' : 'Seleccionar imagen'}<input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(kind, file); e.currentTarget.value = ''; }} /></label></div>)}</div><div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Las imágenes se almacenan en un bucket dedicado y público únicamente para servir branding. El panel nunca acepta HTML, CSS ni JavaScript personalizado.</p></div></div>}

          {tab === 'colors' && <div className="space-y-6"><div><h2 className="text-lg font-black text-slate-900">Paleta global</h2><p className="mt-1 text-sm text-slate-500">Los colores se convierten en variables CSS globales y pueden reutilizarse progresivamente en toda la interfaz.</p></div><div className="grid gap-4 sm:grid-cols-2">{colorFields.map(([key, label]) => <label key={key} className="rounded-2xl border border-slate-200 p-3"><span className="mb-2 block text-xs font-bold text-slate-600">{label}</span><div className="flex gap-2"><input type="color" value={draft[key] as string} onChange={(e) => patch(key, e.target.value.toUpperCase() as never)} className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0" /><input value={draft[key] as string} onChange={(e) => patch(key, e.target.value.toUpperCase() as never)} maxLength={7} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></div></label>)}</div>{contrastWarning && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">⚠ El contraste entre texto y fondo es {contrast.toFixed(2)}:1 y puede dificultar la lectura. Se bloqueará una combinación inferior a 3:1.</div>}<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Contraste actual</p><p className="mt-1 text-2xl font-black text-slate-900">{contrast.toFixed(2)}:1</p><p className="text-xs text-slate-500">Referencia WCAG para texto normal: 4.5:1.</p></div></div>}

          {tab === 'type' && <div className="space-y-6"><div><h2 className="text-lg font-black text-slate-900">Tipografía y tema</h2><p className="mt-1 text-sm text-slate-500">Solo se pueden seleccionar fuentes y modos previamente aprobados por el código.</p></div><div className="grid gap-4 md:grid-cols-2">{select('Fuente general', draft.font_family, [['Nunito','Nunito'],['Inter','Inter'],['Poppins','Poppins'],['Roboto','Roboto'],['system-ui','System UI']], (v) => patch('font_family', v as VisualSettingsDraft['font_family']))}{select('Fuente de títulos', draft.heading_font, [['Nunito','Nunito'],['Inter','Inter'],['Poppins','Poppins'],['Roboto','Roboto'],['system-ui','System UI']], (v) => patch('heading_font', v as VisualSettingsDraft['heading_font']))}{select('Tema', draft.theme_mode, selectOptions.theme, (v) => patch('theme_mode', v as VisualSettingsDraft['theme_mode']))}{select('Densidad', draft.density, selectOptions.density, (v) => patch('density', v as VisualSettingsDraft['density']))}</div><div className="rounded-2xl border border-slate-200 p-5"><p className="text-2xl font-black text-slate-900" style={{ fontFamily: `"${draft.heading_font}", system-ui` }}>QuickBite</p><p className="mt-1 text-sm text-slate-500" style={{ fontFamily: `"${draft.font_family}", system-ui` }}>Ejemplo de tipografía aplicada a contenido.</p></div></div>}

          {tab === 'components' && <div className="space-y-6"><div><h2 className="text-lg font-black text-slate-900">Componentes</h2><p className="mt-1 text-sm text-slate-500">Presets seguros para formas, sombras y densidad. No se permite CSS libre.</p></div><div className="grid gap-4 md:grid-cols-2">{select('Radio general', draft.border_radius, selectOptions.radius, (v) => patch('border_radius', v as VisualSettingsDraft['border_radius']))}{select('Radio de cards', draft.card_radius, selectOptions.radius, (v) => patch('card_radius', v as VisualSettingsDraft['card_radius']))}{select('Radio de botones', draft.button_radius, selectOptions.radius, (v) => patch('button_radius', v as VisualSettingsDraft['button_radius']))}{select('Sombras', draft.shadow_style, selectOptions.shadow, (v) => patch('shadow_style', v as VisualSettingsDraft['shadow_style']))}{select('Estilo de botones', draft.button_style, selectOptions.button, (v) => patch('button_style', v as VisualSettingsDraft['button_style']))}{select('Header', draft.header_style, selectOptions.header, (v) => patch('header_style', v as VisualSettingsDraft['header_style']))}{select('Navegación', draft.navigation_style, selectOptions.navigation, (v) => patch('navigation_style', v as VisualSettingsDraft['navigation_style']))}{select('Cards', draft.card_style, selectOptions.card, (v) => patch('card_style', v as VisualSettingsDraft['card_style']))}{select('Inputs', draft.input_style, selectOptions.input, (v) => patch('input_style', v as VisualSettingsDraft['input_style']))}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-3"><button type="button" style={{ background: draft.primary_color, borderRadius: 'var(--qb-button-radius)', boxShadow: 'var(--qb-shadow)' } as CSSProperties} className="px-4 py-2 text-sm font-black text-white">Botón</button><div style={{ borderRadius: 'var(--qb-card-radius)', boxShadow: 'var(--qb-shadow)' }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800">Card de ejemplo</div></div></div></div>}
        </div>
      </div>
      <VisualPreview settings={draft} />
    </div>

    {themeLoading && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xl">Cargando configuración visual…</div>}
  </div>;
}
