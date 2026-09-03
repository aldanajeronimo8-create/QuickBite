import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, FileText, HeartPulse, IdCard, Mail, RefreshCw, ShieldCheck, UserCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { useStudentContextStore } from '../../../store/studentContextStore';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  grade: string | null;
  ti: string | null;
  student_code: string | null;
};

type Consent = {
  student_name: string | null;
  guardian_name: string | null;
  guardian_relationship: string | null;
  guardian_email: string | null;
  student_acknowledged: boolean;
  guardian_authorized: boolean;
  purpose: string | null;
  data_categories: string[] | null;
  privacy_policy_version: string | null;
  consent_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
};

type Dietary = { allergies: string[]; restrictions: string[]; notes: string | null };

const dateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
  : 'No disponible';

function DataCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserCircle }) {
  return <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400"><Icon className="h-4 w-4"/>{label}</div><p className="mt-2 break-words font-bold text-slate-800">{value || 'No registrado'}</p></div>;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><CheckCircle2 className="h-3.5 w-3.5"/>{label}</span>;
}

export function StudentAccountPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [dietary, setDietary] = useState<Dietary>({ allergies: [], restrictions: [], notes: null });
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const returnToParent = async () => {
    try {
      const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');
      if (error) throw error;
      clearActiveStudent();
      navigate('/parent/family');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo volver al panel de padre.');
    }
  };

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const authUser = sessionData.session?.user;
    if (!authUser) {
      navigate('/login', { replace: true });
      return;
    }

    const studentId = activeStudent?.id ?? authUser.id;
    const [profileRes, consentRes, dietaryRes] = await Promise.all([
      client.from('profiles').select('id,full_name,email,grade,ti,student_code').eq('id', studentId).maybeSingle(),
      client.from('student_data_consents').select('student_name,guardian_name,guardian_relationship,guardian_email,student_acknowledged,guardian_authorized,purpose,data_categories,privacy_policy_version,consent_at,created_at,revoked_at').eq('user_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('student_dietary_profiles').select('allergies,restrictions,notes').eq('student_user_id', studentId).maybeSingle(),
    ]);
    for (const result of [profileRes, consentRes, dietaryRes]) if (result.error) throw result.error;

    setProfile(profileRes.data as Profile | null);
    setConsent(consentRes.data as Consent | null);
    setDietary((dietaryRes.data as Dietary | null) ?? { allergies: [], restrictions: [], notes: null });
    setLastSignInAt(activeStudent ? null : authUser.last_sign_in_at ?? null);
  }, [activeStudent, navigate]);

  useEffect(() => { void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudo cargar Mi cuenta.')).finally(() => setLoading(false)); }, [load]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Cargando Mi cuenta…</div>;
  if (!profile) return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="rounded-3xl bg-white p-8 text-center shadow-xl"><p className="font-black">No se encontró el perfil del estudiante.</p><button type="button" onClick={() => void load()} className="mt-4 rounded-full bg-emerald-600 px-5 py-2 text-sm font-black text-white">Reintentar</button></div></div>;

  const displayName = profile.full_name ?? consent?.student_name ?? activeStudent?.full_name ?? 'Estudiante';
  const displayEmail = profile.email ?? activeStudent?.email ?? 'No registrado';

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.1),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      {activeStudent && <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-200 bg-blue-50/95 p-4 shadow-sm"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="text-sm font-black text-blue-950">Consultando la cuenta de {activeStudent.full_name}.</p></div><button type="button" onClick={() => void returnToParent()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200"><ArrowLeft className="h-4 w-4"/>Volver a Padre</button></div>}

      <header className="flex items-center justify-between gap-3"><Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-sm font-black shadow-sm ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4"/>Funciones</Link><button type="button" onClick={() => void load()} className="rounded-full bg-white/85 p-3 shadow-sm ring-1 ring-slate-200" aria-label="Actualizar Mi cuenta"><RefreshCw className="h-4 w-4"/></button></header>

      <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-2xl sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"><UserCircle className="h-8 w-8"/></div><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite Student</p><h1 className="mt-1 truncate text-3xl font-black">Mi cuenta</h1><p className="mt-1 truncate text-sm text-slate-600">{displayName} · {displayEmail}</p></div></div><div className="flex flex-wrap gap-2">{consent?.student_acknowledged && <StatusBadge ok label="Aviso leído"/>}{consent?.guardian_authorized && <StatusBadge ok label="Tutor autorizado"/>}{consent?.revoked_at ? <StatusBadge ok={false} label="Autorización revocada"/> : null}</div></div></section>

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><IdCard className="h-6 w-6 text-blue-700"/><div><h2 className="text-xl font-black">Datos de registro</h2><p className="text-sm text-slate-500">Todos los datos principales registrados al crear la cuenta del estudiante.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><DataCard label="Nombre completo" value={profile.full_name ?? consent?.student_name ?? ''} icon={UserCircle}/><DataCard label="Correo del estudiante" value={displayEmail} icon={Mail}/><DataCard label="T.I. (Tarjeta de identidad)" value={profile.ti ?? ''} icon={IdCard}/><DataCard label="Grado / curso" value={profile.grade ?? ''} icon={FileText}/><DataCard label="Código de estudiante" value={profile.student_code ?? ''} icon={ShieldCheck}/><DataCard label="ID interno de cuenta" value={profile.id} icon={ShieldCheck}/></div></section>

      <section className="rounded-[2rem] border border-emerald-200 bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-700"/><div><h2 className="text-xl font-black">Representante legal / tutor</h2><p className="text-sm text-slate-500">Información registrada durante la autorización de datos del estudiante.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><DataCard label="Nombre del tutor" value={consent?.guardian_name ?? ''} icon={UserCircle}/><DataCard label="Parentesco / relación" value={consent?.guardian_relationship ?? ''} icon={FileText}/><DataCard label="Correo del tutor" value={consent?.guardian_email ?? ''} icon={Mail}/><DataCard label="Autorización del tutor" value={consent?.guardian_authorized ? 'Autorizada' : 'No registrada'} icon={ShieldCheck}/><DataCard label="Fecha de autorización" value={dateTime(consent?.consent_at ?? consent?.created_at)} icon={Clock3}/><DataCard label="Versión de política" value={consent?.privacy_policy_version ?? ''} icon={FileText}/></div></section>

      <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><FileText className="h-6 w-6 text-blue-700"/><div><h2 className="font-black">Autorización y tratamiento de datos</h2><p className="text-sm text-slate-500">Registro informativo asociado al alta de la cuenta.</p></div></div><div className="mt-5 space-y-3 text-sm"><div className="rounded-2xl bg-slate-50 p-4"><p className="font-black">Finalidad registrada</p><p className="mt-1 leading-6 text-slate-600">{consent?.purpose ?? 'No disponible'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="font-black">Categorías de datos</p><p className="mt-1 leading-6 text-slate-600">{consent?.data_categories?.length ? consent.data_categories.join(', ') : 'No especificadas'}</p></div><div className="flex flex-wrap gap-2">{consent?.student_acknowledged && <StatusBadge ok label="Estudiante reconoció el aviso"/>}{consent?.guardian_authorized && <StatusBadge ok label="Tutor autorizó"/>}</div></div></div>

        <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex items-center gap-3"><HeartPulse className="h-6 w-6 text-rose-600"/><div><h2 className="font-black">Alimentación y bienestar</h2><p className="text-sm text-slate-500">Preferencias alimentarias guardadas para el estudiante.</p></div></div><div className="mt-5 space-y-3"><DataCard label="Alergias" value={dietary.allergies.length ? dietary.allergies.join(', ') : 'Ninguna registrada'} icon={HeartPulse}/><DataCard label="Restricciones" value={dietary.restrictions.length ? dietary.restrictions.join(', ') : 'Ninguna registrada'} icon={HeartPulse}/><DataCard label="Notas" value={dietary.notes ?? 'Sin notas'} icon={FileText}/></div></div></section>

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur-xl"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Clock3 className="h-6 w-6 text-slate-600"/><div><h2 className="font-black">Información de acceso</h2><p className="text-sm text-slate-500">Datos técnicos no sensibles de la cuenta.</p></div></div>{lastSignInAt && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Último acceso: {dateTime(lastSignInAt)}</span>}</div><div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100">La contraseña nunca se muestra. Solo se presenta información de registro y estado de autorización que corresponde al perfil del estudiante.</div></section>
    </div>
  </div>;
}
