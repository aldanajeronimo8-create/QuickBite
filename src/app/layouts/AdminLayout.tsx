import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bell, CheckCheck, CreditCard, Gift, GraduationCap, LayoutDashboard, LogOut, Menu, Package, RotateCcw, ScanLine, ShoppingBag, Users, UtensilsCrossed, WalletCards, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { canAccessStudent } from '../../lib/access';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';
import { requireSupabaseClient } from '../../lib/supabase';
import { isVisualPreviewMode } from '../contexts/VisualThemeProvider';

const primaryColor = 'var(--qb-primary, #1747B8)';
const navigationAccent = 'var(--qb-secondary, #E0ECFF)';
type AdminSection = 'dashboard' | 'orders' | 'payments' | 'wallet' | 'inventory' | 'menu' | 'verification' | 'users' | 'loyalty' | 'reports' | 'history' | 'system' | 'features';
type AdminNotification = { id: string; section: AdminSection; title: string; body: string; entity_type: string | null; entity_id: string | null; created_at: string; read_at: string | null };

type NavItemProps = { path: string; label: string; icon: LucideIcon; active: boolean; badge?: number; hasUnread?: boolean; collapsed?: boolean; };

function NavItem({ path, label, icon: Icon, active, badge, hasUnread, collapsed = false }: NavItemProps) {
  return <Link to={path} title={collapsed ? label : undefined} className={`admin-nav-link relative mb-0.5 flex items-center rounded-2xl py-2.5 text-sm font-medium transition-all ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}`} style={active ? { background: 'rgba(255,255,255,0.13)', color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' } : { color: '#BFDBFE' }}>
    <Icon className="h-4 w-4 shrink-0" />
    {!collapsed && <span className="flex-1">{label}</span>}
    {!collapsed && hasUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-400 shadow-sm" aria-label="Tiene actividad nueva" />}
    {!collapsed && badge != null && badge > 0 && <span className="rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: navigationAccent, color: primaryColor }}>{badge}</span>}
    {collapsed && (hasUnread || (badge != null && badge > 0)) && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-400" aria-label={`${badge ?? 1} pendientes`} />}
  </Link>;
}

const sectionForPath = (pathname: string): AdminSection => {
  if (pathname.startsWith('/admin/orders')) return 'orders';
  if (pathname.startsWith('/admin/payments')) return 'payments';
  if (pathname.startsWith('/admin/wallet')) return 'wallet';
  if (pathname.startsWith('/admin/inventory')) return 'inventory';
  if (pathname.startsWith('/admin/menu')) return 'menu';
  if (pathname.startsWith('/admin/verification')) return 'verification';
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/admin/loyalty')) return 'loyalty';
  if (pathname.startsWith('/admin/reports')) return 'reports';
  if (pathname.startsWith('/admin/history')) return 'history';
  if (pathname.startsWith('/admin/system') || pathname.startsWith('/admin/reset')) return 'system';
  if (pathname.startsWith('/admin/features')) return 'features';
  return 'dashboard';
};

const sectionPath: Record<AdminSection, string> = {
  dashboard: '/admin', orders: '/admin/orders', payments: '/admin/payments', wallet: '/admin/wallet', inventory: '/admin/inventory', menu: '/admin/menu', verification: '/admin/verification', users: '/admin/users', loyalty: '/admin/loyalty', reports: '/admin/reports', history: '/admin/history', system: '/admin/system', features: '/admin/features',
};

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { loadData, orders } = useDataStore();
  const preview = isVisualPreviewMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  const notificationInitialized = useRef(false);
  const latestNotificationAt = useRef<string | null>(null);

  useEffect(() => {
    if (!user || preview) return;
    void loadData();
  }, [loadData, preview, user]);

  const loadNotifications = useCallback(async () => {
    if (preview || !user || user.role !== 'admin' && user.role !== 'both') return;
    const { data, error } = await requireSupabaseClient().from('admin_notifications').select('id,section,title,body,entity_type,entity_id,created_at,read_at').eq('admin_user_id', user.id).is('read_at', null).order('created_at', { ascending: false }).limit(80);
    if (error) return;
    const next = (data ?? []) as AdminNotification[];
    const previous = latestNotificationAt.current;
    if (notificationInitialized.current && previous) next.filter((item) => item.created_at > previous).reverse().slice(0, 3).forEach((item) => toast.info(item.title, { description: item.body }));
    if (next[0]?.created_at) latestNotificationAt.current = next[0].created_at;
    notificationInitialized.current = true;
    setNotifications(next);
  }, [preview, user]);

  useEffect(() => {
    if (preview) return;
    void loadNotifications();
    const id = window.setInterval(() => void loadNotifications(), 7000);
    return () => window.clearInterval(id);
  }, [loadNotifications, preview]);

  const markSectionRead = useCallback(async (section: AdminSection) => {
    if (preview || !user) return;
    try {
      await requireSupabaseClient().rpc('mark_admin_notifications_read', { p_section: section });
      setNotifications((current) => current.filter((item) => item.section !== section));
    } catch {
      // The section remains usable even when read-state persistence is temporarily unavailable.
    }
  }, [preview, user]);

  const markAllNotificationsRead = useCallback(async () => {
    if (preview || !user || isClearingNotifications || notifications.length === 0) return;
    setIsClearingNotifications(true);
    try {
      const { error } = await requireSupabaseClient().rpc('mark_admin_notifications_read', { p_section: null });
      if (error) throw error;
      setNotifications([]);
      setNotificationOpen(true);
      toast.success('Notificaciones marcadas como leídas');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron marcar las notificaciones como leídas.');
      await loadNotifications();
    } finally { setIsClearingNotifications(false); }
  }, [isClearingNotifications, loadNotifications, notifications.length, preview, user]);

  useEffect(() => {
    if (preview || !user) return;
    void markSectionRead(sectionForPath(location.pathname));
  }, [location.pathname, markSectionRead, preview, user]);

  useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);
  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  const openStudentPreview = () => {
    if (preview) return;
    if (typeof window !== 'undefined') window.sessionStorage.setItem('quickbite_admin_student_preview', '1');
    navigate('/menu?from=admin');
  };

  const unreadBySection = useMemo(() => { const counts = {} as Record<AdminSection, number>; notifications.forEach((item) => { counts[item.section] = (counts[item.section] ?? 0) + 1; }); return counts; }, [notifications]);
  if (!user) return null;
  const unreadTotal = notifications.length;
  const pendingCount = orders.filter((order) => !order.admin_hidden && order.status === 'pending').length;
  const isCurrentPath = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const sidebarContentCollapsed = sidebarCollapsed && !mobileSidebarOpen;
  const sidebarWidth = sidebarCollapsed ? 'lg:w-20' : 'lg:w-64';
  const mainMargin = sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  return <div className="admin-shell min-h-screen" style={{ background: 'var(--qb-background, #F8FAFC)' }}>
    {mobileSidebarOpen && <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />}
    <aside className={`admin-sidebar fixed left-0 top-0 z-40 flex h-full w-72 flex-col shadow-xl transition-[width,transform] duration-200 ${sidebarWidth} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`} style={{ backgroundColor: primaryColor, backgroundImage: 'none' }}>
      <div className={`px-5 pb-5 pt-7 ${sidebarContentCollapsed ? 'lg:px-3' : ''}`}><div className={`flex items-center ${sidebarContentCollapsed ? 'justify-center' : 'gap-3'}`}><QuickBiteLogo className="h-10 w-10 shrink-0 rounded-xl shadow-md" alt="QuickBite Administración" />{!sidebarContentCollapsed && <div className="min-w-0"><p className="text-base font-bold leading-tight text-white">QuickBite Admin</p><p className="text-xs" style={{ color: '#93C5FD' }}>Panel de control</p></div>}<button type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} className="ml-auto hidden rounded-full p-2 text-blue-100 hover:bg-white/10 lg:inline-flex" aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú'} title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}><Menu className="h-5 w-5" /></button><button type="button" className="ml-auto rounded-full p-2 text-blue-100 hover:bg-white/10 lg:hidden" onClick={() => setMobileSidebarOpen(false)} aria-label="Cerrar menú lateral"><X className="h-5 w-5" /></button></div></div>
      <div className="mx-4 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
      <nav className={`flex-1 overflow-y-auto px-3 ${sidebarContentCollapsed ? 'lg:px-2' : ''}`}>
        {!sidebarContentCollapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Operaciones</p>}
        <NavItem path="/admin" label="Dashboard" icon={LayoutDashboard} active={location.pathname === '/admin'} hasUnread={Boolean(unreadBySection.dashboard)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/orders" label="Pedidos" icon={ShoppingBag} active={isCurrentPath('/admin/orders')} badge={pendingCount} hasUnread={Boolean(unreadBySection.orders)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/payments" label="Pagos" icon={CreditCard} active={isCurrentPath('/admin/payments')} hasUnread={Boolean(unreadBySection.payments)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/wallet" label="Recargas de saldo" icon={WalletCards} active={isCurrentPath('/admin/wallet')} hasUnread={Boolean(unreadBySection.wallet)} collapsed={sidebarContentCollapsed} />
        {!sidebarContentCollapsed && <p className="mb-2 mt-5 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#93C5FD' }}>Gestión</p>}
        {sidebarContentCollapsed && <div className="my-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />}
        <NavItem path="/admin/inventory" label="Inventario" icon={Package} active={isCurrentPath('/admin/inventory')} hasUnread={Boolean(unreadBySection.inventory)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/menu" label="Menú" icon={UtensilsCrossed} active={isCurrentPath('/admin/menu')} hasUnread={Boolean(unreadBySection.menu)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/verification" label="Verificación" icon={ScanLine} active={isCurrentPath('/admin/verification')} hasUnread={Boolean(unreadBySection.verification)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/users" label="Usuarios" icon={Users} active={isCurrentPath('/admin/users')} hasUnread={Boolean(unreadBySection.users)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/loyalty" label="Puntos y premios" icon={Gift} active={isCurrentPath('/admin/loyalty')} hasUnread={Boolean(unreadBySection.loyalty)} collapsed={sidebarContentCollapsed} />
        <NavItem path="/admin/reports" label="Informes" icon={BarChart3} active={isCurrentPath('/admin/reports')} hasUnread={Boolean(unreadBySection.reports)} collapsed={sidebarContentCollapsed} />
        {!sidebarContentCollapsed && user.role === 'admin' && <p className="mb-2 mt-5 px-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#FCA5A5' }}>Mantenimiento</p>}
        {sidebarContentCollapsed && user.role === 'admin' && <div className="my-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />}
        {user.role === 'admin' && <NavItem path="/admin/reset" label="Reiniciar flujo" icon={RotateCcw} active={isCurrentPath('/admin/reset')} hasUnread={Boolean(unreadBySection.system)} collapsed={sidebarContentCollapsed} />}
      </nav>
      <div className={`px-4 pb-5 pt-3 ${sidebarContentCollapsed ? 'lg:px-2' : ''}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {!sidebarContentCollapsed && <div className="mb-3 flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>{user.full_name?.[0]?.toUpperCase() ?? 'A'}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user.full_name}</p><p className="truncate text-xs" style={{ color: '#93C5FD' }}>{user.role === 'both' ? 'Administrador y estudiante' : 'Administrador'}</p></div></div>}
        {canAccessStudent(user.role) && !preview && <button type="button" onClick={openStudentPreview} title={sidebarContentCollapsed ? 'Ver como estudiante' : undefined} className={`mb-2 flex w-full items-center rounded-2xl border py-2 text-xs font-semibold transition hover:bg-white/10 ${sidebarContentCollapsed ? 'justify-center px-2' : 'justify-center px-3'}`} style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#DBEAFE' }}><GraduationCap className={sidebarContentCollapsed ? 'h-4 w-4' : 'mr-2 h-3.5 w-3.5'} />{!sidebarContentCollapsed && 'Ver como estudiante'}</button>}
        <Button onClick={handleSignOut} variant="outline" size="sm" title={sidebarContentCollapsed ? 'Cerrar sesión' : undefined} className="w-full text-xs" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.22)', color: '#fff' }}><LogOut className="mr-2 h-4 w-4" />{!sidebarContentCollapsed && 'Cerrar sesión'}</Button>
      </div>
    </aside>

    <main className={`${mainMargin} min-h-screen transition-[margin] duration-200`}>
      <div className="p-4 lg:p-8">
        <div className="mb-4 flex justify-end">
          <div className="relative">
            <button type="button" onClick={() => setNotificationOpen((open) => !open)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label="Notificaciones">
              <Bell className="h-5 w-5" />
              {unreadTotal > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[9px] font-black leading-4 text-white">{unreadTotal > 9 ? '9+' : unreadTotal}</span>}
            </button>
            {notificationOpen && <div className="absolute right-0 top-10 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><p className="text-sm font-black text-slate-900">Notificaciones</p><button type="button" onClick={() => void markAllNotificationsRead()} disabled={preview || notifications.length === 0 || isClearingNotifications} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />Marcar leídas</button></div><div className="max-h-80 overflow-auto">{notifications.length===0?<p className="p-5 text-sm text-slate-500">No hay notificaciones pendientes.</p>:notifications.map((item)=><button key={item.id} type="button" onClick={() => { setNotificationOpen(false); navigate(sectionPath[item.section] ?? '/admin'); }} className="block w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50"><p className="text-sm font-black text-slate-800">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p></button>)}</div></div>}
          </div>
        </div>
        <Outlet />
      </div>
    </main>
    <Toaster position="top-center" />
  </div>;
}
