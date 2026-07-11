import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Download,
  Gift,
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  ShoppingCart,
  ShoppingBag,
  type LucideIcon,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';

const P = '#1E3A8A';
const S = '#14532D';
const OK = '#22C55E';

type NavItemProps = {
  path: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  exact?: boolean;
  badge?: number;
};

function NavItem({ path, label, icon: Icon, pathname, exact = false, badge }: NavItemProps) {
  const active = exact
    ? pathname === path
    : pathname === path || (pathname.startsWith(path) && path !== '/admin');

  return (
    <Link
      to={path}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all"
      style={
        active
          ? {
              background: 'rgba(255,255,255,0.13)',
              color: '#fff',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
            }
          : { color: '#BFDBFE' }
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: OK, color: '#052e16' }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { loadData, orders } = useDataStore();

  useEffect(() => {
    loadData();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) return null;

  const pendingCount = orders.filter((order) => order.status === 'pending').length;

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <aside
        className="fixed left-0 top-0 h-full w-64 flex flex-col z-10 shadow-xl"
        style={{ background: P }}
      >
        <div className="px-5 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shadow-md"
              style={{ background: OK, color: '#052e16' }}
            >
              Q
            </div>
            <div>
              <p className="font-bold text-white text-base leading-tight">QuickBite Admin</p>
              <p className="text-xs" style={{ color: '#93C5FD' }}>
                Panel de Control
              </p>
            </div>
          </div>
        </div>

        <div className="mx-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }} />

        <nav className="px-3 flex-1 overflow-y-auto">
          <p
            className="text-xs font-semibold uppercase tracking-widest px-3 mb-2"
            style={{ color: '#93C5FD' }}
          >
            Operaciones
          </p>
          <NavItem
            path="/admin"
            label="Dashboard"
            icon={LayoutDashboard}
            pathname={location.pathname}
            exact
          />
          <NavItem
            path="/admin/orders"
            label="Pedidos"
            icon={ShoppingBag}
            pathname={location.pathname}
            badge={pendingCount}
          />
          <NavItem
            path="/admin/payments"
            label="Pagos"
            icon={CreditCard}
            pathname={location.pathname}
          />
          <NavItem
            path="/menu"
            label="Ir a comprar"
            icon={ShoppingCart}
            pathname={location.pathname}
          />

          <p
            className="text-xs font-semibold uppercase tracking-widest px-3 mb-2 mt-5"
            style={{ color: '#93C5FD' }}
          >
            Gestión
          </p>
          <NavItem
            path="/admin/inventory"
            label="Inventario"
            icon={Package}
            pathname={location.pathname}
          />
          <NavItem
            path="/admin/menu"
            label="Menú"
            icon={UtensilsCrossed}
            pathname={location.pathname}
          />
          <NavItem
            path="/admin/verification"
            label="Verificación"
            icon={ScanLine}
            pathname={location.pathname}
          />
          <NavItem
            path="/admin/loyalty"
            label="Puntos y premios"
            icon={Gift}
            pathname={location.pathname}
          />
          <NavItem path="/admin/users" label="Usuarios" icon={Users} pathname={location.pathname} />
          <NavItem
            path="/admin/students"
            label="Estudiantes"
            icon={Users}
            pathname={location.pathname}
          />
        </nav>

        <div className="mx-3 mb-3 rounded-xl p-3" style={{ background: S }}>
          <div className="flex items-center gap-2 mb-1">
            <Download className="w-3.5 h-3.5" style={{ color: OK }} />
            <p className="text-white text-xs font-semibold">Exportar datos</p>
          </div>
          <p className="text-xs mb-2.5" style={{ color: '#86EFAC' }}>
            Reporte del período disponible
          </p>
          <button
            className="w-full text-xs font-bold py-1.5 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: OK, color: '#052e16' }}
          >
            ↓ Descargar CSV
          </button>
        </div>

        <div
          className="px-4 pb-5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            >
              {user.full_name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
              <p className="text-xs truncate" style={{ color: '#93C5FD' }}>
                Administrador
              </p>
            </div>
          </div>
          <Button
            onClick={handleSignOut}
            variant="outline"
            size="sm"
            className="w-full text-xs"
            style={{
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.2)',
              color: '#BFDBFE',
            }}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <div className="p-8">
          <Outlet />
        </div>
      </main>

      <Toaster position="top-center" />
    </div>
  );
}
