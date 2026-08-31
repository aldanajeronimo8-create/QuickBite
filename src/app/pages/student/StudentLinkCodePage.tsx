import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

export function StudentLinkCodePage() {
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const loadCode = useCallback(async (forceNew = false) => {
    setError('');
    if (forceNew) setGenerating(true); else setLoading(true);
    try {
      const supabase = requireSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error('Tu sesión no está activa. Inicia sesión nuevamente.');

      const { data, error: rpcError } = await supabase.rpc('get_or_create_student_code', {
        p_force_new: forceNew,
      });
      if (rpcError) throw rpcError;

      const result = typeof data === 'string'
        ? { code: data, expires_at: null }
        : (data && typeof data === 'object' ? data : {}) as { code?: string; expires_at?: string | null };

      if (!result.code) throw new Error('Supabase no devolvió un código de vinculación válido.');
      setCode(result.code);
      setExpiresAt(result.expires_at ?? null);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const message = raw === 'student_only'
        ? 'Esta función solo está disponible para cuentas de estudiante.'
        : raw === 'unauthorized'
          ? 'Tu sesión no está activa. Inicia sesión nuevamente.'
          : raw || 'No se pudo generar el código de vinculación.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, []);

  useEffect(() => { void loadCode(); }, [loadCode]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código copiado.');
    } catch {
      toast.error('No se pudo copiar el código. Puedes seleccionarlo y copiarlo manualmente.');
    }
  };

  const expiration = expiresAt ? new Date(expiresAt) : null;
  const expired = expiration ? expiration.getTime() <= Date.now() : false;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,.12),_transparent_35%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-xl space-y-5"><Link to="/student/account" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><ArrowLeft className="h-4 w-4"/>Mi cuenta</Link><section className="rounded-[2rem] bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl"><Users className="mx-auto h-10 w-10 text-blue-700"/><h1 className="mt-4 text-3xl font-black">Código para vincularme</h1><p className="mt-2 text-sm text-slate-600">Entrega este código a tu padre, madre o acudiente para que pueda vincular tu perfil en QuickBite.</p>{loading ? <p className="mt-8 font-bold">Comprobando código…</p> : <><div className="mt-8 rounded-3xl bg-slate-50 p-6"><p className="text-4xl font-black tracking-[.18em] text-blue-700">{code || '—'}</p>{expiresAt && <p className="mt-3 text-sm font-semibold text-slate-500">{expired ? 'Código expirado' : `Válido hasta ${expiration?.toLocaleString('es-CO')}`}</p>}</div>{error && <div role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-left text-sm font-semibold text-red-700">{error}</div>}<div className="mt-5 flex flex-wrap justify-center gap-3"><button disabled={!code || expired} onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Copy className="h-4 w-4"/>Copiar código</button><button disabled={generating} onClick={() => void loadCode(true)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 font-black disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Generar nuevo</button></div></>}</section></div></div>;
}
