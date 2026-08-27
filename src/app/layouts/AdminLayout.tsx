import { useEffect, useState } from 'react';
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
import { exportActiveSalesToGoogleSheets } from '../../services/googleSheetsExportService';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

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
  const [exporting, setExporting] = useState(false);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const activeOrders = orders.filter((order) => !order.exported_at);
  const activeTotal = activeOrders.reduce((total, order) => total + Number(order.total), 0);

  const handleExport = async () => {
    setExporting(true);
    setExportStatus('Preparando información...');
    try {
      setExportStatus('Enviando ventas a Google Sheets...');
      const result = await exportActiveSalesToGoogleSheets();
      setExportStatus('Verificando exportación...');
      await loadData({ silent: true });
      toast.success(
        `Ventas exportadas correctamente a Google Sheets (${result.exportedCount}). La gestión de pagos ha sido reiniciada.`,
      );
      setConfirmingExport(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible exportar las ventas a Google Sheets. Los datos no fueron modificados. Puedes intentarlo nuevamente.',
      );
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };

  if (!user) return null;

  const pendingCount = activeOrders.filter((order) => order.status === 'pending').length;

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
            Cierre seguro de pagos actuales
          </p>
          <button
            type="button"
            onClick={() => setConfirmingExport(true)}
            disabled={exporting}
            className="w-full text-xs font-bold py-1.5 rounded-lg transition-opacity hover:opacity-90"
            style={{ background: OK, color: '#052e16' }}
          >
            Exportar a Google Sheets y reiniciar
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

      <Dialog open={confirmingExport} onOpenChange={(open) => !exporting && setConfirmingExport(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar ventas a Google Sheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              ¿Deseas exportar las ventas actuales a Google Sheets y reiniciar la gestión de pagos?
            </p>
            <div className="rounded-lg bg-slate-50 p-3">
              <p><b>{activeOrders.length}</b> venta(s) serán exportadas.</p>
              <p><b>${activeTotal.toLocaleString()}</b> es el total del período.</p>
            </div>
            <p className="text-amber-800">
              Después del reinicio, estas ventas dejarán de aparecer en Gestión de Pagos. No se
              modificará nada si Google Sheets no confirma la recepción completa.
            </p>
            {exportStatus && <p className="font-medium text-blue-800">{exportStatus}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={exporting} onClick={() => setConfirmingExport(false)}>
              Cancelar
            </Button>
            <Button disabled={exporting} className="bg-green-700 text-white hover:bg-green-800" onClick={handleExport}>
              {exporting ? 'Procesando...' : 'Exportar y reiniciar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
