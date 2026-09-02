import { ArrowRight, BarChart3, Boxes, CreditCard, Gift, History, LayoutDashboard, LockKeyhole, Package, QrCode, RotateCcw, ShieldCheck, ShoppingBag, Tags, Users, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

type Feature = {
  name: string;
  description: string;
  path: string;
  icon: LucideIcon;
};

type FeatureGroup = {
  title: string;
  description: string;
  icon: LucideIcon;
  features: Feature[];
};

const groups: FeatureGroup[] = [
  {
    title: 'Operación diaria', description: 'Las funciones que se usan durante la jornada de la cafetería.', icon: ShoppingBag,
    features: [
      { name: 'Pedidos', description: 'Gestiona pedidos y avanza su estado hasta la entrega.', path: '/admin/orders', icon: ShoppingBag },
      { name: 'Pagos', description: 'Revisa y gestiona los pagos asociados a los pedidos.', path: '/admin/payments', icon: CreditCard },
      { name: 'Recargas de saldo', description: 'Revisa solicitudes de recarga y aprueba o rechaza cada una.', path: '/admin/wallet', icon: WalletCards },
      { name: 'Verificación / QR', description: 'Comprueba códigos y valida la recogida de pedidos.', path: '/admin/verification', icon: QrCode },
    ],
  },
  {
    title: 'Catálogo e inventario', description: 'Mantén disponible y actualizado lo que la cafetería ofrece.', icon: Package,
    features: [
      { name: 'Menú y categorías', description: 'Crea, edita y organiza productos del catálogo.', path: '/admin/menu', icon: Tags },
      { name: 'Inventario', description: 'Controla existencias, disponibilidad y stock bajo.', path: '/admin/inventory', icon: Boxes },
    ],
  },
  {
    title: 'Usuarios y beneficios', description: 'Gestiona cuentas y programas destinados a estudiantes.', icon: Users,
    features: [
      { name: 'Usuarios y roles', description: 'Administra perfiles, accesos y permisos.', path: '/admin/users', icon: Users },
      { name: 'Puntos y recompensas', description: 'Configura puntos, premios y canjes del programa de fidelización.', path: '/admin/loyalty', icon: Gift },
    ],
  },
  {
    title: 'Análisis y trazabilidad', description: 'Consulta resultados y revisa lo que ha ocurrido en QuickBite.', icon: BarChart3,
    features: [
      { name: 'Informes', description: 'Consulta métricas y genera reportes de gestión.', path: '/admin/reports', icon: BarChart3 },
      { name: 'Historial y auditoría', description: 'Revisa el registro de operaciones administrativas.', path: '/admin/history', icon: History },
    ],
  },
  {
    title: 'Sistema y mantenimiento', description: 'Supervisa la salud técnica y las tareas administrativas especiales.', icon: ShieldCheck,
    features: [
      { name: 'Estado del sistema', description: 'Comprueba salud, latencia, actividad y automatizaciones.', path: '/admin/system', icon: ShieldCheck },
      { name: 'Reiniciar flujo', description: 'Ejecuta el reinicio administrativo del flujo cuando sea necesario.', path: '/admin/reset', icon: RotateCcw },
    ],
  },
];

const totalFeatures = groups.reduce((total, group) => total + group.features.length, 0);

export function QuickBiteFeatureCenter() {
  return (
    <div className="space-y-7" data-testid="admin-feature-center">
      <header className="overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 p-6 shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-3xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700"><span className="rounded-full bg-emerald-50 px-3 py-1">QuickBite Admin</span><span className="text-slate-400">•</span><span>Accesos organizados</span></div><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Centro de funcionalidades</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Encuentra rápidamente qué puedes gestionar, dónde hacerlo y para qué sirve cada módulo. Cada tarjeta abre una pantalla administrativa concreta, sin accesos duplicados.</p></div><Link to="/admin" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#1747B8] px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-200"><LayoutDashboard className="h-4 w-4" />Ir al dashboard</Link></div>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold text-slate-600"><span className="rounded-full border border-slate-200 bg-white px-3 py-2">{totalFeatures} módulos administrativos</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Sin accesos repetidos</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Accesos directos</span></div>
      </header>
      {groups.map((group) => { const GroupIcon = group.icon; return <section key={group.title} aria-labelledby={`group-${group.title}`}><div className="mb-4 flex items-start gap-3 px-1"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><GroupIcon className="h-5 w-5" /></div><div><h2 id={`group-${group.title}`} className="text-xl font-black text-slate-900">{group.title}</h2><p className="mt-0.5 text-sm text-slate-600">{group.description}</p></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{group.features.map((feature) => { const Icon = feature.icon; return <Link key={feature.path} to={feature.path} className="group relative flex min-h-[190px] flex-col rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-100"><div className="flex items-start justify-between gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white"><Icon className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" /></div><h3 className="mt-5 text-base font-black text-slate-900">{feature.name}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{feature.description}</p><span className="mt-4 text-xs font-black uppercase tracking-wide text-blue-700">Abrir módulo</span></Link>; })}</div></section>; })}
      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-slate-700"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><p className="font-black text-slate-900">Navegación administrativa clara</p><p className="mt-1 leading-6">Las funciones técnicas como salud, auditoría y automatizaciones se presentan como módulos propios; las funciones de una misma pantalla ya no aparecen como botones separados que llevan al mismo lugar.</p></div></div></div>
    </div>
  );
}
