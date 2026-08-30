import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { StudentMenuPage } from '../pages/student/StudentMenuPage';

export function StudentExperienceLayout() {
  return <div className="relative min-h-screen">
    <StudentMenuPage />
    <Link to="/student/features" aria-label="Abrir centro de funciones" className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/75 px-4 py-3 text-sm font-black text-slate-800 shadow-xl backdrop-blur-2xl transition hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-emerald-200">
      <LayoutGrid className="h-4 w-4 text-emerald-700" />
      Funciones
    </Link>
  </div>;
}
