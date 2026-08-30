import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CreditCard, Gift, GraduationCap, LayoutDashboard, LogOut, Package, ScanLine, ShoppingBag, Users, UtensilsCrossed } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { canAccessStudent } from '../../lib/access';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

type NavItemProps = { path: string; label: string; icon: LucideIcon; active: boolean; badge?: number };

function NavItem({ path, label, icon: Icon, active, badge }: NavItemProps) {
  return (
    <Link
      to={path}
      className="mb-1 flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01]"
      style={active ? { background: 'rgba(255,90,54,0.14)', color: '#fff', borderColor: 'rgba(255,90,54,0.26)', boxShadow: '0 8px 24px rgba(255,90,54,0.10)' } : { color: '#9CA3AF' }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full border border-[#FF5A36]/30 bg-[#FF5A36]/15 px-2 py-0.5 text-xs font-bold text-[#FFB19D]">{badge}</span>
      )}
    </Link>
  );
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { loadData, orders } = useDataStore();

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  if (!user) return null;

  const pendingCount = orders.filter((order) => !order.admin_hidden && order.status === 'pending').length;
  const isCurrentPath = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div className="qb-admin-shell min-h-screen bg-[#0D0F12] text-slate-100">
      <aside className="qb-admin-sidebar fixed left-0 top-0 z-10 flex h-full w-64 flex-col border-r border-white/10 bg-black/30 shadow-[14px_0_40px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="px-5 pb-5 pt-7">
          <div className="flex items-center gap-3">
            <QuickBiteLogo className="h-10 w-10 rounded-xl shadow-lg shadow-black/20" alt="QuickBite Administración" />
            <div><p className="text-base font-bold leading-tight text-white">QuickBite Admin</p><p className="text-xs text-slate-500">Panel de control</p></div>
          </div>
        </div>
        <div className="mx-4 mb-4 border-b border-white/10" />
        <nav className="flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Operaciones</p>
          <NavItem path="/admin" label="Dashboard" icon={LayoutDashboard} active={location.pathname === '/admin'} />
          <NavItem path="/admin/orders" label="Pedidos" icon={ShoppingBag} active={isCurrentPath('/admin/orders')} badge={pendingCount} />
          <NavItem path="/admin/payments" label="Pagos" icon={CreditCard} active={isCurrentPath('/admin/payments')} />
          <NavItem path="/admin/reports" label="Informes" icon={BarChart3} active={isCurrentPath('/admin/reports')} />
          <NavItem path="/admin/automation" label="Automatización" icon={Activity} active={isCurrentPath('/admin/automation')} />

          <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Gestión</p>
          <NavItem path="/admin/inventory" label="Inventario" icon={Package} active={isCurrentPath('/admin/inventory')} />
          <NavItem path="/admin/menu" label="Menú" icon={UtensilsCrossed} active={isCurrentPath('/admin/menu')} />
          <NavItem path="/admin/verification" label="Verificación" icon={ScanLine} active={isCurrentPath('/admin/verification')} />
          <NavItem path="/admin/users" label="Usuarios" icon={Users} active={isCurrentPath('/admin/users')} />
          <NavItem path="/admin/loyalty" label="Puntos y premios" icon={Gift} active={isCurrentPath('/admin/loyalty')} />
        </nav>
        <div className="border-t border-white/10 px-4 pb-5 pt-3">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-bold text-white">{user.full_name?.[0]?.toUpperCase() ?? 'A'}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user.full_name}</p><p className="truncate text-xs text-slate-500">{user.role === 'both' ? 'Administrador y estudiante' : 'Administrador'}</p></div>
          </div>
          {canAccessStudent(user.role) && <Link to="/menu" className="mb-2 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08]"><GraduationCap className="mr-2 h-3.5 w-3.5" />Ver como estudiante</Link>}
          <Button onClick={handleSignOut} variant="outline" size="sm" className="w-full text-xs"><LogOut className="mr-2 h-3.5 w-3.5" />Cerrar sesión</Button>
        </div>
      </aside>
      <main className="qb-admin-main ml-64 min-h-screen">
        <div className="mx-auto max-w-[1600px] p-6 sm:p-8"><Outlet /></div>
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
