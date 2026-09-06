import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Eye, Monitor, RefreshCw, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import type { VisualInterfaceScope, VisualSettingsDraft } from '../../../../types/visualSettings';

type Viewport = 'desktop' | 'tablet' | 'mobile';
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

const VIEWPORTS: Array<{ id: Viewport; label: string; width: number | 'full'; icon: typeof Monitor }> = [
  { id: 'desktop', label: 'Ordenador', width: 'full', icon: Monitor },
  { id: 'tablet', label: 'Tableta', width: 768, icon: Tablet },
  { id: 'mobile', label: 'Móvil', width: 390, icon: Smartphone },
];
const STORAGE_KEY = 'quickbite_visual_preview_settings';

export function PreviewStudio({ scope, previewPath, draft, saved, compare = false, onCompareChange, canUndo = false, canRedo = false, onUndo, onRedo, onCopy }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [mode, setMode] = useState<'draft' | 'saved'>('draft');
  const [key, setKey] = useState(0);
  const activeSettings = mode === 'draft' ? draft : saved;
  const selectedViewport = VIEWPORTS.find((item) => item.id === viewport) ?? VIEWPORTS[0];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const postTo = (frame: HTMLIFrameElement | null, settings: VisualSettingsDraft) => {
    const target = frame?.contentWindow;
    if (!target) return;
    try { target.postMessage({ type: 'quickbite-visual-preview', settings }, window.location.origin); } catch { /* iframe will also read localStorage */ }
  };

  const postPreview = () => {
    if (compare) { postTo(iframeRef.current, draft); postTo(savedIframeRef.current, saved); }
    else postTo(iframeRef.current, activeSettings);
  };

  useEffect(() => { postPreview(); }, [draft, saved, compare, mode]);
  useEffect(() => {
    const handleReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview-ready') return;
      if (event.source === iframeRef.current?.contentWindow) postTo(iframeRef.current, compare ? draft : activeSettings);
      if (event.source === savedIframeRef.current?.contentWindow) postTo(savedIframeRef.current, saved);
    };
    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, [compare, draft, saved, mode]);

  const refresh = () => setKey((value) => value + 1);
  const openFull = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSettings)); } catch { /* optional */ }
    window.open(previewPath, '_blank', 'noopener,noreferrer');
  };
  const copyPath = async () => {
    if (onCopy) { onCopy(); return; }
    try { await navigator.clipboard.writeText(`${window.location.origin}${previewPath}`); } catch { /* optional */ }
  };

  const frameStyle = { width: selectedViewport.width === 'full' ? '100%' : `${selectedViewport.width}px`, maxWidth: '100%' };
  const frame = (ref: React.RefObject<HTMLIFrameElement | null>, frameKey: string, settings: VisualSettingsDraft, label: string) => (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-400/30" style={frameStyle}>
      <div className="flex h-8 items-center gap-1 border-b border-slate-200 bg-slate-100 px-3"><span className="size-2 rounded-full bg-slate-300" /><span className="size-2 rounded-full bg-slate-300" /><span className="size-2 rounded-full bg-slate-300" /><span className="ml-2 truncate text-[9px] font-bold text-slate-400">{label}</span></div>
      <iframe key={`${key}-${frameKey}`} ref={ref} title={`${label} ${scope}`} src={previewPath} onLoad={() => postTo(ref.current, settings)} className="block h-[680px] w-full border-0 bg-white" />
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-900 bg-slate-950 shadow-xl">
      <div className="border-b border-white/10 bg-slate-950 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400"><Eye className="h-4 w-4" /> Visual Studio</div><p className="mt-1 truncate text-sm font-bold text-white">{scope.replaceAll('_', ' ')}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10">{VIEWPORTS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setViewport(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-black transition ${viewport === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span></button>)}</div>
            <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10"><button type="button" onClick={() => setMode('draft')} className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'draft' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Borrador</button><button type="button" onClick={() => setMode('saved')} className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'saved' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Guardado</button></div>
            <button type="button" disabled={!canUndo} onClick={onUndo} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 disabled:opacity-30" aria-label="Deshacer"><Undo2 className="h-4 w-4" /></button>
            <button type="button" disabled={!canRedo} onClick={onRedo} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 disabled:opacity-30" aria-label="Rehacer"><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => onCompareChange?.(!compare)} className={`rounded-xl px-3 py-2 text-[11px] font-black ring-1 ring-white/10 ${compare ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}`}>{compare ? 'Salir de comparación' : 'Antes / Después'}</button>
            <button type="button" onClick={refresh} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Regenerar vista"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" onClick={copyPath} className="hidden size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white sm:grid" aria-label="Copiar ruta"><Copy className="h-4 w-4" /></button>
            <button type="button" onClick={openFull} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Ver en otra pestaña"><ExternalLink className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400"><span className="rounded-full bg-white/5 px-2.5 py-1">Interfaz real</span><span className="rounded-full bg-white/5 px-2.5 py-1">Sesión aislada</span>{dirty && <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-200">Cambios sin guardar</span>}{compare && <span className="rounded-full bg-white/10 px-2.5 py-1 text-white">Comparando original y borrador</span>}</div>
      </div>
      <div className="bg-slate-200 p-3 sm:p-5"><div className={`mx-auto min-h-[520px] overflow-auto rounded-[1.5rem] bg-slate-300/70 p-3 shadow-inner sm:p-5 ${compare ? 'grid gap-5 xl:grid-cols-2' : 'flex justify-center'}`}>
        {compare ? <><div className="min-w-0"><p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Antes · Guardado</p>{frame(savedIframeRef, 'saved', saved, 'Guardado')}</div><div className="min-w-0"><p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Después · Borrador</p>{frame(iframeRef, 'draft', draft, 'Borrador')}</div></> : frame(iframeRef, mode, activeSettings, mode === 'draft' ? 'Borrador' : 'Guardado')}
      </div></div>
      <div className="flex flex-col gap-2 border-t border-white/10 bg-slate-950 px-4 py-3 text-[11px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>1 clic ejecuta la acción normal. 3 clics abren el editor del elemento visual.</span><span className="font-black text-slate-300">{selectedViewport.width === 'full' ? 'Ancho adaptable' : `${selectedViewport.width}px`}</span></div>
    </section>
  );
}
