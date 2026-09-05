import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Eye, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import type { VisualInterfaceScope, VisualSettingsDraft } from '../../../../types/visualSettings';

type Viewport = 'desktop' | 'tablet' | 'mobile';
type Props = {
  scope: VisualInterfaceScope;
  previewPath: string;
  draft: VisualSettingsDraft;
  saved: VisualSettingsDraft;
};

const VIEWPORTS: Array<{ id: Viewport; label: string; width: number | 'full'; icon: typeof Monitor }> = [
  { id: 'desktop', label: 'Desktop', width: 'full', icon: Monitor },
  { id: 'tablet', label: 'Tablet', width: 768, icon: Tablet },
  { id: 'mobile', label: 'Móvil', width: 390, icon: Smartphone },
];

export function PreviewStudio({ scope, previewPath, draft, saved }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [mode, setMode] = useState<'draft' | 'saved'>('draft');
  const [key, setKey] = useState(0);

  const activeSettings = mode === 'draft' ? draft : saved;
  const selectedViewport = VIEWPORTS.find((item) => item.id === viewport) ?? VIEWPORTS[0];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const postPreview = () => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    try {
      target.postMessage(
        { type: 'quickbite-visual-preview', settings: activeSettings },
        window.location.origin,
      );
    } catch {
      // The preview also receives its state through localStorage in the app bootstrap.
    }
  };

  useEffect(() => {
    postPreview();
  }, [activeSettings]);

  useEffect(() => {
    const handleReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'quickbite-visual-preview-ready') return;
      if (event.source === iframeRef.current?.contentWindow) postPreview();
    };
    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, [mode, draft, saved]);

  const refresh = () => setKey((value) => value + 1);
  const openFull = () => window.open(previewPath, '_blank', 'noopener,noreferrer');
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${previewPath}`);
    } catch {
      // Clipboard permissions are optional.
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 shadow-xl">
      <div className="border-b border-white/10 bg-slate-950 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
              <Eye className="h-4 w-4" /> Preview Studio
            </div>
            <p className="mt-1 truncate text-sm font-bold text-white">{scope.replaceAll('_', ' ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
              {VIEWPORTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewport(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-black transition sm:px-3 ${viewport === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
              <button type="button" onClick={() => setMode('draft')} className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'draft' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'}`}>Borrador</button>
              <button type="button" onClick={() => setMode('saved')} className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'saved' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>Guardado</button>
            </div>
            <button type="button" onClick={refresh} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Recargar vista previa">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={copyPath} className="hidden size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white sm:grid" aria-label="Copiar ruta de vista previa">
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" onClick={openFull} className="grid size-9 place-items-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Abrir vista previa completa">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
          <span className="rounded-full bg-white/5 px-2.5 py-1">Aplicación real</span>
          <span className="rounded-full bg-white/5 px-2.5 py-1">Sesión aislada</span>
          {dirty && mode === 'draft' && <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-200">Mostrando cambios sin guardar</span>}
        </div>
      </div>

      <div className="bg-slate-200 p-3 sm:p-5">
        <div className="mx-auto flex min-h-[520px] items-start justify-center overflow-auto rounded-[1.5rem] bg-slate-300/70 p-3 shadow-inner sm:p-5" key={viewport}>
          <div
            className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-400/30 transition-[width] duration-200"
            style={{ width: selectedViewport.width === 'full' ? '100%' : `${selectedViewport.width}px`, maxWidth: '100%' }}
          >
            <div className="flex h-8 items-center gap-1 border-b border-slate-200 bg-slate-100 px-3">
              <span className="size-2 rounded-full bg-slate-300" /><span className="size-2 rounded-full bg-slate-300" /><span className="size-2 rounded-full bg-slate-300" />
              <span className="ml-2 truncate text-[9px] font-bold text-slate-400">{window.location.origin}{previewPath}</span>
            </div>
            <iframe
              key={key}
              ref={iframeRef}
              title={`Preview Studio ${scope}`}
              src={previewPath}
              onLoad={postPreview}
              className="block h-[680px] w-full border-0 bg-white"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 bg-slate-950 px-4 py-3 text-[11px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>Los cambios del borrador son visuales y no escriben en Supabase hasta pulsar “Guardar cambios”.</span>
        <span className="font-black text-slate-300">{selectedViewport.width === 'full' ? 'Ancho adaptable' : `${selectedViewport.width}px`}</span>
      </div>
    </section>
  );
}
