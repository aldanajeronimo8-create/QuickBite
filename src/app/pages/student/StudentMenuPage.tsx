import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useDataStore } from '../../../store/dataStore';
import { getErrorMessage } from '../../../lib/errorMessage';
import { requireSupabaseClient, type LoyaltyRedemption, type LoyaltyReward, type Order, type Product } from '../../../lib/supabase';
import { getOrderVerificationUrl } from '../../../lib/orderQr';
import { UserNotificationBell } from '../../components/notifications/UserNotificationBell';
import { StudentRewardsPanel } from '../../components/student/StudentRewardsPanel';
import { useLoyalty } from '../../hooks/useLoyalty';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, CreditCard, History, Home, LogOut, Minus, PackageCheck, Plus, ReceiptText, Search, ShoppingCart, Star, Utensils, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessStudent } from '../../../lib/access';
import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';
import { useStudentContextStore } from '../../../store/studentContextStore';

type Tab = 'menu' | 'orders' | 'rewards';
type PayStep = 'cart' | 'payment' | 'receipt';
interface CartItem extends Product { qty: number; }
interface Student { id: string; name: string; grade: string; email?: string; }
const fmt = (n: number) => n.toLocaleString('es-CO');
const paymentOptions = [
  { value: 'nequi', label: 'Nequi', hint: 'Pago digital pendiente de aprobación', accent: 'bg-fuchsia-500' },
  { value: 'cash', label: 'Efectivo', hint: 'Pago al recoger; requiere aprobación', accent: 'bg-emerald-500' },
  { value: 'bre-b', label: 'Bre-B', hint: 'Pago digital pendiente de aprobación', accent: 'bg-blue-500' },
  { value: 'credits', label: 'Créditos', hint: 'Paga con el saldo disponible de tu billetera', accent: 'bg-violet-500' },
] as const;

const PAGE = 'min-h-screen bg-slate-50 pb-24 text-slate-900 dark:bg-[#0D111D] dark:text-white';
const CONTAINER = 'mx-auto w-full max-w-5xl px-4 sm:px-6';
const SURFACE = 'border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131B2E]';
const INNER = 'border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0D111D]';
const MUTED_TEXT = 'text-slate-500 dark:text-slate-400';

export function StudentMenuPage() {
  const navigate = useNavigate();
  const { categories, products, orders, loadData, addOrder, updateOrder } = useDataStore();
  const [student, setStudent] = useState<Student | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Order['payment_method']>('nequi');
  const [placing, setPlacing] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('menu');
  const [payStep, setPayStep] = useState<PayStep>('cart');
  const [tip, setTip] = useState('');
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; reference: string; pickup: string; paidWithCredits: boolean } | null>(null);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const processedCartAction = useRef<string | null>(null);

  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);

  useEffect(() => {
    let active = true;
    async function initializeStudentSession() {
      try {
        const client = requireSupabaseClient();
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const authUser = sessionData.session?.user;
        if (!authUser) { navigate('/'); return; }
        const effectiveStudentId = activeStudent?.id ?? authUser.id;
        const { data: profile, error } = await client.from('profiles').select('id,email,full_name,role,ti').eq('id', effectiveStudentId).maybeSingle();
        if (error) throw error;
        if (!profile || (!activeStudent && !canAccessStudent(profile.role))) {
          if (!activeStudent) await client.auth.signOut();
          navigate('/');
          return;
        }
        const { data: wallet, error: walletError } = await client.from('wallet_accounts').select('balance').eq('user_id', effectiveStudentId).maybeSingle();
        if (walletError) throw walletError;
        if (active) {
          setStudent({ id: profile.id, name: profile.full_name, grade: profile.ti ?? '', email: profile.email });
          setWalletBalance(Number(wallet?.balance ?? 0));
        }
        await loadData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar tu sesión');
        navigate('/setup');
      }
    }
    void initializeStudentSession();
    return () => { active = false; };
  }, [activeStudent, loadData, navigate]);

  const myOrders = useMemo(() => (student ? orders.filter((o) => o.user_id === student.id) : []), [orders, student]);
  const loyalty = useLoyalty(student?.id, orders);
  const rewardsEnabled = loyalty.enabled;
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartGrandTotal = cartTotal;
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const navigationTabs = rewardsEnabled
    ? [['menu', Home, 'Menú'], ['orders', History, 'Historial'], ['rewards', Star, 'Puntos']] as const
    : [['menu', Home, 'Menú'], ['orders', History, 'Historial']] as const;
  const activeTab: Tab = !rewardsEnabled && tab === 'rewards' ? 'menu' : tab;

  const availableProducts = useMemo(() => products.filter((p) => {
    const byCat = selectedCat ? p.category_id === selectedCat : true;
    const byQuery = `${p.name} ${p.description ?? ''}`.toLowerCase().includes(query.toLowerCase());
    return p.available && p.stock > 0 && byCat && byQuery;
  }), [products, selectedCat, query]);

  useEffect(() => {
    setCart((currentCart) => {
      if (currentCart.length === 0) return currentCart;
      let changed = false;
      const nextCart = currentCart.flatMap((item) => {
        const latest = products.find((product) => product.id === item.id);
        if (!latest || !latest.available || latest.stock <= 0) { changed = true; return []; }
        const nextQty = Math.min(item.qty, latest.stock);
        if (nextQty !== item.qty || latest.price !== item.price || latest.name !== item.name) changed = true;
        return [{ ...latest, qty: nextQty }];
      });
      if (changed) toast.info('Actualizamos tu carrito porque el menú cambió.');
      return changed ? nextCart : currentCart;
    });
  }, [products]);

  const addToCart = (product: Product) => {
    const current = cart.find((i) => i.id === product.id)?.qty ?? 0;
    if (current >= product.stock) { toast.warning('No queda más stock disponible'); return; }
    setCart((prev) => prev.some((i) => i.id === product.id)
      ? prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...prev, { ...product, qty: 1 }]);
  };

  useEffect(() => {
    if (!student || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const addProductId = params.get('addProduct');
    const reorderPayload = params.get('reorder');
    const actionKey = addProductId ? `add:${addProductId}` : reorderPayload ? `reorder:${reorderPayload}` : null;
    if (!actionKey || processedCartAction.current === actionKey) return;
    processedCartAction.current = actionKey;

    if (addProductId) {
      const product = products.find((item) => item.id === addProductId);
      if (!product || !product.available || product.stock <= 0) {
        toast.info('Este producto ya no está disponible.');
      } else {
        setCart((current) => {
          const existing = current.find((item) => item.id === product.id);
          if (existing && existing.qty >= product.stock) return current;
          return existing
            ? current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
            : [...current, { ...product, qty: 1 }];
        });
        setShowCart(true);
        setPayStep('cart');
        toast.success(`${product.name} fue agregado al carrito.`);
      }
    }

    if (reorderPayload) {
      const requested = reorderPayload.split(',').map((entry) => {
        const [id, rawQty] = entry.split(':');
        return { id, qty: Math.max(1, Number(rawQty) || 1) };
      }).filter((entry) => entry.id);
      let added = 0;
      let unavailable = 0;
      setCart((current) => {
        const next = [...current];
        for (const request of requested) {
          const product = products.find((item) => item.id === request.id);
          if (!product || !product.available || product.stock <= 0) { unavailable += 1; continue; }
          const index = next.findIndex((item) => item.id === product.id);
          const currentQty = index >= 0 ? next[index].qty : 0;
          const quantity = Math.min(request.qty, product.stock - currentQty);
          if (quantity <= 0) { unavailable += 1; continue; }
          if (index >= 0) next[index] = { ...next[index], qty: currentQty + quantity };
          else next.push({ ...product, qty: quantity });
          added += quantity;
        }
        return next;
      });
      setShowCart(true);
      setPayStep('cart');
      if (added > 0) toast.success('Recompra preparada en tu carrito con precios y stock actuales.');
      if (unavailable > 0) toast.info(`${unavailable} producto(s) no estaban disponibles y se omitieron.`);
    }
    navigate('/menu', { replace: true });
  }, [student, products, navigate]);

  const removeFromCart = (id: string) => setCart((prev) => {
    const existing = prev.find((i) => i.id === id);
    if (!existing) return prev;
    return existing.qty === 1 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i));
  });
  const cartQty = (id: string) => cart.find((i) => i.id === id)?.qty ?? 0;
  const reference = useMemo(() => `QB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, [showCart, payStep]);
  const pickup = useMemo(() => Math.random().toString(36).slice(2, 6).toUpperCase(), [showCart, payStep]);

  const handlePlaceOrder = async () => {
    if (!student || cart.length === 0) return;
    if (paymentMethod === 'credits' && walletBalance < cartGrandTotal) {
      toast.error(`No tienes créditos suficientes. Disponible: $${fmt(walletBalance)}.`);
      return;
    }
    setPlacing(true);
    const note = tip.trim();
    try {
      const orderNumber = await addOrder({
        user_id: student.id,
        total: cartGrandTotal,
        status: 'pending',
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'credits' ? 'confirmed' : 'pending',
        pickup_code: pickup,
        estimated_minutes: 8 + cart.length * 3,
        payment_reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : paymentMethod === 'credits' ? 'PAGO-CON-CREDITOS' : reference,
        order_items: cart.map((i) => ({ product_id: i.id, quantity: i.qty, price: i.price }))
      });
      const paidWithCredits = paymentMethod === 'credits';
      setLastReceipt({ orderNumber, reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : paymentMethod === 'credits' ? 'PAGO-CON-CREDITOS' : reference, pickup, paidWithCredits });
      setCart([]);
      setTip('');
      setPayStep('receipt');
      toast.success(paidWithCredits ? `Pedido ${orderNumber} pagado con créditos.` : `Pedido ${orderNumber} creado y enviado para aprobación`);
      await loadData();
      const { data: wallet } = await requireSupabaseClient().from('wallet_accounts').select('balance').eq('user_id', student.id).maybeSingle();
      setWalletBalance(Number(wallet?.balance ?? 0));
      if (note) {
        const createdOrder = useDataStore.getState().orders.find((order) => order.order_number === orderNumber);
        if (createdOrder) await updateOrder(createdOrder.id, { notes: note });
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Error al enviar el pedido');
      if (/insufficient_wallet_balance|Insufficient wallet balance/i.test(message)) toast.error('No tienes créditos suficientes para pagar este pedido.');
      else toast.error(message);
    } finally {
      setPlacing(false);
    }
  };

  const handleLogout = async () => {
    if (activeStudent) {
      try {
        const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');
        if (error) throw error;
        clearActiveStudent();
        navigate('/parent/family');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo volver al panel de padre.');
      }
      return;
    }
    await requireSupabaseClient().auth.signOut();
    navigate('/');
  };

  const handleRewardRedemption = async (reward: LoyaltyReward) => {
    if (redeemingRewardId) return;
    setRedeemingRewardId(reward.id);
    try {
      await loyalty.redeem(reward.id);
      toast.success('Canje solicitado. El código estará disponible cuando Admin lo apruebe.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo completar el canje.'));
    } finally {
      setRedeemingRewardId(null);
    }
  };

  if (!student) return null;

  return (
    <div className={PAGE}>
      <MenuHeader student={student} walletBalance={walletBalance} rewardsEnabled={rewardsEnabled} points={loyalty.availablePoints} cartCount={cartCount} onCart={() => setShowCart(true)} onLogout={handleLogout} />

      <div className={`${CONTAINER} pt-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <section className={`${SURFACE} rounded-2xl p-4`}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Recreo inteligente</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">Pide ahora, recoge sin fila</h1>
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 sm:inline-flex">Inventario en vivo</span>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Consulta disponibilidad y prepara tu pedido antes del recreo.</p>
          </section>
          <section className={`${SURFACE} rounded-2xl p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Créditos disponibles</p>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">${fmt(walletBalance)}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-[#0D111D] dark:text-slate-300">Billetera</span>
            </div>
          </section>
        </div>
      </div>

      <MenuTabs tabs={navigationTabs} activeTab={activeTab} onSelect={setTab} />

      {activeTab === 'menu' && (
        <main className={`${CONTAINER} pt-4`}>
          <section className={`${SURFACE} rounded-2xl p-3 sm:p-4`}>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empanadas, jugos, almuerzos..." className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-[#0D111D] dark:text-white dark:placeholder:text-slate-500" />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <CategoryFilter active={!selectedCat} label="Todo" onClick={() => setSelectedCat(null)} />
              {categories.map((cat) => <CategoryFilter key={cat.id} active={selectedCat === cat.id} label={cat.name} onClick={() => setSelectedCat(cat.id)} />)}
            </div>
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {availableProducts.map((product) => <ProductCard key={product.id} product={product} qty={cartQty(product.id)} onAdd={addToCart} onRemove={removeFromCart} />)}
          </div>
          {availableProducts.length === 0 && <Empty icon={Search} title="No encontramos productos" text="Prueba otra búsqueda o selecciona otra categoría." />}
        </main>
      )}

      {activeTab === 'orders' && <main className={`${CONTAINER} max-w-3xl space-y-4 pt-4`}>{myOrders.length === 0 && loyalty.redemptions.length === 0 ? <Empty icon={ReceiptText} title="Aún no tienes actividad" text="Tus compras y canjes aparecerán aquí." /> : <>{myOrders.map((o) => <OrderCard key={o.id} order={o} />)}{loyalty.redemptions.map((redemption) => <RedemptionCard key={redemption.id} redemption={redemption} />)}</>}</main>}
      {activeTab === 'rewards' && rewardsEnabled && <StudentRewardsPanel availablePoints={loyalty.availablePoints} error={loyalty.error} loading={loyalty.loading} onRedeem={handleRewardRedemption} redeemingRewardId={redeemingRewardId} redemptions={loyalty.redemptions} rewards={loyalty.rewards} />}

      {cartCount > 0 && !showCart && <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2"><button onClick={() => { setShowCart(true); setPayStep('cart'); }} className="flex w-full items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-600 px-5 py-4 font-black text-white shadow-2xl shadow-black/30 transition hover:bg-emerald-500"><span>{cartCount} {cartCount === 1 ? 'producto' : 'productos'}</span><span>Ver pedido</span><span>${fmt(cartGrandTotal)}</span></button></div>}
      {showCart && <CartSheet cart={cart} cartTotal={cartTotal} total={cartGrandTotal} lastReceipt={lastReceipt} payStep={payStep} paymentMethod={paymentMethod} placing={placing} reference={reference} tip={tip} walletBalance={walletBalance} onAdd={addToCart} onClose={() => { setShowCart(false); setPayStep('cart'); }} onPay={handlePlaceOrder} onRemove={removeFromCart} onSelectPayment={setPaymentMethod} onSetPayStep={setPayStep} onSetTab={setTab} onTip={setTip} />}
    </div>
  );
}

function MenuHeader({ student, walletBalance, rewardsEnabled, points, cartCount, onCart, onLogout }: { student: Student; walletBalance: number; rewardsEnabled: boolean; points: number; cartCount: number; onCart: () => void; onLogout: () => void; }) {
  return <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 text-slate-900 backdrop-blur-xl dark:border-slate-800 dark:bg-[#131B2E]/95 dark:text-white">
    <div className={`${CONTAINER} flex min-h-16 items-center justify-between gap-4 py-3`}>
      <div className="flex min-w-0 items-center gap-3">
        <QuickBiteLogo className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-black leading-none text-slate-900 dark:text-white">QuickBite</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{student.name}{student.grade ? ` · ${student.grade}` : ''}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {rewardsEnabled && <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:border-slate-700 dark:bg-[#0D111D] dark:text-emerald-400 sm:inline-flex">{points} pts</span>}
        <UserNotificationBell userId={student.id} />
        <button onClick={onCart} className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-[#0D111D] dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white" aria-label="Abrir carrito"><ShoppingCart className="h-5 w-5" />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-black text-white">{cartCount}</span>}</button>
        <button onClick={onLogout} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-[#0D111D] dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button>
      </div>
    </div>
  </header>;
}

function MenuTabs({ tabs, activeTab, onSelect }: { tabs: readonly (readonly [Tab, LucideIcon, string])[]; activeTab: Tab; onSelect: (tab: Tab) => void; }) {
  return <nav className={`${CONTAINER} pt-4`} aria-label="Navegación del menú">
    <div className={`${SURFACE} grid ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} rounded-2xl p-1.5`}>
      {tabs.map(([id, Icon, label]) => <button key={id} onClick={() => onSelect(id)} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${activeTab === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#0D111D] dark:hover:text-slate-200'}`}><Icon className="h-4 w-4" />{label}</button>)}
    </div>
  </nav>;
}

function CategoryFilter({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${active ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-[#0D111D] dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white'}`}>{label}</button>;
}

function ProductCard({ product, qty, onAdd, onRemove }: { product: Product; qty: number; onAdd: (product: Product) => void; onRemove: (id: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/10 dark:border-slate-800 dark:bg-[#0D111D] dark:hover:border-slate-700 dark:hover:shadow-black/20">
    <div className="relative h-44 overflow-hidden bg-slate-100 dark:bg-[#131B2E]">
      {!imageFailed && product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" onError={() => setImageFailed(true)} /> : <div className="grid h-full place-items-center text-slate-400 dark:text-slate-600"><Utensils className="h-10 w-10" /></div>}
      <span className="absolute left-2 top-2 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-600 backdrop-blur dark:border-slate-700 dark:bg-[#0D111D]/90 dark:text-slate-300">Stock {product.stock}</span>
    </div>
    <div className="p-4">
      <p className="min-h-10 text-sm font-black leading-tight text-slate-900 dark:text-white">{product.name}</p>
      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{product.description}</p>
      <p className="mt-2 text-lg font-black text-emerald-600 dark:text-emerald-400">${fmt(product.price)}</p>
      {qty === 0 ? <button onClick={() => onAdd(product)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"><Plus className="h-4 w-4" />Agregar</button> : <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 p-1 dark:border-emerald-500/20 dark:bg-emerald-500/10"><button onClick={() => onRemove(product.id)} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-emerald-600 transition hover:bg-slate-100 dark:bg-[#131B2E] dark:text-emerald-400 dark:hover:bg-slate-800"><Minus className="h-4 w-4" /></button><span className="font-black text-slate-900 dark:text-white">{qty}</span><button onClick={() => onAdd(product)} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500"><Plus className="h-4 w-4" /></button></div>}
    </div>
  </article>;
}

function CartSheet({ cart, cartTotal, total, lastReceipt, payStep, paymentMethod, placing, reference, tip, walletBalance, onAdd, onClose, onPay, onRemove, onSelectPayment, onSetPayStep, onSetTab, onTip }: { cart: CartItem[]; cartTotal: number; total: number; lastReceipt: { orderNumber: string; reference: string; pickup: string; paidWithCredits: boolean } | null; payStep: PayStep; paymentMethod: Order['payment_method']; placing: boolean; reference: string; tip: string; walletBalance: number; onAdd: (product: Product) => void; onClose: () => void; onPay: () => void; onRemove: (id: string) => void; onSelectPayment: (method: Order['payment_method']) => void; onSetPayStep: (step: PayStep) => void; onSetTab: (tab: Tab) => void; onTip: (tip: string) => void; }) {
  const creditsSelected = paymentMethod === 'credits';
  const creditsInsufficient = creditsSelected && walletBalance < total;
  return <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
    <section className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-[#131B2E] dark:text-white" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#131B2E]/95"><h2 className="text-xl font-black">{payStep === 'receipt' ? 'Recibo digital' : payStep === 'payment' ? 'Confirmar pago' : 'Tu pedido'}</h2><button onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Cerrar</button></div>
      <div className="space-y-4 p-5">
        {payStep === 'cart' && <>
          <div className="space-y-3">{cart.map((item) => <div key={item.id} className={`${INNER} flex items-center gap-3 rounded-2xl p-3`}><div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-[#131B2E]">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400 dark:text-slate-600"><Utensils className="h-5 w-5" /></div>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{item.name}</p><p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${fmt(item.price)} × {item.qty}</p></div><button onClick={() => onRemove(item.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-400 dark:hover:text-white"><Minus className="h-4 w-4" /></button><button onClick={() => onAdd(item)} className="rounded-xl bg-emerald-600 p-2 text-white hover:bg-emerald-500"><Plus className="h-4 w-4" /></button></div>)}</div>
          <div><p className="mb-2 text-sm font-black text-slate-900 dark:text-white">Método de pago</p><div className="grid grid-cols-2 gap-2">{paymentOptions.map((opt) => <button key={opt.value} onClick={() => onSelectPayment(opt.value)} className={`rounded-2xl border p-3 text-left transition ${paymentMethod === opt.value ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0D111D] dark:hover:border-slate-700'}`}><span className={`mb-2 block h-1.5 w-8 rounded-full ${opt.accent}`} /><span className="block text-sm font-black text-slate-900 dark:text-white">{opt.label}</span><span className="text-xs text-slate-500 dark:text-slate-500">{opt.hint}</span>{opt.value === 'credits' && <span className={`mt-2 block text-xs font-bold ${creditsInsufficient ? 'text-rose-400' : 'text-violet-400'}`}>Disponible: ${fmt(walletBalance)}</span>}</button>)}</div>{creditsSelected && <div className={`mt-2 rounded-2xl border p-3 text-sm ${creditsInsufficient ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-violet-500/30 bg-violet-500/10 text-violet-300'}`}><div className="flex justify-between"><span>Créditos disponibles</span><b>${fmt(walletBalance)}</b></div><div className="mt-1 flex justify-between"><span>Total del pedido</span><b>${fmt(total)}</b></div>{creditsInsufficient ? <p className="mt-2 font-bold">Te faltan ${fmt(total - walletBalance)} para completar esta compra.</p> : <p className="mt-2 font-bold">Al pagar, se descontarán ${fmt(total)} de tu billetera.</p>}</div>}</div>
          <textarea value={tip} onChange={(e) => onTip(e.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-[#0D111D] dark:text-white dark:placeholder:text-slate-500" rows={2} placeholder="Notas para cafetería" />
          <Summary subtotal={cartTotal} total={total} />
          <Button disabled={creditsInsufficient || cart.length === 0} onClick={() => onSetPayStep('payment')} className="w-full rounded-2xl bg-emerald-600 py-6 text-white hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">Continuar al pago <ChevronRight className="ml-1 h-5 w-5" /></Button>
        </>}
        {payStep === 'payment' && <><div className={`${INNER} rounded-3xl p-4`}><div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><p className="font-black text-slate-900 dark:text-white">Pago - {paymentOptions.find((p) => p.value === paymentMethod)?.label}</p></div><p className="text-sm text-slate-500 dark:text-slate-400">Referencia: <b className="text-slate-700 dark:text-slate-200">{reference}</b></p><p className="text-sm text-slate-500 dark:text-slate-400">Total a registrar: <b className="text-slate-700 dark:text-slate-200">${fmt(total)}</b></p>{creditsSelected ? <><p className="text-sm text-slate-500 dark:text-slate-400">Créditos disponibles: <b className="text-slate-700 dark:text-slate-200">${fmt(walletBalance)}</b></p><p className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3 text-sm text-violet-300">Al confirmar, QuickBite descontará el total de tu saldo de créditos de forma segura y atómica. El pedido quedará pagado inmediatamente.</p></> : <p className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">El pago quedará pendiente hasta que un administrador lo revise y apruebe. El QR de recogida se habilitará únicamente después de la aprobación.</p>}</div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => onSetPayStep('cart')} className="rounded-2xl border-slate-300 bg-transparent py-6 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Volver</Button><Button disabled={placing || creditsInsufficient} onClick={onPay} className="rounded-2xl bg-emerald-600 py-6 text-white hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">{placing ? 'Procesando...' : creditsSelected ? 'Pagar con créditos' : 'Enviar para aprobación'}</Button></div></>}
        {payStep === 'receipt' && lastReceipt && <div className={`rounded-3xl border border-dashed p-5 text-center ${lastReceipt.paidWithCredits ? 'border-violet-500/40 bg-violet-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}><Clock3 className={`mx-auto mb-3 h-12 w-12 ${lastReceipt.paidWithCredits ? 'text-violet-400' : 'text-amber-400'}`} /><p className="text-sm font-bold text-slate-500 dark:text-slate-400">Pedido enviado</p><p className="text-3xl font-black text-slate-900 dark:text-white">{lastReceipt.orderNumber}</p><p className={`mt-3 text-sm font-bold ${lastReceipt.paidWithCredits ? 'text-violet-600 dark:text-violet-300' : 'text-amber-600 dark:text-amber-300'}`}>{lastReceipt.paidWithCredits ? 'Pago con créditos confirmado' : 'Pago pendiente de aprobación'}</p><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{lastReceipt.paidWithCredits ? 'Se descontaron los créditos del pedido. Tu QR de recogida ya está disponible en Historial.' : 'El código QR y el código de recogida estarán disponibles cuando Admin apruebe el pago.'}</p><p className="mt-3 text-xs text-slate-500">Ref. pago: {lastReceipt.reference}</p><Button onClick={() => { onClose(); onSetTab('orders'); onSetPayStep('cart'); }} className="mt-5 w-full rounded-2xl bg-emerald-600 py-6 text-white hover:bg-emerald-500">Ver historial</Button></div>}
      </div>
    </section>
  </div>;
}

function Summary({ subtotal, total }: { subtotal: number; total: number }) { return <div className={`${INNER} space-y-2 rounded-3xl p-4 text-sm`}><div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-black dark:border-slate-800"><span>Total</span><span className="text-emerald-600 dark:text-emerald-400">${fmt(total)}</span></div>{subtotal !== total && <div className="text-xs text-slate-500">Subtotal: ${fmt(subtotal)}</div>}</div>; }
function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className={`${SURFACE} mt-4 rounded-3xl p-8 text-center`}><Icon className="mx-auto mb-3 h-12 w-12 text-emerald-500/50" /><h3 className="font-black text-slate-900 dark:text-white">{title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{text}</p></div>; }
function statusData(order: Order): [string, number, LucideIcon] { if (order.status === 'cancelled') return ['Cancelado', 100, XCircle]; if (order.status === 'delivered') return ['Entregado', 100, CheckCircle2]; if (order.status === 'ready') return ['Listo para recoger', 78, PackageCheck]; if (order.status === 'preparing') return ['En preparación', 52, Utensils]; return ['Recibido', 22, Clock3]; }

function OrderCard({ order }: { order: Order }) {
  const [label, progress, Icon] = statusData(order);
  const [expanded, setExpanded] = useState(false);
  const created = new Date(order.created_at);
  const paymentApproved = order.payment_status === 'confirmed';
  const cancelled = order.status === 'cancelled';
  return <article className={`${SURFACE} overflow-hidden rounded-3xl`}><button onClick={() => setExpanded((value) => !value)} className="w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">#{order.order_number}</p><h3 className="font-black text-slate-900 dark:text-white">{label}</h3><p className="mt-1 text-xs text-slate-500">{created.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })} · {created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p></div><div className="flex items-center gap-2"><Badge className={paymentApproved ? 'bg-emerald-600 text-white' : order.payment_status === 'rejected' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}>{paymentApproved ? 'Pagado' : order.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</Badge><ChevronDown className="h-5 w-5 text-slate-400 transition-transform dark:text-slate-500" /></div></div><div className="mt-3 flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-2xl ${cancelled ? 'bg-red-500/10 text-red-500 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}><Icon className="h-5 w-5" /></div><div className="flex-1"><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className={`h-full rounded-full ${cancelled ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-500">{cancelled ? 'El pago fue rechazado y el pedido quedó cancelado.' : <>Recogida: <b className="text-slate-700 dark:text-slate-300">{paymentApproved ? (order.pickup_code ?? '----') : 'Disponible tras aprobación'}</b> - {order.estimated_minutes ?? 12} min</>}</p></div></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800"><span className="text-slate-500">Total</span><b className="text-emerald-600 dark:text-emerald-400">${fmt(order.total)}</b></div></button>{expanded && <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0D111D]"><div className="space-y-2">{order.order_items?.length ? order.order_items.map((item) => <div key={item.id} className={`${INNER} flex items-center justify-between gap-3 rounded-2xl px-3 py-2`}><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.product?.name ?? 'Producto'}</p><p className="text-xs text-slate-500">{item.quantity} × ${fmt(Number(item.price))}</p></div><b className="text-sm text-emerald-600 dark:text-emerald-400">${fmt(Number(item.price) * item.quantity)}</b></div>) : <p className="text-xs text-slate-500">No hay detalle de artículos disponible.</p>}</div><div className={`${INNER} mt-3 grid gap-2 rounded-2xl p-3 text-sm`}><div className="flex justify-between"><span className="text-slate-500">Fecha</span><b className="text-slate-900 dark:text-white">{created.toLocaleDateString('es-CO')}</b></div><div className="flex justify-between"><span className="text-slate-500">Hora</span><b className="text-slate-900 dark:text-white">{created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</b></div><div className="flex justify-between"><span className="text-slate-500">Método de pago</span><b className="text-slate-900 dark:text-white">{order.payment_method === 'bre-b' ? 'Bre-B' : order.payment_method === 'cash' ? 'Efectivo' : order.payment_method === 'credits' ? 'Créditos' : 'Nequi'}</b></div>{order.notes && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2"><p className="text-xs font-bold text-amber-600 dark:text-amber-300">Comentario</p><p className="text-sm text-slate-600 dark:text-slate-300">{order.notes}</p></div>}</div>{paymentApproved ? <div className="mt-3 flex flex-col items-center rounded-3xl border border-dashed border-emerald-500/30 bg-emerald-500/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">Código QR para reclamar</p><QRCodeSVG value={getOrderVerificationUrl(order.pickup_code ?? order.order_number)} size={170} level="M" includeMargin className="mt-3 rounded-xl bg-white p-2" /><p className="mt-2 text-2xl font-black tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{order.pickup_code ?? '----'}</p><p className="mt-1 text-xs text-slate-500">Escanea este QR para verificar el pedido o preséntalo al recogerlo.</p></div> : <div className={`mt-3 rounded-3xl border border-dashed p-4 text-center ${cancelled ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}><Clock3 className={`mx-auto h-8 w-8 ${cancelled ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`} /><p className={`mt-2 text-sm font-bold ${cancelled ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>{cancelled ? 'Pedido cancelado' : 'QR bloqueado'}</p><p className="mt-1 text-xs text-slate-500">{cancelled ? 'El pago fue rechazado; el pedido no será preparado ni entregado.' : 'El QR aparecerá cuando Admin apruebe el pago.'}</p></div>}</div>}</article>;
}

function RedemptionCard({ redemption }: { redemption: LoyaltyRedemption }) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(redemption.created_at);
  const productName = redemption.reward?.product?.name ?? redemption.reward?.title ?? 'Recompensa';
  const approved = redemption.status === 'approved' || redemption.status === 'delivered' || redemption.status === 'fulfilled';
  const statusLabel = approved ? (redemption.status === 'approved' ? 'Aprobado' : 'Entregado') : redemption.status === 'cancelled' ? 'Rechazado' : 'Pendiente';
  const statusClass = approved ? 'bg-emerald-600 text-white' : redemption.status === 'cancelled' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131B2E]"><button onClick={() => setExpanded((value) => !value)} className="w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div><Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">CANJE</Badge><h3 className="mt-2 font-black text-slate-900 dark:text-white">{productName}</h3><p className="mt-1 text-xs text-slate-500">{created.toLocaleDateString('es-CO')} · {created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p></div><div className="flex items-center gap-2"><Badge className={statusClass}>{statusLabel}</Badge><ChevronDown className="h-5 w-5 text-slate-400 dark:text-slate-500" /></div></div><div className="mt-3 flex justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#0D111D]"><span className="text-slate-500">Puntos canjeados</span><b className="text-emerald-600 dark:text-emerald-400">{redemption.points_spent} pts</b></div></button>{expanded && <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0D111D]"><div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-[#131B2E]"><div className="flex justify-between"><span className="text-slate-500">Tipo</span><b className="text-slate-900 dark:text-white">Canje</b></div><div className="flex justify-between"><span className="text-slate-500">Producto</span><b className="text-slate-900 dark:text-white">{productName}</b></div><div className="flex justify-between"><span className="text-slate-500">Puntos</span><b className="text-slate-900 dark:text-white">{redemption.points_spent}</b></div><div className="flex justify-between"><span className="text-slate-500">Fecha</span><b className="text-slate-900 dark:text-white">{created.toLocaleDateString('es-CO')}</b></div><div className="flex justify-between"><span className="text-slate-500">Hora</span><b className="text-slate-900 dark:text-white">{created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</b></div><div className="flex justify-between"><span className="text-slate-500">Estado</span><b className="text-slate-900 dark:text-white">{statusLabel}</b></div></div>{approved ? <div className="mt-3 flex flex-col items-center rounded-3xl border border-dashed border-emerald-500/30 bg-emerald-500/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">QR para reclamar canje</p><QRCodeSVG value={redemption.redemption_code} size={170} className="mt-3 rounded-xl bg-white p-2" /><p className="mt-2 text-xl font-black tracking-[0.12em] text-emerald-600 dark:text-emerald-400">{redemption.redemption_code}</p></div> : <div className="mt-3 rounded-3xl border border-dashed border-amber-500/30 bg-amber-500/10 p-4 text-center"><Clock3 className="mx-auto h-8 w-8 text-amber-500 dark:text-amber-400" /><p className="mt-2 text-sm font-bold text-amber-600 dark:text-amber-300">QR bloqueado</p><p className="mt-1 text-xs text-slate-500">El QR aparecerá únicamente cuando Admin apruebe el canje.</p></div>}</div>}</article>;
}
