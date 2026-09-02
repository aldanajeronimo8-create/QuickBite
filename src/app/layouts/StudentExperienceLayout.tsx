import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Shield } from 'lucide-react';
import { StudentMenuPage } from '../pages/student/StudentMenuPage';
import { StudentMenuFavoritesOverlay } from '../components/student/StudentMenuFavoritesOverlay';
import { StudentOrderWindows } from '../components/student/StudentOrderWindows';
import { useStudentContextStore } from '../../store/studentContextStore';
import { requireSupabaseClient } from '../../lib/supabase';

export function StudentExperienceLayout() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const [returning, setReturning] = useState(false);
  const actingAsStudent = Boolean(activeStudent);
  const adminPreview = typeof window !== 'undefined'
    && window.sessionStorage.getItem('quickbite_admin_student_preview') === '1';

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

  return <div className="relative min-h-screen">
    {adminPreview && <div className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-blue-200 bg-blue-950/95 px-5 py-3 text-white shadow-sm backdrop-blur-xl lg:px-8"><div className="flex min-w-0 items-center gap-3"><Shield className="h-5 w-5 shrink-0 text-blue-200" aria-hidden="true"/><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-200">Vista previa administrativa</p><p className="truncate text-sm font-bold">Estás viendo la interfaz de estudiante sin cerrar tu sesión de administrador.</p></div></div><button type="button" onClick={returnToAdmin} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-900 shadow-sm hover:bg-blue-50"><ArrowLeft className="h-4 w-4"/>Volver a Admin</button></div>}
    {actingAsStudent && !adminPreview && <div className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-blue-200 bg-blue-50/95 px-5 py-3 text-blue-950 shadow-sm backdrop-blur-xl lg:px-8"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold">Estás usando QuickBite como {activeStudent?.full_name}. Los pedidos, favoritos, puntos, billetera y demás cambios pertenecen a ese estudiante.</p></div><button type="button" onClick={() => void returnToParent()} disabled={returning} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"><ArrowLeft className="h-4 w-4"/>{returning ? 'Volviendo…' : 'Volver a Padre'}</button></div>}
    <StudentOrderWindows />
    <StudentMenuPage />
    <StudentMenuFavoritesOverlay />
    <Link to="/student/features" aria-label="Abrir centro de funciones" className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/75 px-4 py-3 text-sm font-black text-slate-800 shadow-xl backdrop-blur-2xl transition hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-emerald-200"><LayoutGrid className="h-4 w-4 text-emerald-700" />Funciones</Link>
  </div>;
}
