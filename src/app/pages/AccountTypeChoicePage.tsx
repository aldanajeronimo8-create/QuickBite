import { ArrowLeft, GraduationCap, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function AccountTypeChoicePage() {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.16),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.14),_transparent_35%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto flex min-h-[90vh] max-w-xl items-center justify-center">
      <section className="w-full rounded-[2rem] border border-white/70 bg-white/80 p-7 shadow-2xl backdrop-blur-2xl sm:p-9">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Volver</button>
        <div className="mt-7 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite</p><h1 className="mt-2 text-3xl font-black">¿Qué tipo de cuenta quieres crear?</h1><p className="mt-2 text-sm text-slate-600">Elige el perfil que corresponde a la persona que utilizará la cuenta.</p></div>
        <div className="mt-7 grid gap-4">
          <Link to="/register-student/form" className="group rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white"><GraduationCap className="h-6 w-6"/></div><div><h2 className="font-black">Estudiante</h2><p className="mt-1 text-sm text-slate-600">Crea tu cuenta para consultar el menú, pedir, guardar favoritos y administrar tus datos.</p></div></div></Link>
          <Link to="/register-parent" className="group rounded-3xl border border-blue-200 bg-blue-50/70 p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white"><Users className="h-6 w-6"/></div><div><h2 className="font-black">Padre de Familia</h2><p className="mt-1 text-sm text-slate-600">Crea una cuenta familiar y vincúlala con el perfil del estudiante mediante su código.</p></div></div></Link>
        </div>
      </section>
    </div>
  </div>;
}
