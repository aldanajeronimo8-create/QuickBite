import { Link } from 'react-router-dom';
import { LayoutGrid, Palette } from 'lucide-react';
import { AdminLayout } from './AdminLayout';

export function AdminExperienceLayout() {
  return <div className="relative min-h-screen">
    <AdminLayout />
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
      <Link to="/admin/appearance" aria-label="Abrir personalización visual" className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-[var(--qb-primary)] px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur-2xl transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-200">
        <Palette className="h-4 w-4" />
        Apariencia
      </Link>
      <Link to="/admin/features" aria-label="Abrir centro de funcionalidades" className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-[var(--qb-primary)] px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur-2xl transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-200">
        <LayoutGrid className="h-4 w-4" />
        Funciones
      </Link>
    </div>
  </div>;
}
