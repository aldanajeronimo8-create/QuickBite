import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Monitor, Palette, Sparkles, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useVisualTheme } from '../../../contexts/VisualThemeProvider';
import { saveVisualSettings } from '../../../../services/visualSettingsService';
import { resolveVisualSettings, type VisualInterfaceScope, type VisualSettingsDraft } from '../../../../types/visualSettings';

type GuideStyleId = 'minimal' | 'friendly' | 'professional';
type GuidePalette = { id: string; name: string; description: string; primary: string; secondary: string; accent: string; background: string; surface: string };
type GuideStyle = {
  id: GuideStyleId;
  name: string;
  description: string;
  visualDescription: string;
  card: VisualSettingsDraft['card_style'];
  button: VisualSettingsDraft['button_style'];
  shadow: VisualSettingsDraft['shadow_style'];
  radius: VisualSettingsDraft['border_radius'];
  density: VisualSettingsDraft['density'];
  header: VisualSettingsDraft['header_style'];
  navigation: VisualSettingsDraft['navigation_style'];
  input: VisualSettingsDraft['input_style'];
  palettes: GuidePalette[];
};

const scopes: Array<[VisualInterfaceScope, string, string, string]> = [
  ['login_student', 'Inicio de sesión del estudiante', 'La pantalla donde el estudiante escribe su correo y contraseña.', 'Acceso del estudiante'],
  ['login_parent', 'Inicio de sesión de padres', 'La pantalla de acceso para padres y acudientes.', 'Acceso de padres'],
  ['login_admin', 'Inicio de sesión del administrador', 'La pantalla exclusiva de acceso administrativo.', 'Acceso administrativo'],
  ['student', 'Aplicación del estudiante', 'Menú, productos, pedidos, favoritos, saldo y cuenta.', 'Experiencia del estudiante'],
  ['parent', 'Aplicación de padres', 'Familia, saldo, pedidos y seguimiento.', 'Experiencia de padres'],
  ['admin', 'Panel administrativo', 'Dashboard, pedidos, menú, usuarios, pagos y herramientas.', 'Experiencia administrativa'],
];

const styles: GuideStyle[] = [
  {
    id: 'minimal',
    name: 'Limpio',
    description: 'Ordenado, ligero y con poca profundidad visual.',
    visualDescription: 'Mucho espacio, superficies claras, bordes suaves y una jerarquía muy limpia.',
    card: 'flat', button: 'solid', shadow: 'subtle', radius: 'small', density: 'comfortable', header: 'minimal', navigation: 'soft', input: 'soft',
    palettes: [
      { id: 'minimal-sky', name: 'Azul aire', description: 'Azul fresco con turquesa para una interfaz muy limpia.', primary: '#2563EB', secondary: '#0EA5E9', accent: '#14B8A6', background: '#F6FAFF', surface: '#FFFFFF' },
      { id: 'minimal-mint', name: 'Menta fresca', description: 'Verde claro y turquesa con sensación ligera.', primary: '#16A36A', secondary: '#0F766E', accent: '#2DD4BF', background: '#F4FBF7', surface: '#FFFFFF' },
      { id: 'minimal-navy', name: 'Azul sobrio', description: 'Azul profundo con acentos verdes muy discretos.', primary: '#1747B8', secondary: '#1D4ED8', accent: '#22C55E', background: '#F7F9FC', surface: '#FFFFFF' },
    ],
  },
  {
    id: 'friendly',
    name: 'Amigable',
    description: 'Redondeado, cercano y pensado para una app escolar.',
    visualDescription: 'Más color, tarjetas elevadas, botones redondeados y una sensación cálida y accesible.',
    card: 'elevated', button: 'solid', shadow: 'normal', radius: 'large', density: 'normal', header: 'standard', navigation: 'solid', input: 'outlined',
    palettes: [
      { id: 'friendly-green', name: 'Verde QuickBite', description: 'El verde toma el protagonismo y el azul acompaña.', primary: '#16A36A', secondary: '#2563EB', accent: '#FBBF24', background: '#F2FBF6', surface: '#FFFFFF' },
      { id: 'friendly-turquoise', name: 'Turquesa vital', description: 'Turquesa alegre con verde y azul de apoyo.', primary: '#0F9F8A', secondary: '#16A36A', accent: '#2563EB', background: '#F1FBFA', surface: '#FFFFFF' },
      { id: 'friendly-blue', name: 'Azul juvenil', description: 'Azul vivo equilibrado con verde cafetería.', primary: '#2563EB', secondary: '#16A36A', accent: '#38BDF8', background: '#F3F8FF', surface: '#FFFFFF' },
    ],
  },
  {
    id: 'professional',
    name: 'Profesional',
    description: 'Más sobrio y estructurado para una experiencia institucional.',
    visualDescription: 'Contraste más firme, bordes definidos y una lectura visual más institucional.',
    card: 'outlined', button: 'solid', shadow: 'subtle', radius: 'medium', density: 'normal', header: 'prominent', navigation: 'soft', input: 'outlined',
    palettes: [
      { id: 'pro-navy', name: 'Institucional', description: 'Azul profundo con verde como señal de acción.', primary: '#1747B8', secondary: '#0F3B82', accent: '#16A36A', background: '#F5F8FC', surface: '#FFFFFF' },
      { id: 'pro-emerald', name: 'Esmeralda', description: 'Verde serio con azul para confianza y tecnología.', primary: '#087F5B', secondary: '#1747B8', accent: '#14B8A6', background: '#F4F9F7', surface: '#FFFFFF' },
      { id: 'pro-bluegreen', name: 'Azul ejecutivo', description: 'Azul dominante, verde controlado y turquesa puntual.', primary: '#1D4ED8', secondary: '#14532D', accent: '#0F9F8A', background: '#F6F8FC', surface: '#FFFFFF' },
    ],
  },
];

function getStyle(id: GuideStyleId) {
  return styles.find((item) => item.id === id) ?? styles[1];
}

function patchFromGuide(current: VisualSettingsDraft, palette: GuidePalette, style: GuideStyle): VisualSettingsDraft {
  return {
    ...current,
    primary_color: palette.primary,
    secondary_color: palette.secondary,
    accent_color: palette.accent,
    background_color: palette.background,
    surface_color: palette.surface,
    text_color: '#0F172A',
    muted_text_color: '#64748B',
    border_color: '#D9E2EC',
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
    header_style: style.header,
    navigation_style: style.navigation,
    input_style: style.input,
  };
}

function buildPreviewPath(scope: VisualInterfaceScope): string {
  const selected = scopes.find(([id]) => id === scope);
  const base = scope.startsWith('login_')
    ? `/login?preview_role=${scope.replace('login_', '')}`
    : selected?.[3] === 'Experiencia administrativa'
      ? '/admin'
      : selected?.[3] === 'Experiencia de padres'
        ? '/parent/family'
        : '/menu';
  return `${base}${base.includes('?') ? '&' : '?'}visual_preview=1&visual_preview_scope=${scope}`;
}

export function GuidedVisualSettings({ onOpenAdvanced }: { onOpenAdvanced: () => void }) {
  const { settings, applyLocal } = useVisualTheme();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<VisualInterfaceScope>('student');
  const [styleId, setStyleId] = useState<GuideStyleId>('friendly');
  const [paletteId, setPaletteId] = useState('friendly-green');
  const [draft, setDraft] = useState<VisualSettingsDraft>(() => resolveVisualSettings(settings, 'student'));
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const style = useMemo(() => getStyle(styleId), [styleId]);
  const palette = useMemo(() => style.palettes.find((item) => item.id === paletteId) ?? style.palettes[0], [style, paletteId]);
  const generated = useMemo(() => patchFromGuide(draft, palette, style), [draft, palette, style]);
  const previewPath = useMemo(() => buildPreviewPath(scope), [scope]);
  const selectedScope = useMemo(() => scopes.find(([id]) => id === scope), [scope]);

  useEffect(() => {
    setDraft(resolveVisualSettings(settings, scope));
  }, [settings, scope]);

  const chooseStyle = (nextStyleId: GuideStyleId) => {
    const nextStyle = getStyle(nextStyleId);
    setStyleId(nextStyleId);
    setPaletteId(nextStyle.palettes[0].id);
  };

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
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/90">Cada estilo modifica realmente la apariencia y te ofrece su propio conjunto de colores. En la revisión verás la pantalla real que seleccionaste.</p>
            </div>
          </div>
          <div className="mt-7 flex items-center gap-2 overflow-x-auto pb-1">
            {labels.map((label, index) => (
              <div key={label} className="flex shrink-0 items-center gap-2">
                <div className={`grid size-8 place-items-center rounded-full text-xs font-black ${step >= index ? 'bg-white text-blue-700' : 'bg-white/15 text-white'}`}>{step > index ? <Check className="size-4" /> : index + 1}</div>
                <span className={`text-xs font-bold ${step >= index ? 'text-white' : 'text-white/55'}`}>{label}</span>
                {index < labels.length - 1 && <div className={`h-px w-8 ${step > index ? 'bg-white/60' : 'bg-white/20'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <div><h3 className="text-xl font-black text-slate-900">¿Qué parte de QuickBite quieres personalizar?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Selecciona una experiencia. La vista previa y los cambios se limitarán a esa parte.</p></div>
              <div className="grid gap-3 md:grid-cols-2">
                {scopes.map(([id, title, description, badge]) => (
                  <button key={id} type="button" onClick={() => setScope(id)} className={`rounded-2xl border p-4 text-left transition ${scope === id ? 'border-blue-400 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'}`}>
                    <div className="flex items-center justify-between gap-3"><p className="font-black text-slate-900">{title}</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{badge}</span></div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-start gap-3"><WandSparkles className="mt-0.5 size-5 text-blue-600" /><div><h3 className="text-xl font-black text-slate-900">¿Qué estilo quieres transmitir?</h3><p className="mt-1 text-sm leading-6 text-slate-500">Aquí no solo cambia el texto: cada elección cambia tarjetas, botones, bordes, navegación, inputs, sombras y espaciado.</p></div></div>
              <div className="grid gap-3 md:grid-cols-3">
                {styles.map((item) => (
                  <button key={item.id} type="button" onClick={() => chooseStyle(item.id)} className={`rounded-2xl border p-5 text-left transition ${styleId === item.id ? 'border-blue-400 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm'}`}>
                    <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`size-4 rounded-full ${item.id === 'minimal' ? 'bg-sky-500' : item.id === 'friendly' ? 'bg-emerald-500' : 'bg-blue-800'}`} /><span className="font-black text-slate-900">{item.name}</span></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500 shadow-sm">{item.palettes.length} paletas</span></div>
                    <p className="text-xs font-bold leading-5 text-slate-700">{item.description}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{item.visualDescription}</p>
                    <div className="mt-5 flex gap-2"><span className="px-3 py-2 text-[11px] font-black text-white" style={{ background: item.id === 'minimal' ? '#2563EB' : item.id === 'friendly' ? '#16A36A' : '#1747B8', borderRadius: item.id === 'minimal' ? '0.375rem' : item.id === 'friendly' ? '1rem' : '0.75rem', boxShadow: item.id === 'friendly' ? '0 8px 24px rgba(15,23,42,.10)' : 'none' }}>Botón</span><span className="grid place-items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">Tarjeta</span></div>
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950"><b>Estilo seleccionado:</b> {style.name}. Al pasar a “Colores” verás solamente las paletas diseñadas para este estilo.</div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-start gap-3"><Palette className="mt-0.5 size-5 text-emerald-600" /><div><h3 className="text-xl font-black text-slate-900">Colores para el estilo {style.name}</h3><p className="mt-1 text-sm leading-6 text-slate-500">Estas paletas son exclusivas de este estilo. Cada una cambia realmente el color principal, secundario, acento y fondo.</p></div></div>
              <div className="grid gap-3 md:grid-cols-3">
                {style.palettes.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPaletteId(item.id)} className={`rounded-2xl border p-4 text-left transition ${paletteId === item.id ? 'border-emerald-400 bg-emerald-50 shadow-md' : 'border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm'}`}>
                    <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{item.name}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p></div><div className="flex shrink-0 gap-1">{[item.primary, item.secondary, item.accent].map((color) => <span key={color} className="size-8 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}</div></div>
                    <div className="mt-4 h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} />
                    <div className="mt-3 rounded-xl border border-white bg-white/80 px-3 py-2 text-[10px] font-bold text-slate-500"><span style={{ color: item.primary }}>Principal</span> · <span style={{ color: item.secondary }}>Secundario</span> · <span style={{ color: item.accent }}>Acento</span></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><Eye className="mt-0.5 size-5 text-blue-600" /><div><h3 className="text-xl font-black text-slate-900">Revisa la interfaz real</h3><p className="mt-1 text-sm leading-6 text-slate-500">{selectedScope?.[1]} · estilo <b>{style.name}</b> · paleta <b>{palette.name}</b>.</p></div></div><div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600 sm:flex"><Monitor className="size-3.5" /> Aplicación real</div></div>
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 p-3 shadow-sm"><div className="overflow-hidden rounded-2xl bg-white shadow-xl" style={{ height: 'min(68vh, 720px)' }}><iframe ref={iframeRef} title={`Vista previa de ${selectedScope?.[1] ?? 'QuickBite'}`} src={previewPath} onLoad={postPreview} className="h-full w-full border-0" /></div></div>
              <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Estilo</p><p className="mt-1 font-black text-slate-900">{style.name}</p><p className="mt-1 text-xs text-slate-500">{style.visualDescription}</p></div><div className="rounded-2xl border border-slate-200 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Paleta</p><div className="mt-2 flex gap-1.5">{[palette.primary, palette.secondary, palette.accent].map((color) => <span key={color} className="size-6 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}</div><p className="mt-1 font-black text-slate-900">{palette.name}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Aplicación</p><p className="mt-1 font-black text-emerald-950">Solo esta interfaz</p><p className="mt-1 text-xs text-emerald-800">Los procesos de pedidos, usuarios y pagos siguen intactos.</p></div></div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 py-6 text-center"><div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-8" /></div><h3 className="text-2xl font-black text-slate-900">¡Listo!</h3><p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">La personalización de <b>{selectedScope?.[1]}</b> quedó guardada con el estilo <b>{style.name}</b> y la paleta <b>{palette.name}</b>.</p><button type="button" onClick={() => { setStep(0); setDraft(resolveVisualSettings(settings, scope)); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">Personalizar otra interfaz</button></div>
          )}

          {step < 5 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={() => (step === 0 ? onOpenAdvanced() : setStep((current) => current - 1))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"><ChevronLeft className="size-4" />{step === 0 ? 'Personalización avanzada' : 'Atrás'}</button>
              {step < 3 ? <button type="button" onClick={() => setStep((current) => current + 1)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--qb-primary)] px-5 py-2.5 text-sm font-black text-white shadow-lg">Continuar<ChevronRight className="size-4" /></button> : <button type="button" onClick={() => void finish()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--qb-primary)] px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-50">{saving ? 'Guardando…' : 'Aplicar personalización'}<Check className="size-4" /></button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
