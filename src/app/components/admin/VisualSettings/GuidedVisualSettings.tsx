import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Palette, Sparkles, Type, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualTheme } from '../../../contexts/VisualThemeProvider';
import { saveVisualSettings } from '../../../../services/visualSettingsService';
import { resolveVisualSettings, type VisualInterfaceScope, type VisualSettingsDraft } from '../../../../types/visualSettings';

const scopes: Array<[VisualInterfaceScope, string, string]> = [
  ['login_student', 'Inicio de sesión del estudiante', 'La primera pantalla que ve un estudiante.'],
  ['login_parent', 'Inicio de sesión de padres', 'La entrada para padres y acudientes.'],
  ['login_admin', 'Inicio de sesión del administrador', 'La entrada exclusiva del equipo administrativo.'],
  ['student', 'Aplicación del estudiante', 'Menú, productos, pedidos y experiencia de compra.'],
  ['parent', 'Aplicación de padres', 'Familia, saldo, pedidos y seguimiento.'],
  ['admin', 'Panel administrativo', 'Dashboard, gestión y herramientas internas.'],
];

const palettes = [
  { id: 'school', name: 'Institucional', description: 'Profesional, claro y fácil de reconocer.', primary: '#1747B8', secondary: '#2563EB', accent: '#14B8A6', background: '#F5F8F7', surface: '#FFFFFF' },
  { id: 'fresh', name: 'Fresco', description: 'Natural, amigable y relacionado con alimentación.', primary: '#16A36A', secondary: '#0F766E', accent: '#F59E0B', background: '#F4FBF7', surface: '#FFFFFF' },
  { id: 'modern', name: 'Moderno', description: 'Más tecnológico y con contrastes marcados.', primary: '#4F46E5', secondary: '#2563EB', accent: '#06B6D4', background: '#F7F8FC', surface: '#FFFFFF' },
  { id: 'warm', name: 'Cálido', description: 'Cercano y acogedor para una experiencia más humana.', primary: '#D97706', secondary: '#B45309', accent: '#EA580C', background: '#FFF9F2', surface: '#FFFFFF' },
];

const styles = [
  { id: 'minimal', name: 'Limpio', description: 'Pocas sombras, mucho espacio y una apariencia ordenada.', card: 'flat' as const, button: 'solid' as const, shadow: 'subtle' as const, radius: 'medium' as const, density: 'comfortable' as const },
  { id: 'friendly', name: 'Amigable', description: 'Más redondeado, colorido y cercano.', card: 'elevated' as const, button: 'solid' as const, shadow: 'normal' as const, radius: 'large' as const, density: 'normal' as const },
  { id: 'premium', name: 'Elegante', description: 'Más contraste, profundidad y presencia visual.', card: 'elevated' as const, button: 'outline' as const, shadow: 'elevated' as const, radius: 'medium' as const, density: 'normal' as const },
];

function patchFromGuide(current: VisualSettingsDraft, palette: typeof palettes[number], style: typeof styles[number]): VisualSettingsDraft {
  return {
    ...current,
    primary_color: palette.primary,
    secondary_color: palette.secondary,
    accent_color: palette.accent,
    background_color: palette.background,
    surface_color: palette.surface,
    text_color: '#0F172A',
    muted_text_color: '#64748B',
    border_color: '#E2E8F0',
    success_color: '#16A36A',
    warning_color: '#D97706',
    danger_color: '#DC2626',
    card_style: style.card,
    button_style: style.button,
    shadow_style: style.shadow,
    border_radius: style.radius,
    card_radius: style.radius,
    button_radius: style.radius,
    density: style.density,
    theme_mode: 'light',
    header_style: style.id === 'premium' ? 'prominent' : 'standard',
    navigation_style: style.id === 'premium' ? 'glass' : 'solid',
    input_style: style.id === 'minimal' ? 'soft' : 'outlined',
  };
}

export function GuidedVisualSettings({ onOpenAdvanced }: { onOpenAdvanced: () => void }) {
  const { settings, applyLocal } = useVisualTheme();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<VisualInterfaceScope>('student');
  const [paletteId, setPaletteId] = useState('school');
  const [styleId, setStyleId] = useState('friendly');
  const [draft, setDraft] = useState<VisualSettingsDraft>(() => resolveVisualSettings(settings, 'student'));
  const [saving, setSaving] = useState(false);

  const palette = useMemo(() => palettes.find((item) => item.id === paletteId) ?? palettes[0], [paletteId]);
  const style = useMemo(() => styles.find((item) => item.id === styleId) ?? styles[1], [styleId]);

  useEffect(() => {
    setDraft(resolveVisualSettings(settings, scope));
  }, [settings, scope]);

  const generated = useMemo(() => patchFromGuide(draft, palette, style), [draft, palette, style]);

  const finish = async () => {
    setSaving(true);
    try {
      const overrides = { ...(settings.interface_overrides ?? {}) };
      const { interface_overrides: _existing, ...clean } = generated;
      overrides[scope] = clean;
      const result = await saveVisualSettings({ ...settings, interface_overrides: overrides });
      applyLocal(result);
      setDraft(resolveVisualSettings(result, scope));
      toast.success('Personalización guardada para la interfaz seleccionada.');
      setStep(5);
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
        <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-emerald-600 px-6 py-7 text-white sm:px-8">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Sparkles className="size-6" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-white/70">Personalización guiada</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Vamos a diseñar tu QuickBite</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">No necesitas saber de diseño. Te hacemos preguntas sencillas, te explicamos cada decisión y podrás ver el resultado antes de publicarlo.</p>
            </div>
          </div>
          <div className="mt-7 flex items-center gap-2 overflow-x-auto pb-1">
            {labels.map((label, index) => <div key={label} className="flex shrink-0 items-center gap-2"><div className={`grid size-8 place-items-center rounded-full text-xs font-black ${step >= index ? 'bg-white text-blue-700' : 'bg-white/15 text-white'}`}>{step > index ? <Check className="size-4" /> : index + 1}</div><span className={`text-xs font-bold ${step >= index ? 'text-white' : 'text-white/55'}`}>{label}</span>{index < labels.length - 1 && <div className={`h-px w-8 ${step > index ? 'bg-white/60' : 'bg-white/20'}`} />}</div>)}
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {step === 0 && <div className="space-y-5"><div><h3 className="text-xl font-black text-slate-900">¿Qué parte de QuickBite quieres personalizar?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Cada experiencia puede tener su propio estilo. Los procesos de pedidos, usuarios y pagos no se modifican.</p></div><div className="grid gap-3 md:grid-cols-2">{scopes.map(([id, title, description]) => <button key={id} type="button" onClick={() => setScope(id)} className={`rounded-2xl border p-4 text-left transition ${scope === id ? 'border-blue-400 bg-blue-50 shadow-md' : 'border-slate-200 hover:border-blue-200 hover:shadow-sm'}`}><p className="font-black text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{description}</p></button>)}</div></div>}

          {step === 1 && <div className="space-y-5"><div className="flex items-start gap-3"><WandSparkles className="mt-0.5 size-5 text-indigo-600" /><div><h3 className="text-xl font-black text-slate-900">¿Qué estilo te gustaría transmitir?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Esto controla la sensación general de tarjetas, botones, espacios y profundidad visual.</p></div></div><div className="grid gap-3 md:grid-cols-3">{styles.map((item) => <button key={item.id} type="button" onClick={() => setStyleId(item.id)} className={`rounded-2xl border p-5 text-left ${styleId === item.id ? 'border-indigo-400 bg-indigo-50 shadow-md' : 'border-slate-200 hover:border-indigo-200'}`}><div className="mb-4 flex items-center gap-2"><span className={`size-4 rounded-full ${item.id === 'minimal' ? 'bg-slate-300' : item.id === 'friendly' ? 'bg-emerald-500' : 'bg-indigo-600'}`} /><span className="font-black text-slate-900">{item.name}</span></div><p className="text-xs leading-5 text-slate-600">{item.description}</p><div className="mt-5 flex items-center gap-2"><span className="rounded-xl bg-white px-3 py-2 text-[11px] font-black shadow-sm">Botón</span><span className="h-2 w-2 rounded-full bg-slate-300" /><span className="rounded-2xl bg-white px-3 py-2 text-[11px] font-black shadow-sm">Tarjeta</span></div></button>)}</div></div>}

          {step === 2 && <div className="space-y-5"><div className="flex items-start gap-3"><Palette className="mt-0.5 size-5 text-emerald-600" /><div><h3 className="text-xl font-black text-slate-900">Elige la personalidad de tus colores</h3><p className="mt-1 text-sm leading-6 text-slate-500">No hace falta conocer códigos de color. Cada opción trae una paleta equilibrada y lista para usar.</p></div></div><div className="grid gap-3 md:grid-cols-2">{palettes.map((item) => <button key={item.id} type="button" onClick={() => setPaletteId(item.id)} className={`rounded-2xl border p-4 text-left ${paletteId === item.id ? 'border-emerald-400 bg-emerald-50 shadow-md' : 'border-slate-200 hover:border-emerald-200'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p></div><div className="flex shrink-0 gap-1.5">{[item.primary, item.secondary, item.accent].map((color) => <span key={color} className="size-7 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}</div></div></button>)}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700"><b>¿Quieres usar los colores reales de tu colegio?</b><br />Puedes hacerlo desde Personalización avanzada y colocar exactamente los colores institucionales.</div></div>}

          {step === 3 && <div className="space-y-5"><div className="flex items-start gap-3"><CircleHelp className="mt-0.5 size-5 text-blue-600" /><div><h3 className="text-xl font-black text-slate-900">Revisa antes de aplicar</h3><p className="mt-1 text-sm leading-6 text-slate-500">Aquí tienes un resumen sencillo de las decisiones que tomamos contigo.</p></div></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Interfaz</p><p className="mt-2 font-black text-slate-900">{scopes.find(([id]) => id === scope)?.[1]}</p><p className="mt-1 text-xs text-slate-500">Solo afecta esta experiencia.</p></div><div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Estilo</p><p className="mt-2 font-black text-slate-900">{style.name}</p><p className="mt-1 text-xs text-slate-500">{style.description}</p></div><div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Paleta</p><div className="mt-2 flex gap-1.5">{[palette.primary, palette.secondary, palette.accent].map((color) => <span key={color} className="size-7 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}</div><p className="mt-2 text-xs text-slate-500">{palette.name}</p></div></div><div className="overflow-hidden rounded-2xl border border-slate-200" style={{ background: generated.background_color, fontFamily: 'var(--qb-font-family)' }}><div className="border-b border-black/5 p-4" style={{ background: generated.primary_color, color: '#fff' }}><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-white/20 text-xs font-black">QB</div><div><p className="text-sm font-black">{generated.app_name}</p><p className="text-[11px] opacity-80">Vista de ejemplo</p></div></div></div><div className="grid gap-3 p-4 md:grid-cols-2"><div className="rounded-2xl border p-4 shadow-sm" style={{ background: generated.surface_color, borderColor: generated.border_color, borderRadius: '1rem' }}><p className="text-xs font-black" style={{ color: generated.muted_text_color }}>Menú de hoy</p><p className="mt-1 text-lg font-black" style={{ color: generated.text_color }}>Tu comida, más fácil</p><button type="button" className="mt-4 rounded-xl px-4 py-2 text-xs font-black text-white" style={{ background: generated.primary_color }}>Comprar ahora</button></div><div className="rounded-2xl border p-4" style={{ background: generated.surface_color, borderColor: generated.border_color, borderRadius: '1rem' }}><p className="text-xs font-black" style={{ color: generated.muted_text_color }}>Estado del pedido</p><p className="mt-2 font-black" style={{ color: generated.success_color }}>Listo para recoger</p></div></div></div></div>}

          {step === 5 && <div className="py-8 text-center"><div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-8" /></div><h3 className="mt-5 text-2xl font-black text-slate-900">¡Listo!</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">La personalización de esta interfaz quedó guardada. Puedes editar otra interfaz o entrar al modo avanzado para ajustar cada detalle.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => setStep(0)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">Personalizar otra interfaz</button><button type="button" onClick={onOpenAdvanced} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">Abrir personalización avanzada</button></div></div>}

          {step < 5 && <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5"><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-40"><ChevronLeft className="size-4" />Atrás</button><div className="flex items-center gap-2 text-xs font-bold text-slate-400">{step + 1} de 4</div>{step < 3 ? <button type="button" onClick={() => setStep((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--qb-primary)] px-5 py-2.5 text-sm font-black text-white shadow-lg">Continuar<ChevronRight className="size-4" /></button> : <button type="button" onClick={() => void finish()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-50">{saving ? 'Guardando…' : 'Aplicar personalización'}<Check className="size-4" /></button>}</div>}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div className="flex items-start gap-2 text-xs leading-5 text-slate-600"><Type className="mt-0.5 size-4 shrink-0 text-slate-500" /><span><b>¿Quieres controlar cada detalle?</b> El modo avanzado permite editar tipografía, colores individuales, tarjetas, navegación, inputs, sombras y más.</span></div><button type="button" onClick={onOpenAdvanced} className="shrink-0 text-xs font-black text-blue-700 hover:underline">Ir al modo avanzado →</button></div>
    </div>
  );
}
