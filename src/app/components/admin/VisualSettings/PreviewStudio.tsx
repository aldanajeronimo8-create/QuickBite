import { forwardRef, useEffect, useRef, useState } from 'react';
import { Eye, Grid3X3, Layers3, Monitor, Palette, Redo2, Ruler, Smartphone, Tablet, Undo2 } from 'lucide-react';
import type { VisualInterfaceScope, VisualSettingsDraft } from '../../../../types/visualSettings';

type Viewport = 'desktop' | 'tablet' | 'mobile';
type StudioTool = 'styles' | 'layout' | 'elements' | 'guides' | null;
type Props = {
  scope: VisualInterfaceScope;
  previewPath: string;
  draft: VisualSettingsDraft;
  saved: VisualSettingsDraft;
  compare?: boolean;
  onCompareChange?: (value: boolean) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
};

type PreviewFrameProps = {
  frameKey: string;
  settings: VisualSettingsDraft;
  label: string;
  scope: VisualInterfaceScope;
  previewPath: string;
  frameStyle: React.CSSProperties;
  postTo: (frame: HTMLIFrameElement | null, settings: VisualSettingsDraft) => void;
};

const VIEWPORTS: Array<{ id: Viewport; label: string; width: number | 'full'; icon: typeof Monitor }> = [
  { id: 'desktop', label: 'Ordenador', width: 'full', icon: Monitor },
  { id: 'tablet', label: 'Tableta', width: 768, icon: Tablet },
  { id: 'mobile', label: 'Móvil', width: 390, icon: Smartphone },
];

const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(function PreviewFrame(
  { frameKey, settings, label, scope, previewPath, frameStyle, postTo },
  ref,
) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-400/30" style={frameStyle}>
      <div className="flex h-8 items-center gap-1 border-b border-slate-200 bg-slate-100 px-3">
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="ml-2 truncate text-[9px] font-bold text-slate-400">{label}</span>
      </div>
      <iframe
        key={frameKey}
        ref={ref}
        title={`${label} ${scope}`}
        src={previewPath}
        onLoad={(event) => postTo(event.currentTarget, settings)}
        className="block h-[680px] w-full border-0 bg-white"
      />
    </div>
  );
});

function ToolButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Palette;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-black transition-all duration-200 ${
        active
          ? 'bg-white/[0.9] text-slate-900 shadow-[0_10px_28px_rgba(255,255,255,0.14)] ring-1 ring-white/80'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 transition-transform duration-200 ${active ? 'scale-105' : 'group-hover:scale-105'}`} />
      <span>{label}</span>
    </button>
  );
}

export function PreviewStudio({
  scope,
  previewPath,
  draft,
  saved,
  compare = false,
  onCompareChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onCopy: _onCopy,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [mode, setMode] = useState<'draft' | 'saved'>('draft');
  const [tool, setTool] = useState<StudioTool>(null);
  const activeSettings = mode === 'draft' ? draft : saved;
  const selectedViewport = VIEWPORTS.find((item) => item.id === viewport) ?? VIEWPORTS[0];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const guideActive = tool === 'guides';

  const postTo = (frame: HTMLIFrameElement | null, settings: VisualSettingsDraft) => {
    const target = frame?.contentWindow;
    if (!target) return;
    try {
      target.postMessage({ type: 'quickbite-visual-preview', settings }, window.location.origin);
    } catch {
      // iframe also receives the same settings on load
    }
  };

  const postPreview = () => {
    if (compare) {
      postTo(iframeRef.current, draft);
      postTo(savedIframeRef.current, saved);
    } else {
      postTo(iframeRef.current, activeSettings);
    }
  };

  useEffect(() => {
    postPreview();
  }, [draft, saved, compare, mode]);

  useEffect(() => {
    const handleReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview-ready') return;
      if (event.source === iframeRef.current?.contentWindow) postTo(iframeRef.current, compare ? draft : activeSettings);
      if (event.source === savedIframeRef.current?.contentWindow) postTo(savedIframeRef.current, saved);
    };
    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, [compare, draft, saved, mode]);

  const toggleTool = (nextTool: Exclude<StudioTool, null>) => {
    setTool((current) => (current === nextTool ? null : nextTool));
  };

  const frameStyle = {
    width: selectedViewport.width === 'full' ? '100%' : `${selectedViewport.width}px`,
    maxWidth: '100%',
  };

  const previewSurfaceStyle: React.CSSProperties | undefined = guideActive
    ? {
        backgroundImage:
          'linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }
    : undefined;

  const toolPanel = tool ? (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_16px_40px_rgba(2,6,23,0.20)] backdrop-blur-2xl sm:p-4">
      {tool === 'styles' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Primario <span className="size-4 rounded-full ring-2 ring-white/40" style={{ backgroundColor: activeSettings.primary_color }} /></div>
            <p className="mt-2 font-mono text-xs font-bold text-white">{activeSettings.primary_color}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Fondo <span className="size-4 rounded-full ring-2 ring-white/40" style={{ backgroundColor: activeSettings.background_color }} /></div>
            <p className="mt-2 font-mono text-xs font-bold text-white">{activeSettings.background_color}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Tipografía</p>
            <p className="mt-2 text-xs font-bold text-white">{activeSettings.font_family}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Tema</p>
            <p className="mt-2 text-xs font-bold text-white capitalize">{activeSettings.theme_mode}</p>
          </div>
        </div>
      )}
      {tool === 'layout' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Viewport</p><p className="mt-2 text-xs font-bold text-white">{selectedViewport.width === 'full' ? 'Ancho adaptable' : `${selectedViewport.width}px`}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Densidad</p><p className="mt-2 text-xs font-bold text-white capitalize">{activeSettings.density}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Radio</p><p className="mt-2 text-xs font-bold text-white capitalize">{activeSettings.border_radius}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Sombra</p><p className="mt-2 text-xs font-bold text-white capitalize">{activeSettings.shadow_style}</p></div>
        </div>
      )}
      {tool === 'elements' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-white">Edición directa sobre la interfaz</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Haz 3 clics sobre un elemento de la preview para abrir sus controles. Solo ese elemento se modifica y el cambio permanece como borrador hasta Guardar.</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black text-slate-300">{Object.keys(activeSettings.element_overrides ?? {}).length} elementos personalizados</span>
        </div>
      )}
      {tool === 'guides' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-white">Guías de composición activas</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Cuadrícula de 24 px para alinear visualmente bloques, tarjetas, botones y espaciados dentro de la preview.</p>
          </div>
          <span className="shrink-0 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black text-cyan-100">24 × 24 px</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
      <div className="pointer-events-none absolute -left-20 -top-24 size-56 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="pointer-events-none absolute right-12 -top-16 size-48 rounded-full bg-fuchsia-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-indigo-300/10 blur-3xl" />

      <div className="relative border-b border-white/10 bg-white/[0.035] px-3 py-3 backdrop-blur-2xl sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_32px_rgba(2,6,23,0.22)] backdrop-blur-xl">
              <Eye className="h-4 w-4 text-slate-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Visual Studio <span className="size-1 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" /></div>
              <p className="mt-0.5 truncate text-sm font-bold text-white capitalize">{scope.replaceAll('_', ' ')} <span className="text-slate-500">·</span> {mode === 'draft' ? 'Borrador' : 'Guardado'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.055] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_30px_rgba(2,6,23,0.20)] backdrop-blur-2xl">
              {VIEWPORTS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setViewport(id)} className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-black transition-all ${viewport === id ? 'bg-white/[0.92] text-slate-900 shadow-[0_8px_24px_rgba(255,255,255,0.12)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.055] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_30px_rgba(2,6,23,0.20)] backdrop-blur-2xl">
              <button type="button" onClick={() => setMode('draft')} className={`rounded-xl px-3 py-2 text-[11px] font-black transition-all ${mode === 'draft' ? 'bg-white/[0.92] text-slate-900 shadow-[0_8px_24px_rgba(255,255,255,0.12)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>Borrador</button>
              <button type="button" onClick={() => setMode('saved')} className={`rounded-xl px-3 py-2 text-[11px] font-black transition-all ${mode === 'saved' ? 'bg-white/[0.92] text-slate-900 shadow-[0_8px_24px_rgba(255,255,255,0.12)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>Guardado</button>
            </div>

            <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.055] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_30px_rgba(2,6,23,0.20)] backdrop-blur-2xl">
              <button type="button" disabled={!canUndo} onClick={onUndo} className="grid size-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Deshacer"><Undo2 className="h-4 w-4" /></button>
              <button type="button" disabled={!canRedo} onClick={onRedo} className="grid size-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Rehacer"><Redo2 className="h-4 w-4" /></button>
            </div>

            <button type="button" onClick={() => onCompareChange?.(!compare)} className={`rounded-2xl border px-3.5 py-2.5 text-[11px] font-black shadow-[0_12px_30px_rgba(2,6,23,0.18)] backdrop-blur-2xl transition-all ${compare ? 'border-white/60 bg-white/[0.9] text-slate-900' : 'border-white/10 bg-white/[0.055] text-slate-200 hover:bg-white/10'}`}>{compare ? 'Salir de comparación' : 'Antes / Después'}</button>

            <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.055] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_30px_rgba(2,6,23,0.20)] backdrop-blur-2xl">
              <ToolButton active={tool === 'styles'} label="Estilos" icon={Palette} onClick={() => toggleTool('styles')} />
              <ToolButton active={tool === 'layout'} label="Diseño" icon={Ruler} onClick={() => toggleTool('layout')} />
              <ToolButton active={tool === 'elements'} label="Elementos" icon={Layers3} onClick={() => toggleTool('elements')} />
              <ToolButton active={tool === 'guides'} label="Guías" icon={Grid3X3} onClick={() => toggleTool('guides')} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">Interfaz real</span>
          <span className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">Sesión aislada</span>
          {dirty && <span className="rounded-full border border-amber-200/15 bg-amber-300/10 px-2.5 py-1.5 text-amber-100 shadow-[0_8px_20px_rgba(251,191,36,0.08)] backdrop-blur-xl">Cambios sin guardar</span>}
          {guideActive && <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2.5 py-1.5 text-cyan-100 backdrop-blur-xl">Guías activas</span>}
        </div>
        {toolPanel}
      </div>

      <div className="relative bg-slate-200 p-3 sm:p-5">
        <div
          style={previewSurfaceStyle}
          className={`mx-auto min-h-[520px] overflow-auto rounded-[1.5rem] bg-slate-300/70 p-3 shadow-inner sm:p-5 ${compare ? 'grid gap-5 xl:grid-cols-2' : 'flex justify-center'}`}
        >
          {compare ? (
            <>
              <div className="min-w-0">
                <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Antes · Guardado</p>
                <PreviewFrame ref={savedIframeRef} frameKey={`saved-${previewPath}`} settings={saved} label="Guardado" scope={scope} previewPath={previewPath} frameStyle={frameStyle} postTo={postTo} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Después · Borrador</p>
                <PreviewFrame ref={iframeRef} frameKey={`draft-${previewPath}`} settings={draft} label="Borrador" scope={scope} previewPath={previewPath} frameStyle={frameStyle} postTo={postTo} />
              </div>
            </>
          ) : (
            <PreviewFrame ref={iframeRef} frameKey={`${mode}-${previewPath}`} settings={activeSettings} label={mode === 'draft' ? 'Borrador' : 'Guardado'} scope={scope} previewPath={previewPath} frameStyle={frameStyle} postTo={postTo} />
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-2 border-t border-white/10 bg-white/[0.025] px-4 py-3 text-[11px] leading-5 text-slate-400 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>3 clics editan un elemento. Los ajustes se mantienen como borrador hasta Guardar.</span>
        <span className="font-black text-slate-300">{selectedViewport.width === 'full' ? 'Ancho adaptable' : `${selectedViewport.width}px`}</span>
      </div>
    </section>
  );
}
