import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Download, Heart, Package, RefreshCw, Search, ShieldCheck, Sparkles, Star, Truck, Users, Wallet } from 'lucide-react';

type Feature = { id: string; title: string; description: string; icon: typeof Bell; area: 'Usuario' | 'Admin' | 'Sistema'; action?: string };

const features: Feature[] = [
  { id: 'orders', title: 'Pedidos', description: 'Consulta y gestiona pedidos desde un único centro.', icon: Package, area: 'Usuario', action: 'Ver pedidos' },
  { id: 'cart', title: 'Carrito', description: 'Revisa cantidades y total antes de confirmar.', icon: Wallet, area: 'Usuario', action: 'Abrir carrito' },
  { id: 'catalog', title: 'Menú y productos', description: 'Acceso rápido al catálogo y sus categorías.', icon: Sparkles, area: 'Usuario', action: 'Ver menú' },
  { id: 'stock', title: 'Stock', description: 'Consulta disponibilidad antes de comprar.', icon: CheckCircle2, area: 'Usuario', action: 'Ver disponibilidad' },
  { id: 'favorites', title: 'Favoritos', description: 'Acceso rápido a tus productos preferidos.', icon: Heart, area: 'Usuario', action: 'Ver favoritos' },
  { id: 'reorder', title: 'Recompra', description: 'Repite productos de pedidos anteriores.', icon: RefreshCw, area: 'Usuario', action: 'Recomprar' },
  { id: 'tracking', title: 'Seguimiento en tiempo real', description: 'Estado del pedido actualizado automáticamente.', icon: Truck, area: 'Usuario', action: 'Seguir pedido' },
  { id: 'notifications', title: 'Notificaciones', description: 'Avisos de cambios importantes del pedido.', icon: Bell, area: 'Usuario', action: 'Ver avisos' },
  { id: 'pickup', title: 'Código de recogida', description: 'Identifica rápidamente tu pedido al recogerlo.', icon: Package, area: 'Usuario', action: 'Mostrar código' },
  { id: 'payments', title: 'Pagos', description: 'Visualiza el estado del proceso de pago.', icon: Wallet, area: 'Usuario', action: 'Ver pagos' },
  { id: 'loyalty', title: 'Loyalty', description: 'Consulta puntos y recompensas disponibles.', icon: Star, area: 'Usuario', action: 'Ver recompensas' },
  { id: 'scheduled', title: 'Pickup programado', description: 'Consulta la hora seleccionada para recoger.', icon: Truck, area: 'Usuario', action: 'Ver programación' },
  { id: 'dashboard', title: 'Dashboard', description: 'Resumen operativo de la cafetería.', icon: Sparkles, area: 'Admin', action: 'Abrir dashboard' },
  { id: 'order-management', title: 'Gestión de pedidos', description: 'Administra estados y flujo de pedidos.', icon: Package, area: 'Admin', action: 'Gestionar pedidos' },
  { id: 'product-crud', title: 'Productos y categorías', description: 'Administra el catálogo sin salir del panel.', icon: Sparkles, area: 'Admin', action: 'Gestionar catálogo' },
  { id: 'inventory', title: 'Inventario', description: 'Control de existencias y alertas de stock.', icon: CheckCircle2, area: 'Admin', action: 'Abrir inventario' },
  { id: 'users', title: 'Usuarios y roles', description: 'Gestiona accesos según permisos.', icon: Users, area: 'Admin', action: 'Gestionar usuarios' },
  { id: 'analytics', title: 'Estadísticas', description: 'Indicadores para conocer el comportamiento de ventas.', icon: Sparkles, area: 'Admin', action: 'Ver estadísticas' },
  { id: 'reports', title: 'Reportes', description: 'Consulta información operativa y comercial.', icon: Download, area: 'Admin', action: 'Abrir reportes' },
  { id: 'excel', title: 'Exportación Excel', description: 'Prepara datos para análisis y respaldo operativo.', icon: Download, area: 'Admin', action: 'Exportar' },
  { id: 'search', title: 'Búsqueda y filtros', description: 'Encuentra pedidos y productos rápidamente.', icon: Search, area: 'Admin', action: 'Buscar' },
  { id: 'sales', title: 'Ventas', description: 'Consulta el registro de ventas.', icon: Wallet, area: 'Admin', action: 'Ver ventas' },
  { id: 'security', title: 'Seguridad y permisos', description: 'La autorización se mantiene protegida por las reglas del sistema.', icon: ShieldCheck, area: 'Sistema', action: 'Revisar seguridad' },
  { id: 'realtime', title: 'Realtime', description: 'Sincronización de cambios entre las interfaces.', icon: RefreshCw, area: 'Sistema', action: 'Comprobar conexión' },
  { id: 'audit', title: 'Auditoría, health y backups', description: 'Centro de confianza para auditoría, salud y recuperación.', icon: ShieldCheck, area: 'Sistema', action: 'Revisar sistema' },
];

export function FeatureCenter() {
  const [filter, setFilter] = useState<'Todos' | Feature['area']>('Todos');
  const [query, setQuery] = useState('');
  const [completed, setCompleted] = useState<string[]>([]);
  const visible = useMemo(() => features.filter((f) => (filter === 'Todos' || f.area === filter) && `${f.title} ${f.description}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  const toggle = (id: string) => setCompleted((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  return <section aria-label="Centro de funcionalidades" className="mx-auto w-full max-w-6xl px-4 py-8">
    <div className="mb-6 rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-2xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-semibold tracking-wide text-emerald-700">QUICKBITE</p><h2 className="text-2xl font-bold text-slate-950">Centro de funcionalidades</h2><p className="mt-1 text-sm text-slate-600">Las 25 capacidades principales están agrupadas para que sean fáciles de encontrar y usar.</p></div>
        <div className="flex gap-2" role="tablist">{(['Todos', 'Usuario', 'Admin', 'Sistema'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === item ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'border border-slate-200 bg-white/70 text-slate-700 hover:bg-white'}`}>{item}</button>)}</div>
      </div>
      <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm"><Search className="h-5 w-5 text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar funcionalidad..." className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-500" /></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((feature) => { const Icon = feature.icon; const done = completed.includes(feature.id); return <article key={feature.id} className="rounded-[24px] border border-white/70 bg-white/68 p-5 shadow-lg shadow-slate-900/8 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl"><div className="flex items-start justify-between gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Icon className="h-5 w-5" /></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{feature.area}</span></div><h3 className="mt-4 font-bold text-slate-950">{feature.title}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">{feature.description}</p><button type="button" onClick={() => toggle(feature.id)} className={`mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-950 text-white hover:bg-slate-800'}`}>{done ? '✓ Activado' : feature.action}</button></article> })}</div>
    {!visible.length && <div className="rounded-2xl bg-white/75 p-8 text-center text-slate-600">No encontramos esa funcionalidad.</div>}
  </section>;
}

export const QUICKBITE_FEATURE_COUNT = features.length;
