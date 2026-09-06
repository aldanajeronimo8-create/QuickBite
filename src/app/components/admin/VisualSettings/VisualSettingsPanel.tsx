import { useEffect, useMemo, useState } from 'react';
import { Check, History, RotateCcw, Save, Undo2, Redo2, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualTheme } from '../../../contexts/VisualThemeProvider';
import { resetVisualSettings, saveVisualSettings } from '../../../../services/visualSettingsService';
import { isHexColor, resolveVisualSettings, sanitizeVisualSettings, type VisualInterfaceScope, type VisualSettingsDraft } from '../../../../types/visualSettings';
import { PreviewStudio } from './PreviewStudio';

type ScopeInfo = { id: VisualInterfaceScope; label: string; path: string; description: string };
const SCOPES: ScopeInfo[] = [
  { id: 'login_student', label: 'Login · Estudiante', path: '/login', description: 'Inicio de sesión del estudiante.' },
  { id: 'login_parent', label: 'Login · Padre', path: '/login', description: 'Inicio de sesión del padre de familia.' },
  { id: 'login_admin', label: 'Login · Administrador', path: '/login', description: 'Inicio de sesión administrativa.' },
  { id: 'admin', label: 'Panel · Administrador', path: '/admin', description: 'Toda la experiencia administrativa.' },
  { id: 'student', label: 'Panel · Estudiante', path: '/menu', description: 'Toda la experiencia del estudiante.' },
  { id: 'parent', label: 'Panel · Padre', path: '/parent/family', description: 'Toda la experiencia del padre de familia.' },
];

const EDITABLE_KEYS = [
  'app_name','logo_url','favicon_url','login_logo_url','primary_color','secondary_color','accent_color','background_color',
  'surface_color','text_color','muted_text_color','border_color','success_color','warning_color','danger_color','font_family',
  'heading_font','border_radius','card_radius','button_radius','shadow_style','button_style','header_style','navigation_style',
  'card_style','input_style','density','theme_mode',
] as const;

function pickEditable(draft: VisualSettingsDraft): Partial<VisualSettingsDraft> {
  const result: Partial<VisualSettingsDraft> = {};
  for (const key of EDITABLE_KEYS) result[key] = draft[key] as never;
  result.element_overrides = draft.element_overrides ?? {};
  return result;
}

function contrastRatio(a: string, b: string) {
  const channel = (value: string) => { const n = Number.parseInt(value, 16) / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); };
  const luminance = (hex: string) => { const c = hex.slice(1); return 0.2126 * channel(c.slice(0, 2)) + 0.7152 * channel(c.slice(2, 4)) + 0.0722 * channel(c.slice(4, 6)); };
  const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function VisualSettingsPanel() {
  const { settings, loading, applyLocal, refresh } = useVisualTheme();
  const [scope, setScope] = useState<VisualInterfaceScope>('login_student');
  const [draft, setDraft] = useState<VisualSettingsDraft>(() => resolveVisualSettings(settings, 'login_student'));
  const [saved, setSaved] = useState<VisualSettingsDraft>(() => resolveVisualSettings(settings, 'login_student'));
  const [history, setHistory] = useState<VisualSettingsDraft[]>([]);
  const [future, setFuture] = useState<VisualSettingsDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [compare, setCompare] = useState(false);

  const scopeInfo = useMemo(() => SCOPES.find((item) => item.id === scope) ?? SCOPES[0], [scope]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const contrast = useMemo(() => {
    if (!isHexColor(draft.text_color) || !isHexColor(draft.background_color)) return 0;
    return contrastRatio(draft.text_color, draft.background_color);
  }, [draft.background_color, draft.text_color]);

  useEffect(() => {
    const next = resolveVisualSettings(settings, scope);
    setDraft(next);
    setSaved(next);
    setHistory([]);
    setFuture([]);
  }, [scope, settings]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-element-edit' && event.data?.type !== 'quickbite-visual-element-reset') return;
      if (event.data?.scope !== scope || !event.data?.settings) return;
      const next = sanitizeVisualSettings(event.data.settings as Partial<VisualSettingsDraft>);
      setDraft((current) => {
        if (JSON.stringify(current) === JSON.stringify(next)) return current;
        setHistory((items) => [...items.slice(-29), current]);
        setFuture([]);
        return next;
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [scope]);

  const selectScope = (nextScope: VisualInterfaceScope) => setScope(nextScope);

  const replaceDraft = (next: VisualSettingsDraft, addHistory = true) => {
    setDraft((current) => {
      if (JSON.stringify(current) === JSON.stringify(next)) return current;
      if (addHistory) setHistory((items) => [...items.slice(-29), current]);
      setFuture([]);
      return next;
    });
  };

  const undo = () => {
    setHistory((items) => {
      const previous = items[items.length - 1];
      if (!previous) return items;
      setFuture((futureItems) => [...futureItems, draft]);
      setDraft(previous);
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      const next = items[items.length - 1];
      if (!next) return items;
      setHistory((historyItems) => [...historyItems, draft]);
      setDraft(next);
      return items.slice(0, -1);
    });
  };

  const save = async () => {
    if (!isHexColor(draft.primary_color) || !isHexColor(draft.background_color) || !isHexColor(draft.text_color)) {
      toast.error('Revisa los colores antes de guardar.'); return;
    }
    if (contrast < 3) { toast.error('El contraste mínimo permitido es 3:1.'); return; }
    setSaving(true);
    try {
      const overrides = { ...(settings.interface_overrides ?? {}) };
      overrides[scope] = pickEditable(draft) as never;
      const next = { ...settings, interface_overrides: overrides, element_overrides: settings.element_overrides ?? {} };
      const result = await saveVisualSettings(next);
      applyLocal(result);
      const effective = resolveVisualSettings(result, scope);
      setDraft(effective); setSaved(effective); setHistory([]); setFuture([]);
      toast.success(`Cambios guardados para ${scopeInfo.label}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.');
    } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm('¿Restablecer toda la personalización visual?')) return;
    setSaving(true);
    try {
      const result = await resetVisualSettings();
      applyLocal(result);
      const effective = resolveVisualSettings(result, scope);
      setDraft(effective); setSaved(effective); setHistory([]); setFuture([]); await refresh();
      toast.success('Apariencia restablecida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo restablecer.');
    } finally { setSaving(false); }
  };

  const loginRole = scope.startsWith('login_') ? scope.replace('login_', '') : null;
  const basePreviewPath = loginRole ? `/login?preview_role=${loginRole}` : scopeInfo.path;
  const previewPath = `${basePreviewPath}${basePreviewPath.includes('?') ? '&' : '?'}visual_preview=1&visual_preview_scope=${scope}`;

  const copyPreview = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${previewPath}`); toast.success('Ruta de preview copiada.'); }
    catch { toast.error('No se pudo copiar la ruta.'); }
  };

  const patch = <K extends keyof VisualSettingsDraft>(key: K, value: VisualSettingsDraft[K]) => replaceDraft({ ...draft, [key]: value });

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500"><WandSparkles className="h-4 w-4" /> Personalización</div>
            <h1 className="mt-1 truncate text-2xl font-black text-slate-950">{scopeInfo.label}</h1>
            <p className="mt-1 text-sm text-slate-500">{scopeInfo.description} Elige un elemento y haz triple clic para editarlo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="block min-w-[250px]">
              <span className="sr-only">Interfaz</span>
              <select value={scope} onChange={(event) => selectScope(event.target.value as VisualInterfaceScope)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100">
                {SCOPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <span className={`rounded-full px-3 py-2 text-xs font-black ${dirty ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{dirty ? 'Borrador modificado' : 'Guardado'}</span>
            <button type="button" disabled={!history.length} onClick={undo} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-30" aria-label="Deshacer"><Undo2 className="h-4 w-4" /></button>
            <button type="button" disabled={!future.length} onClick={redo} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-30" aria-label="Rehacer"><Redo2 className="h-4 w-4" /></button>
            <button type="button" disabled={!dirty || saving} onClick={() => setDraft(saved)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black disabled:opacity-30">Descartar</button>
            <button type="button" disabled={!dirty || saving || loading} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--qb-primary)] px-4 py-2.5 text-xs font-black text-white shadow-sm disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </section>

      <PreviewStudio
        scope={scope}
        previewPath={previewPath}
        draft={draft}
        saved={saved}
        compare={compare}
        onCompareChange={setCompare}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        onCopy={copyPreview}
      />

      <details className="group rounded-[2rem] border border-slate-200 bg-white shadow-sm" open={false}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div><p className="text-sm font-black text-slate-900">Ajustes base de la interfaz</p><p className="text-xs text-slate-500">Marca, paleta, tipografía y densidad. La edición de elementos se hace directamente en la preview.</p></div>
          <span className="text-xs font-black text-slate-400 group-open:hidden">Mostrar</span><span className="hidden text-xs font-black text-slate-400 group-open:inline">Ocultar</span>
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-5 md:grid-cols-2 xl:grid-cols-4">
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Nombre</span><input value={draft.app_name} onChange={(event) => patch('app_name', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          {([['primary_color','Primario'],['background_color','Fondo'],['surface_color','Superficie'],['text_color','Texto']] as const).map(([key,label]) => <label key={key}><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span><div className="flex gap-2"><input type="color" value={draft[key]} onChange={(event) => patch(key, event.target.value.toUpperCase() as never)} className="size-10 cursor-pointer rounded-lg border p-1" /><input value={draft[key]} onChange={(event) => patch(key, event.target.value.toUpperCase() as never)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 font-mono text-xs" /></div></label>)}
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Fuente</span><select value={draft.font_family} onChange={(event) => patch('font_family', event.target.value as never)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option>Nunito</option><option>Inter</option><option>Poppins</option><option>Roboto</option><option>system-ui</option></select></label>
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Fuente de títulos</span><select value={draft.heading_font} onChange={(event) => patch('heading_font', event.target.value as never)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option>Nunito</option><option>Inter</option><option>Poppins</option><option>Roboto</option><option>system-ui</option></select></label>
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Radio</span><select value={draft.border_radius} onChange={(event) => patch('border_radius', event.target.value as never)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="sharp">Sin redondeo</option><option value="small">Pequeño</option><option value="medium">Medio</option><option value="large">Grande</option><option value="rounded">Píldora</option></select></label>
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Tema</span><select value={draft.theme_mode} onChange={(event) => patch('theme_mode', event.target.value as never)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Sistema</option></select></label>
          <div className="flex items-end"><div className={`w-full rounded-xl p-3 text-xs font-bold ${contrast < 3 ? 'bg-red-50 text-red-700' : contrast < 4.5 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>Contraste: {contrast ? `${contrast.toFixed(2)}:1` : '—'}</div></div>
        </div>
      </details>

      <section className="flex flex-col gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><p className="text-sm font-black text-slate-900">Restablecer personalización</p><p className="text-xs text-slate-500">Recupera la configuración visual global predeterminada.</p></div>
        <button type="button" disabled={saving} onClick={() => void reset()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700"><RotateCcw className="h-3.5 w-3.5" />Restablecer</button>
      </section>
    </div>
  );
}
