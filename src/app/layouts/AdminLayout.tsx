import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Gift, GraduationCap, LayoutDashboard, LogOut, Menu, Package, ScanLine, ShoppingBag, Users, UtensilsCrossed, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { canAccessStudent } from '../../lib/access';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

const primaryColor = '#1E3A8A';
const navigationAccent = '#DBEAFE';

type NavItemProps = {
  path: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  collapsed?: boolean;
};

function NavItem({ path, label, icon: Icon, active, badge, collapsed = false }: NavItemProps) {
  return (
    <Link
      to={path}
      title={collapsed ? label : undefined}
      className={`mb-0.5 flex items-center rounded-lg py-2.5 text-sm font-medium transition-all ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
      style={
        active
          ? { background: 'rgba(255,255,255,0.13)', color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }
          : { color: '#BFDBFE' }
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge != null && badge > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: navigationAccent, color: primaryColor }}>{badge}</span>}
      {collapsed && badge != null && badge > 0 && <span className="absolute ml-6 mt-[-18px] h-2.5 w-2.5 rounded-full" style={{ background: navigationAccent }} aria-label={`${badge} pendientes`} />}
    </Link>
  );
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { loadData, orders } = useDataStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) return null;

  const pendingCount = orders.filter((order) => !order.admin_hidden && order.status === 'pending').length;
  const isCurrentPath = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const sidebarWidth = sidebarCollapsed ? 'lg:w-20' : 'lg:w-64';
  const mainMargin = sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-72 flex-col shadow-xl transition-all duration-200 lg:w-64 ${sidebarWidth} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: primaryColor }}
      >
        <div className={`px-5 pb-5 pt-7 ${sidebarCollapsed ? 'lg:px-3' : ''}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <QuickBiteLogo className="h-10 w-10 shrink-0 rounded-xl shadow-md" alt="QuickBite Administración" />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight text-white">QuickBite Admin</p>
                <p className="text-xs" style={{ color: '#93C5FD' }}>Panel de control</p>
              </div>
            )}
            <button
              type="button"
              className="ml-auto rounded-lg p-2 text-blue-100 hover:bg-white/10 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Cerrar menú lateral"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mx-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }} />

        <nav className={`flex-1 overflow-y-auto px-3 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
          {!sidebarCollapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Operaciones</p>}
          <NavItem path="/admin" label="Dashboard" icon={LayoutDashboard} active={location.pathname === '/admin'} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/orders" label="Pedidos" icon={ShoppingBag} active={isCurrentPath('/admin/orders')} badge={pendingCount} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/payments" label="Pagos" icon={CreditCard} active={isCurrentPath('/admin/payments')} collapsed={sidebarCollapsed} />

          {!sidebarCollapsed && <p className="mb-2 mt-5 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Gestión</p>}
          {sidebarCollapsed && <div className="my-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />}
          <NavItem path="/admin/inventory" label="Inventario" icon={Package} active={isCurrentPath('/admin/inventory')} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/menu" label="Menú" icon={UtensilsCrossed} active={isCurrentPath('/admin/menu')} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/verification" label="Verificación" icon={ScanLine} active={isCurrentPath('/admin/verification')} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/users" label="Usuarios" icon={Users} active={isCurrentPath('/admin/users')} collapsed={sidebarCollapsed} />
          <NavItem path="/admin/loyalty" label="Puntos y premios" icon={Gift} active={isCurrentPath('/admin/loyalty')} collapsed={sidebarCollapsed} />
        </nav>

        <div className={`px-4 pb-5 pt-3 ${sidebarCollapsed ? 'lg:px-2' : ''}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {!sidebarCollapsed && (
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>{user.full_name?.[0]?.toUpperCase() ?? 'A'}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
                <p className="truncate text-xs" style={{ color: '#93C5FD' }}>{user.role === 'both' ? 'Administrador y estudiante' : 'Administrador'}</p>
              </div>
            </div>
          )}
          {canAccessStudent(user.role) && (
            <Link to="/menu" title={sidebarCollapsed ? 'Ver como estudiante' : undefined} className={`mb-2 flex w-full items-center rounded-md border py-2 text-xs font-semibold transition hover:bg-white/10 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-center px-3'}`} style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#DBEAFE' }}>
              <GraduationCap className={sidebarCollapsed ? 'h-4 w-4' : 'mr-2 h-3.5 w-3.5'} />
              {!sidebarCollapsed && 'Ver como estudiante'}
            </Link>
          )}
          <Button onClick={handleSignOut} variant="outline" size="sm" title={sidebarCollapsed ? 'Cerrar sesión' : undefined} className="w-full text-xs" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: '#BFDBFE' }}>
            <LogOut className={sidebarCollapsed ? 'h-4 w-4' : 'mr-2 h-3.5 w-3.5'} />
            {!sidebarCollapsed && 'Cerrar sesión'}
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMobileSidebarOpen(true)} className="rounded-xl p-2 text-blue-900 hover:bg-blue-50" aria-label="Abrir menú lateral">
          <Menu className="h-6 w-6" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <QuickBiteLogo className="h-8 w-8 rounded-lg" alt="QuickBite" />
          <span className="font-black text-blue-900">QuickBite Admin</span>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setSidebarCollapsed((value) => !value)}
        className="fixed bottom-5 left-4 z-50 hidden h-10 w-10 items-center justify-center rounded-full bg-blue-900 text-white shadow-lg transition hover:bg-blue-800 lg:flex"
        title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
        aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
      >
        {sidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
      </button>

      <main className={`${mainMargin} min-h-screen transition-all duration-200`}><div className="p-4 sm:p-6 lg:p-8"><Outlet /></div></main>
      <Toaster position="top-center" />
    </div>
  );
}
