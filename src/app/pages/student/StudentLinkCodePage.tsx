import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

export function StudentLinkCodePage() {
  const [code, setCode] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => { const { data, error } = await requireSupabaseClient().rpc('get_or_create_student_code'); if (error) throw error; setCode(String(data)); })().catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo generar el código.')).finally(() => setLoading(false)); }, []);
  const copy = async () => { if (!code) return; await navigator.clipboard.writeText(code); toast.success('Código copiado.'); };
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,.12),_transparent_35%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-xl space-y-5"><Link to="/student/account" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><ArrowLeft className="h-4 w-4"/>Mi cuenta</Link><section className="rounded-[2rem] bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl"><Users className="mx-auto h-10 w-10 text-blue-700"/><h1 className="mt-4 text-3xl font-black">Código para vincularme</h1><p className="mt-2 text-sm text-slate-600">Entrega este código a tu padre, madre o acudiente para que pueda vincular tu perfil en QuickBite.</p>{loading ? <p className="mt-8 font-bold">Generando…</p> : <><div className="mt-8 rounded-3xl bg-slate-50 p-6"><p className="text-4xl font-black tracking-[.18em] text-blue-700">{code}</p></div><button onClick={() => void copy()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 font-black text-white"><Copy className="h-4 w-4"/>Copiar código</button></>}</section></div></div>;
}
