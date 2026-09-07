import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Shield } from 'lucide-react';
import { StudentMenuPage } from '../pages/student/StudentMenuPage';
import { StudentMenuFavoritesOverlay } from '../components/student/StudentMenuFavoritesOverlay';
import { useStudentContextStore } from '../../store/studentContextStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { canAccessAdmin } from '../../lib/access';
import { isVisualPreviewMode } from '../contexts/VisualThemeProvider';

export function StudentExperienceLayout() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const currentUser = useAuthStore((state) => state.user);
  const [returning, setReturning] = useState(false);
  const actingAsStudent = Boolean(activeStudent);
  const visualPreview = isVisualPreviewMode();
  const adminPreviewFlag = !visualPreview && typeof window !== 'undefined' && window.sessionStorage.getItem('quickbite_admin_student_preview') === '1';
  const adminPreview = adminPreviewFlag && Boolean(currentUser && canAccessAdmin(currentUser.role));

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

  const returnToAdmin = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('quickbite_admin_student_preview');
    navigate('/admin');
  };

  return <div className="qb-admin-preview-shell relative min-h-screen">
    {adminPreview && <div data-qb-admin-preview="true" className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-3 text-slate-900 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#070D19]/95 dark:text-[#F5F7FA] lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-[#092620] dark:text-emerald-300">
          <Shield className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700 dark:text-emerald-300">Vista previa administrativa</p>
          <p className="truncate text-sm font-semibold text-slate-600 dark:text-[#AAB7C9]">Estás viendo la interfaz de estudiante sin cerrar tu sesión de administrador.</p>
        </div>
      </div>
      <button type="button" onClick={returnToAdmin} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700/70 dark:bg-[#111A2E] dark:text-white dark:hover:border-emerald-500/50 dark:hover:bg-[#16243A]">
        <ArrowLeft className="h-4 w-4" />Volver a Admin
      </button>
    </div>}

    {actingAsStudent && !adminPreview && <div className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-blue-200 bg-blue-50/95 px-5 py-3 text-blue-950 shadow-sm backdrop-blur-xl lg:px-8"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold">Estás usando QuickBite como {activeStudent?.full_name}. Los pedidos, favoritos, puntos, billetera y demás cambios pertenecen a ese estudiante.</p></div><button type="button" onClick={() => void returnToParent()} disabled={returning} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"><ArrowLeft className="h-4 w-4" />{returning ? 'Volviendo…' : 'Volver a Padre'}</button></div>}

    <StudentMenuPage />
    <StudentMenuFavoritesOverlay />
    <Link to="/student/features" aria-label="Abrir centro de funciones" className="qb-feature-fab group fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/85 px-4 py-3 text-sm font-medium text-slate-800 shadow-xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-white hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700/60 dark:bg-slate-900/90 dark:text-white dark:hover:bg-slate-800/95">
      <LayoutGrid className="h-4 w-4 text-slate-500 transition-colors group-hover:text-emerald-600 dark:text-slate-300 dark:group-hover:text-emerald-300" />
      Funciones
    </Link>
  </div>;
}
