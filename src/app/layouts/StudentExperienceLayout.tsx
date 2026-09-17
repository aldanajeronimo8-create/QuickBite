import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, ShieldCheck } from 'lucide-react';
import { StudentMenuPage } from '../pages/student/StudentMenuPage';
import { StudentMenuFavoritesOverlay } from '../components/student/StudentMenuFavoritesOverlay';
import { useStudentContextStore } from '../../store/studentContextStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

const ADMIN_PREVIEW_KEY = 'quickbite_admin_student_preview';

export function StudentExperienceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const [returning, setReturning] = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);
  const actingAsStudent = Boolean(activeStudent);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromAdmin = params.get('from') === 'admin';
    const storedPreview = typeof window !== 'undefined' && window.sessionStorage.getItem(ADMIN_PREVIEW_KEY) === '1';
    if (fromAdmin || storedPreview) {
      setAdminPreview(true);
      if (fromAdmin) window.sessionStorage.setItem(ADMIN_PREVIEW_KEY, '1');
    }
  }, [location.search]);

  const returnToAdmin = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(ADMIN_PREVIEW_KEY);
    setAdminPreview(false);
    navigate('/admin');
  };

  const returnToParent = async () => {
    if (!actingAsStudent || returning) return;
    setReturning(true);
    try {
      const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');
      if (error) throw error;
      clearActiveStudent();
      navigate('/parent/family');
    } catch {
      setReturning(false);
    }
  };

  return <div className="relative min-h-screen">
    {adminPreview && <div className="fixed right-4 top-4 z-[70] lg:right-8 lg:top-5">
      <button
        type="button"
        onClick={returnToAdmin}
        aria-label="Volver al panel de administración"
        title="Volver al panel de administración"
        className="group inline-flex items-center gap-2 rounded-2xl border border-blue-200/80 bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-white focus:outline-none focus:ring-4 focus:ring-blue-200/60 dark:border-slate-700 dark:bg-[#121A2F]/95 dark:hover:bg-[#16243A]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1747B8] p-1.5 shadow-sm">
          <QuickBiteLogo className="h-full w-full" alt="Administración" />
        </span>
        <span className="hidden text-xs font-black text-slate-800 dark:text-white sm:inline">Volver a Admin</span>
      </button>
    </div>}

    {actingAsStudent && <div className={`sticky top-0 z-50 flex items-center justify-between gap-4 border-b px-5 py-3 shadow-sm backdrop-blur-xl lg:px-8 ${adminPreview ? 'pr-24 lg:pr-36' : ''} border-blue-200 bg-blue-50/95 text-blue-950`}><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold">Estás usando QuickBite como {activeStudent?.full_name}. Los pedidos, favoritos, puntos, billetera y demás cambios pertenecen a ese estudiante.</p></div><button type="button" onClick={() => void returnToParent()} disabled={returning} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"><ArrowLeft className="h-4 w-4" />{returning ? 'Volviendo…' : 'Volver a Padre'}</button></div>}

    <StudentMenuPage />
    <StudentMenuFavoritesOverlay />
    <Link to="/student/features" aria-label="Abrir centro de funciones" className="qb-feature-fab group fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-800 shadow-xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-white hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-white dark:hover:bg-slate-800/95">
      <LayoutGrid className="h-4 w-4 text-slate-500 transition-colors group-hover:text-emerald-600 dark:text-slate-300 dark:group-hover:text-emerald-300" />
      Funciones
    </Link>
    {adminPreview && <div className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 text-[11px] font-bold text-slate-500 shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300 lg:flex">
      <ShieldCheck className="h-3.5 w-3.5" /> Vista de estudiante desde Admin
    </div>}
  </div>;
}
