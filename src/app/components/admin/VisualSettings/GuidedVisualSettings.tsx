import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Eye, Monitor, Palette, Sparkles, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualTheme } from '../../../contexts/VisualThemeProvider';
import { saveVisualSettings } from '../../../../services/visualSettingsService';
import { resolveVisualSettings, type VisualInterfaceScope, type VisualSettingsDraft } from '../../../../types/visualSettings';

const scopes: Array<[VisualInterfaceScope, string, string, string]> = [
  ['login_student', 'Inicio de sesión del estudiante', 'La pantalla donde el estudiante escribe su correo y contraseña.', 'Acceso del estudiante'],
  ['login_parent', 'Inicio de sesión de padres', 'La pantalla de acceso para padres y acudientes.', 'Acceso de padres'],
  ['login_admin', 'Inicio de sesión del administrador', 'La pantalla exclusiva de acceso administrativo.', 'Acceso administrativo'],
  ['student', 'Aplicación del estudiante', 'Menú, productos, pedidos, favoritos, saldo y cuenta.', 'Experiencia del estudiante'],
  ['parent', 'Aplicación de padres', 'Familia, saldo, pedidos y seguimiento.', 'Experiencia de padres'],
  ['admin', 'Panel administrativo', 'Dashboard, pedidos, menú, usuarios, pagos y herramientas.', 'Experiencia administrativa'],
];

const palettes = [
  { id: 'original', name: 'QuickBite original', description: 'La combinación base de QuickBite: verde, azul y turquesa.', primary: '#16A36A', secondary: '#2563EB', accent: '#14B8A6', background: '#F5F8F7', surface: '#FFFFFF' },
  { id: 'blue', name: 'Azul QuickBite', description: 'Más azul institucional, con verde y turquesa como apoyo.', primary: '#1747B8', secondary: '#2563EB', accent: '#14B8A6', background: '#F4F8FF', surface: '#FFFFFF' },
  { id: 'green', name: 'Verde cafetería', description: 'Más protagonismo del verde, manteniendo el azul de QuickBite.', primary: '#16A36A', secondary: '#1747B8', accent: '#14B8A6', background: '#F3FAF6', surface: '#FFFFFF' },
  { id: 'balanced', name: 'Azul + verde', description: 'Equilibrio entre confianza, alimentación y tecnología.', primary: '#2563EB', secondary: '#16A36A', accent: '#14B8A6', background: '#F5F9F8', surface: '#FFFFFF' },
];

const styles = [
  { id: 'minimal', name: 'Limpio', description: 'Ordenado, ligero y con poca profundidad visual.', card: 'flat' as const, button: 'solid' as const, shadow: 'subtle' as const, radius: 'medium' as const, density: 'comfortable' as const },
  { id: 'friendly', name: 'Amigable', description: 'Redondeado, cercano y pensado para una app escolar.', card: 'elevated' as const, button: 'solid' as const, shadow: 'normal' as const, radius: 'large' as const, density: 'normal' as const },
  { id: 'professional', name: 'Profesional', description: 'Más sobrio y estructurado para una experiencia institucional.', card: 'outlined' as const, button: 'solid' as const, shadow: 'subtle' as const, radius: 'medium' as const, density: 'normal' as const },
];

function patchFromGuide(current: VisualSettingsDraft, palette: typeof palettes[number], style: typeof styles[number]): VisualSettingsDraft {
  return {
    ...current,
    primary_color: palette.primary,
    secondary_color: palette.secondary,
    accent_color: palette.accent,
    background_color: palette.background,
    surface_color: palette.surface,
    text_color: current.text_color || '#0F172A',
    muted_text_color: current.muted_text_color || '#64748B',
    border_color: current.border_color || '#E2E8F0',
    success_color: current.success_color || '#16A36A',
    warning_color: current.warning_color || '#D97706',
    danger_color: current.danger_color || '#DC2626',
    card_style: style.card,
    button_style: style.button,
    shadow_style: style.shadow,
    border_radius: style.radius,
    card_radius: style.radius,
    button_radius: style.radius,
    density: style.density,
    theme_mode: 'light',
    header_style: style.id === 'professional' ? 'minimal' : 'standard',
    navigation_style: style.id === 'professional' ? 'soft' : 'solid',
    input_style: style.id === 'minimal' ? 'soft' : 'outlined',
  };
}

function buildPreviewPath(scope: VisualInterfaceScope): string {
  const selected = scopes.find(([id]) => id === scope);
  const base = scope.startsWith('login_') ? `/login?preview_role=${scope.replace('login_', '')}` : selected?.[3] === 'Experiencia administrativa' ? '/admin' : selected?.[3] === 'Experiencia de padres' ? '/parent/family' : '/menu';
  return `${base}${base.includes('?') ? '&' : '?'}visual_preview=1&visual_preview_scope=${scope}`;
}

export function GuidedVisualSettings({ onOpenAdvanced }: { onOpenAdvanced: () => void }) {
  const { settings, applyLocal } = useVisualTheme();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<VisualInterfaceScope>('student');
  const [paletteId, setPaletteId] = useState('original');
  const [styleId, setStyleId] = useState('friendly');
  const [draft, setDraft] = useState<VisualSettingsDraft>(() => resolveVisualSettings(settings, 'student'));
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const palette = useMemo(() => palettes.find((item) => item.id === paletteId) ?? palettes[0], [paletteId]);
  const style = useMemo(() => styles.find((item) => item.id === styleId) ?? styles[1], [styleId]);
  const generated = useMemo(() => patchFromGuide(draft, palette, style), [draft, palette, style]);
  const previewPath = useMemo(() => buildPreviewPath(scope), [scope]);
  const selectedScope = useMemo(() => scopes.find(([id]) => id === scope), [scope]);

  useEffect(() => {
    setDraft(resolveVisualSettings(settings, scope));
  }, [settings, scope]);

  const postPreview = () => {
    const frame = iframeRef.current;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: 'quickbite-visual-preview', settings: generated }, window.location.origin);
    }
  };

  useEffect(() => {
    if (step >= 3) postPreview();
  }, [generated, step, previewPath]);

  const finish = async () => {
    setSaving(true);
    try {
      const overrides = { ...(settings.interface_overrides ?? {}) };
      const { interface_overrides: _existing, ...clean } = generated;
      overrides[scope] = clean;
      const result = await saveVisualSettings({ ...settings, interface_overrides: overrides });
      applyLocal(result);
      setDraft(resolveVisualSettings(result, scope));
      setStep(5);
      toast.success(`Personalización guardada para ${selectedScope?.[1] ?? 'la interfaz seleccionada'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la personalización.');
    } finally {
      setSaving(false);
    }
  };

  const labels = ['Interfaz', 'Estilo', 'Colores', 'Revisión', 'Listo'];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-emerald-600 px-6 py-7 text-white sm:px-8">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Sparkles className="size-6" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-white/70">Personalización guiada</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Vamos a personalizar tu QuickBite</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/90">Te guiamos con decisiones sencillas. En la revisión verás la pantalla real que seleccionaste, no una maqueta genérica.</p>
            </div>
          </div>
          <div className="mt-7 flex items-center gap-2 overflow-x-auto pb-1">
            {labels.map((label, index) => <div key={label} className="flex shrink-0 items-center gap-2"><div className={`grid size-8 place-items-center rounded-full text-xs font-black ${step >= index ? 'bg-white text-blue-700' : 'bg-white/15 text-white'}`}>{step > index ? <Check className="size-4" /> : index + 1}</div><span className={`text-xs font-bold ${step >= index ? 'text-white' : 'text-white/55'}`}>{label}</span>{index < labels.length - 1 && <div className={`h-px w-8 ${step > index ? 'bg-white/60' : 'bg-white/20'}`} />}</div>)}
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {step === 0 && <div className="space-y-5"><div><h3 className="text-xl font-black text-slate-900">¿Qué parte de QuickBite quieres personalizar?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Selecciona una experiencia. La vista previa y los cambios se limitarán a esa parte.</p></div><div className="grid gap-3 md:grid-cols-2">{scopes.map(([id, title, description, badge]) => <button key={id} type="button" onClick={() => setScope(id)} className={`rounded-2xl border p-4 text-left transition ${scope === id ? 'border-blue-400 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'}`}><div className="flex items-center justify-between gap-3"><p className="font-black text-slate-900">{title}</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{badge}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{description}</p></button>)}</div></div>}

          {step === 1 && <div className="space-y-5"><div className="flex items-start gap-3"><WandSparkles className="mt-0.5 size-5 text-blue-600" /><div><h3 className="text-xl font-black text-slate-900">¿Qué estilo quieres transmitir?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Esto cambia la forma de tarjetas, botones, espacios y profundidad visual sin cambiar cómo funciona la app.</p></div></div><div className="grid gap-3 md:grid-cols-3">{styles.map((item) => <button key={item.id} type="button" onClick={() => setStyleId(item.id)} className={`rounded-2xl border p-5 text-left transition ${styleId === item.id ? 'border-blue-400 bg-blue-50 shadow-md' : 'border-slate-200 hover:border-blue-200'}`}><div className="mb-4 flex items-center gap-2"><span className={`size-4 rounded-full ${item.id === 'minimal' ? 'bg-slate-400' : item.id === 'friendly' ? 'bg-emerald-500' : 'bg-blue-700'}`} /><span className="font-black text-slate-900">{item.name}</span></div><p className="text-xs leading-5 text-slate-600">{item.description}</p><div className="mt-5 flex items-center gap-2"><span className="rounded-xl bg-white px-3 py-2 text-[11px] font-black shadow-sm">Botón</span><span className="h-2 w-2 rounded-full bg-slate-300" /><span className="rounded-2xl bg-white px-3 py-2 text-[11px] font-black shadow-sm">Tarjeta</span></div></button>)}</div></div>}

          {step === 2 && <div className="space-y-5"><div className="flex items-start gap-3"><Palette className="mt-0.5 size-5 text-emerald-600" /><div><h3 className="text-xl font-black text-slate-900">Elige una paleta de QuickBite</h3><p className="mt-1 text-sm leading-6 text-slate-500">Todas las opciones usan los colores y la personalidad visual de QuickBite. No verás combinaciones de morado, naranja o colores ajenos a la app.</p></div></div><div className="grid gap-3 md:grid-cols-2">{palettes.map((item) => <button key={item.id} type="button" onClick={() => setPaletteId(item.id)} className={`rounded-2xl border p-4 text-left transition ${paletteId === item.id ? 'border-emerald-400 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-emerald-200'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p></div><div className="flex shrink-0 gap-1.5">{[item.primary, item.secondary, item.accent].map((color) => <span key={color} className="size-8 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}</div></div><div className="mt-3 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} /></button>)}</div><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950"><b>Paleta recomendada:</b> QuickBite original. Es la opción más fiel a la identidad actual de la app.</div></div>}

          {step === 3 && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><Eye className="mt-0.5 size-5 text-blue-600" /><div><h3 className="text-xl font-black text-slate-900">Revisa la interfaz real</h3><p className="mt-1 text-sm leading-6 text-slate-500">Esta es la pantalla real que seleccionaste: <b>{selectedScope?.[1]}</b>. La sesión es de vista previa y no usa tu cuenta.</p></div></div><div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600 sm:flex"><Monitor className="size-3.5" /> Aplicación real</div></div><div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 p-3 shadow-sm"><div className="overflow-hidden rounded-2xl bg-white shadow-xl" style={{ height: 'min(68vh, 720px)' }}><iframe ref={iframeRef} title={`Vista previa de ${selectedScope?.[1] ?? 'QuickBite'}`} src={previewPath} onLoad={postPreview} className="h-full w-full border-0" /></div></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-5 text-emerald-950"><b>Antes de continuar:</b> recorre la pantalla dentro de la vista previa. Los botones no realizan operaciones reales.</div></div>}

          {step === 5 && <div className="space-y-6"><div className="py-4 text-center"><div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-8" /></div><h3 className="mt-5 text-2xl font-black text-slate-900">¡Personalización lista!</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Se guardó únicamente para <b>{selectedScope?.[1]}</b>. La lógica de QuickBite permanece igual.</p></div><div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 p-3"><div className="overflow-hidden rounded-2xl bg-white shadow-xl" style={{ height: 'min(68vh, 720px)' }}><iframe ref={iframeRef} title={`Vista final de ${selectedScope?.[1] ?? 'QuickBite'}`} src={previewPath} onLoad={postPreview} className="h-full w-full border-0" /></div></div><div className="flex flex-col gap-3 sm:flex-row sm:justify-center"><button type="button" onClick={() => setStep(0)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><ChevronLeft className="size-4" /> Personalizar otra interfaz</button><button type="button" onClick={onOpenAdvanced} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-md hover:bg-blue-700">Abrir personalización avanzada <WandSparkles className="size-4" /></button></div></div>}

          {(step >= 0 && step <= 3) && <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><button type="button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40"><ChevronLeft className="size-4" /> Atrás</button><div className="text-center text-xs text-slate-400">{step + 1} de 4</div>{step < 3 ? <button type="button" disabled={saving} onClick={() => setStep((current) => current + 1)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md hover:bg-blue-700">Continuar <ChevronRight className="size-4" /></button> : <button type="button" disabled={saving} onClick={() => void finish()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-md hover:bg-emerald-700">{saving ? 'Guardando…' : 'Aplicar personalización'} <Check className="size-4" /></button>}</div>}
        </div>
      </div>
    </div>
  );
}
