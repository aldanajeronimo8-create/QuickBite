import { Link } from 'react-router-dom';
import { BarChart3, Bell, Boxes, CreditCard, FileSpreadsheet, Gift, Heart, History, LayoutDashboard, LockKeyhole, Package, QrCode, RefreshCcw, ShieldCheck, ShoppingBag, Tags, Users, Wifi, Wrench, Zap } from 'lucide-react';

const items = [
  ['Pedidos', 'Gestiona, filtra y cambia estados.', '/admin/orders', ShoppingBag],
  ['Carrito y checkout', 'Selecciona productos y confirma la compra.', '/menu', Package],
  ['Menú y categorías', 'Catálogo y clasificación de productos.', '/admin/menu', Tags],
  ['Inventario', 'Stock, disponibilidad y control.', '/admin/inventory', Boxes],
  ['Favoritos', 'Acceso rápido a productos guardados.', '/student/features', Heart],
  ['Recompra e historial', 'Revisa compras anteriores y vuelve a pedir.', '/menu', RefreshCcw],
  ['Realtime', 'Sincronización de pedidos y catálogo.', '/admin/orders', Wifi],
  ['Notificaciones', 'Avisos de cambios de pedido y canjes.', '/menu', Bell],
  ['QR / recogida', 'Verificación de códigos de entrega.', '/admin/verification', QrCode],
  ['Pagos', 'Revisión y aprobación de pagos.', '/admin/payments', CreditCard],
  ['Loyalty', 'Puntos, premios y canjes.', '/admin/loyalty', Gift],
  ['Pickup programado', 'Gestión de recogidas y horarios.', '/admin/orders', Zap],
  ['Dashboard', 'Indicadores generales de operación.', '/admin', LayoutDashboard],
  ['Estados operativos', 'Flujo pendiente → preparando → listo → entregado.', '/admin/orders', RefreshCcw],
  ['Productos Admin', 'Crear, editar y eliminar productos.', '/admin/menu', Package],
  ['Categorías Admin', 'Gestionar categorías del catálogo.', '/admin/menu', Tags],
  ['Usuarios y roles', 'Administrar accesos y perfiles.', '/admin/users', Users],
  ['Autenticación y seguridad', 'Sesiones, protección y control de acceso.', '/admin/users', LockKeyhole],
  ['Estadísticas', 'Métricas de ventas y operación.', '/admin', BarChart3],
  ['Reportes', 'Informes para gestión.', '/admin/reports', BarChart3],
  ['Excel', 'Exportación de datos del sistema.', '/admin/reports', FileSpreadsheet],
  ['Auditoría', 'Registro de operaciones administrativas.', '/admin/history', History],
  ['Health checks', 'Estado y latencia de servicios.', '/admin/system', ShieldCheck],
  ['Backups', 'Supervisión de automatizaciones de respaldo.', '/admin/system', ShieldCheck],
  ['Automatización', 'Jobs y alertas operativas.', '/admin/system', Wrench],
] as const;

export function QuickBiteFeatureCenter() {
  return <div className="space-y-6">
    <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">QuickBite</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-black text-slate-900">Centro de funcionalidades</h1><p className="mt-1 text-sm text-slate-600">25 capacidades conectadas a las pantallas y servicios existentes.</p></div>
        <Link to="/admin" className="rounded-full bg-[#1747B8] px-4 py-2 text-sm font-bold text-white shadow-lg">Volver al dashboard</Link>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([name, description, path, Icon], index) => <Link key={name} to={path} className="group rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-200">
        <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600/10 text-blue-700"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-400">#{index + 1}</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700">Abrir</span></div><h2 className="mt-1 font-black text-slate-900">{name}</h2><p className="mt-1 text-sm leading-5 text-slate-600">{description}</p></div></div>
      </Link>)}
    </div>
  </div>;
}
