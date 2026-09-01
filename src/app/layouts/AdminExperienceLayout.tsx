import { useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { StudentExperienceLayout } from './StudentExperienceLayout';

export function AdminExperienceLayout() {
  const [splitPreview, setSplitPreview] = useState(false);

  if (splitPreview) {
    return (
      <div className="fixed inset-0 z-[100] grid grid-cols-2 bg-slate-950">
        <section className="relative min-w-0 overflow-hidden bg-slate-50 [transform:translateZ(0)]">
          <div className="pointer-events-none absolute left-3 top-3 z-[110] rounded-full bg-emerald-700 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg">
            Student
          </div>
          <StudentExperienceLayout />
        </section>
        <section className="relative min-w-0 overflow-hidden bg-white [transform:translateZ(0)]">
          <div className="pointer-events-none absolute left-3 top-3 z-[110] rounded-full bg-blue-700 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg">
            Admin
          </div>
          <AdminLayout />
        </section>
        <button
          type="button"
          onClick={() => setSplitPreview(false)}
          aria-label="Cerrar vista dividida"
          title="Cerrar vista dividida"
          className="fixed left-1/2 top-3 z-[120] -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-2xl ring-1 ring-white/20 hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
          Cerrar vista dividida
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <AdminLayout />
      <button
        type="button"
        onClick={() => setSplitPreview(true)}
        aria-label="Ver como estudiante"
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border border-white/40 bg-[#1747B8]/95 px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-200"
      >
        <LayoutGrid className="h-4 w-4" />
        Ver como estudiante
      </button>
    </div>
  );
}
