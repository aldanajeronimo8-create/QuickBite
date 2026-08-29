import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, CreditCard, Gift, GraduationCap, LayoutDashboard, LogOut, Package, ScanLine, ShoppingBag, Users, UtensilsCrossed } from 'lucide-react';
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
};

function NavItem({ path, label, icon: Icon, active, badge }: NavItemProps) {
  return (
    <Link
      to={path}
      className="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
      style={active ? { background: 'rgba(255,255,255,0.13)', color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' } : { color: '#BFDBFE' }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: navigationAccent, color: primaryColor }}>{badge}</span>}
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
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <aside className="fixed left-0 top-0 z-10 flex h-full w-64 flex-col shadow-xl" style={{ background: primaryColor }}>
        <div className="px-5 pb-5 pt-7">
          <div className="flex items-center gap-3"><QuickBiteLogo className="h-10 w-10 rounded-xl shadow-md" alt="QuickBite Administración" /><div><p className="text-base font-bold leading-tight text-white">QuickBite Admin</p><p className="text-xs" style={{ color: '#93C5FD' }}>Panel de control</p></div></div>
        </div>
        <div className="mx-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
        <nav className="flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Operaciones</p>
          <NavItem path="/admin" label="Dashboard" icon={LayoutDashboard} active={location.pathname === '/admin'} />
          <NavItem path="/admin/orders" label="Pedidos" icon={ShoppingBag} active={isCurrentPath('/admin/orders')} badge={pendingCount} />
          <NavItem path="/admin/payments" label="Pagos" icon={CreditCard} active={isCurrentPath('/admin/payments')} />
          <NavItem path="/admin/automation" label="Automatización" icon={Activity} active={isCurrentPath('/admin/automation')} />

          <p className="mb-2 mt-5 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Gestión</p>
          <NavItem path="/admin/inventory" label="Inventario" icon={Package} active={isCurrentPath('/admin/inventory')} />
          <NavItem path="/admin/menu" label="Menú" icon={UtensilsCrossed} active={isCurrentPath('/admin/menu')} />
          <NavItem path="/admin/verification" label="Verificación" icon={ScanLine} active={isCurrentPath('/admin/verification')} />
          <NavItem path="/admin/users" label="Usuarios" icon={Users} active={isCurrentPath('/admin/users')} />
          <NavItem path="/admin/loyalty" label="Puntos y premios" icon={Gift} active={isCurrentPath('/admin/loyalty')} />
        </nav>
        <div className="px-4 pb-5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>{user.full_name?.[0]?.toUpperCase() ?? 'A'}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user.full_name}</p><p className="truncate text-xs" style={{ color: '#93C5FD' }}>{user.role === 'both' ? 'Administrador y estudiante' : 'Administrador'}</p></div></div>
          {canAccessStudent(user.role) && <Link to="/menu" className="mb-2 flex w-full items-center justify-center rounded-md border px-3 py-2 text-xs font-semibold transition hover:bg-white/10" style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#DBEAFE' }}><GraduationCap className="mr-2 h-3.5 w-3.5" />Ver como estudiante</Link>}
          <Button onClick={handleSignOut} variant="outline" size="sm" className="w-full text-xs" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: '#BFDBFE' }}><LogOut className="mr-2 h-3.5 w-3.5" />Cerrar sesión</Button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen"><div className="p-8"><Outlet /></div></main>
      <Toaster position="top-center" />
    </div>
  );
}
