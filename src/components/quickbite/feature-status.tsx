import { useMemo, useState } from 'react';

const features = [
  ['Pedidos', 'Gestión y seguimiento de pedidos'],
  ['Carrito', 'Productos y cantidades'],
  ['Menú', 'Productos y categorías'],
  ['Stock', 'Disponibilidad de productos'],
  ['Favoritos', 'Acceso rápido a productos'],
  ['Recompra', 'Repetir pedidos anteriores'],
  ['Historial', 'Pedidos anteriores'],
  ['Realtime', 'Cambios de pedidos en vivo'],
  ['Notificaciones', 'Avisos de estado'],
  ['QR / Recogida', 'Identificación del pedido'],
  ['Pago', 'Confirmación del pedido'],
  ['Loyalty', 'Recompensas'],
  ['Pickup', 'Horario de recogida'],
  ['Dashboard', 'Resumen administrativo'],
  ['Estados', 'Flujo operativo del pedido'],
  ['Productos Admin', 'Alta, edición y baja'],
  ['Categorías Admin', 'Organización del catálogo'],
  ['Inventario', 'Control de existencias'],
  ['Usuarios', 'Gestión de acceso'],
  ['Estadísticas', 'Indicadores de operación'],
  ['Reportes', 'Información para gestión'],
  ['Excel', 'Exportación de información'],
  ['Auditoría', 'Registro de acciones'],
  ['Health', 'Estado de servicios'],
  ['Backups', 'Protección y recuperación'],
] as const;

export function FeatureStatus() {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => features.filter(([name, description]) => `${name} ${description}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <section className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-lg backdrop-blur-2xl dark:border-white/15 dark:bg-slate-900/65">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">QuickBite</p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">25 funcionalidades</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Accesos preparados para la experiencia de usuario y administración.</p>
        </div>
        <input aria-label="Buscar funcionalidad" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar…" className="rounded-2xl border border-white/70 bg-white/70 px-4 py-2 text-sm text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-500 focus:ring-4 dark:border-white/15 dark:bg-slate-800/70 dark:text-white" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(([name, description]) => (
          <div key={name} className="rounded-2xl border border-white/60 bg-white/55 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">✓</span>
              <div className="min-w-0"><h3 className="font-semibold text-slate-900 dark:text-white">{name}</h3><p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
