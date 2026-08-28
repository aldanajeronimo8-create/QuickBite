import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useDataStore } from '../../../store/dataStore';
import { getErrorMessage } from '../../../lib/errorMessage';
import { requireSupabaseClient, type LoyaltyRedemption, type LoyaltyReward, type Order, type Product } from '../../../lib/supabase';
import { UserNotificationBell } from '../../components/notifications/UserNotificationBell';
import { StudentRewardsPanel } from '../../components/student/StudentRewardsPanel';
import { useLoyalty } from '../../hooks/useLoyalty';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, CreditCard, History, Home, LogOut, Minus, PackageCheck, Plus, ReceiptText, Search, ShoppingCart, Star, Utensils, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessStudent } from '../../../lib/access';
import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';

type Tab = 'menu' | 'orders' | 'rewards';
type PayStep = 'cart' | 'payment' | 'receipt';
interface CartItem extends Product { qty: number; }
interface Student { id: string; name: string; grade: string; email?: string; }
const fmt = (n: number) => n.toLocaleString('es-CO');
const paymentOptions = [
  { value: 'nequi', label: 'Nequi', hint: 'Pago digital pendiente de aprobación', accent: 'bg-fuchsia-500' },
  { value: 'cash', label: 'Efectivo', hint: 'Pago al recoger; requiere aprobación', accent: 'bg-emerald-500' },
  { value: 'bre-b', label: 'Bre-B', hint: 'Pago digital pendiente de aprobación', accent: 'bg-blue-500' },
] as const;

export function StudentMenuPage() {
  const navigate = useNavigate();
  const { categories, products, orders, loadData, addOrder, updateOrder } = useDataStore();
  const [student, setStudent] = useState<Student | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Order['payment_method']>('nequi');
  const [placing, setPlacing] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('menu');
  const [payStep, setPayStep] = useState<PayStep>('cart');
  const [tip, setTip] = useState('');
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; reference: string; pickup: string } | null>(null);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function initializeStudentSession() {
      try {
        const client = requireSupabaseClient();
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const authUser = sessionData.session?.user;
        if (!authUser) { navigate('/'); return; }
        const { data: profile, error } = await client.from('profiles').select('id,email,full_name,role,ti').eq('id', authUser.id).maybeSingle();
        if (error) throw error;
        if (!profile || !canAccessStudent(profile.role)) { await client.auth.signOut(); navigate('/'); return; }
        if (active) setStudent({ id: profile.id, name: profile.full_name, grade: profile.ti ?? '', email: profile.email });
        await loadData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar tu sesión');
        navigate('/setup');
      }
    }
    initializeStudentSession();
    return () => { active = false; };
  }, [loadData, navigate]);

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
      if (changed) toast.info('Actualizamos tu carrito porque el menu cambio.');
      return changed ? nextCart : currentCart;
    });
  }, [products]);

  const addToCart = (product: Product) => {
    const current = cart.find((i) => i.id === product.id)?.qty ?? 0;
    if (current >= product.stock) { toast.warning('No queda mas stock disponible'); return; }
    setCart((prev) => prev.some((i) => i.id === product.id)
      ? prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...prev, { ...product, qty: 1 }]);
  };
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
    setPlacing(true);
    const note = tip.trim();
    try {
      const orderNumber = await addOrder({
        user_id: student.id,
        total: cartGrandTotal,
        status: 'pending',
        payment_method: paymentMethod,
        payment_status: 'pending',
        pickup_code: pickup,
        estimated_minutes: 8 + cart.length * 3,
        payment_reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : reference,
        order_items: cart.map((i) => ({ product_id: i.id, quantity: i.qty, price: i.price })),
      });
      setLastReceipt({ orderNumber, reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : reference, pickup });
      setCart([]); setTip(''); setPayStep('receipt');
      toast.success(`Pedido ${orderNumber} creado y enviado para aprobación`);
      await loadData();
      if (note) {
        const createdOrder = useDataStore.getState().orders.find((order) => order.order_number === orderNumber);
        if (createdOrder) await updateOrder(createdOrder.id, { notes: note });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar el pedido');
    } finally { setPlacing(false); }
  };

  const handleLogout = async () => { await requireSupabaseClient().auth.signOut(); navigate('/'); };
  const handleRewardRedemption = async (reward: LoyaltyReward) => {
    if (redeemingRewardId) return;
    setRedeemingRewardId(reward.id);
    try {
      await loyalty.redeem(reward.id);
      toast.success(`Canje solicitado. El codigo estara disponible cuando Admin lo apruebe.`);
    } catch (error) { toast.error(getErrorMessage(error, 'No se pudo completar el canje.')); }
    finally { setRedeemingRewardId(null); }
  };
  if (!student) return null;

  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
    <header className="sticky top-0 z-20 bg-[#166534] text-white shadow-xl shadow-green-950/10"><div className="mx-auto max-w-6xl px-5 pb-5 pt-5 lg:px-8"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><QuickBiteLogo className="h-11 w-11 rounded-2xl" /><div><p className="text-lg font-black leading-none">QuickBite</p><p className="text-xs text-green-100">{student.name}{student.grade ? ` - ${student.grade}` : ''}</p></div></div><div className="flex items-center gap-2"><UserNotificationBell userId={student.id} /><button onClick={() => setShowCart(true)} className="relative rounded-full bg-white/10 p-2" aria-label="Abrir carrito"><ShoppingCart className="h-5 w-5" />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-green-500 text-xs font-black">{cartCount}</span>}</button><button onClick={handleLogout} className="rounded-full bg-white/10 p-2" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button></div></div><div className="mt-5 rounded-[2rem] bg-gradient-to-r from-green-600 to-green-700 p-4 text-white shadow-lg shadow-green-950/10"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-green-100">Recreo inteligente</p><h1 className="mt-1 text-2xl font-black">Pide ahora, recoge sin fila</h1></div>{rewardsEnabled && <Badge className="bg-white text-green-800">{loyalty.availablePoints} pts</Badge>}</div><div className="mt-4 flex gap-2 overflow-x-auto"><span className="rounded-full bg-white/20 px-3 py-1 text-xs">Inventario en vivo</span><span className="rounded-full bg-white/20 px-3 py-1 text-xs">Tiempo promedio: 12 min</span></div></div></div></header>
    <nav className={`sticky top-[190px] z-10 mx-5 mt-5 grid ${rewardsEnabled ? 'grid-cols-3' : 'grid-cols-2'} rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200`}>{navigationTabs.map(([id, Icon, label]) => <button key={id} onClick={() => setTab(id)} className={`flex items-center justify-center gap-1 rounded-xl py-2 text-sm font-bold transition ${activeTab === id ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600 hover:bg-green-50'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
    {activeTab === 'menu' && <main className="mx-auto max-w-6xl px-5 pt-6 lg:px-8"><div className="relative mb-3"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empanadas, jugos, almuerzos..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-green-200" /></div><div className="mb-4 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setSelectedCat(null)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${!selectedCat ? 'bg-[#DCFCE7] text-green-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todo</button>{categories.map((cat) => <button key={cat.id} onClick={() => setSelectedCat(cat.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${selectedCat === cat.id ? 'bg-[#DCFCE7] text-green-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{cat.name}</button>)}</div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{availableProducts.map((product) => { const qty = cartQty(product.id); return <article key={product.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="relative"><img src={product.image_url} alt={product.name} className="h-44 w-full object-cover" /><span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700">Stock {product.stock}</span></div><div className="p-4"><p className="min-h-10 text-sm font-black leading-tight">{product.name}</p><p className="line-clamp-1 text-xs text-slate-600">{product.description}</p><p className="mt-2 text-lg font-black text-green-800">${fmt(product.price)}</p>{qty === 0 ? <button onClick={() => addToCart(product)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-green-600 py-2 text-sm font-bold text-white hover:bg-green-700"><Plus className="h-4 w-4" />Agregar</button> : <div className="mt-2 flex items-center justify-between rounded-2xl bg-green-50 p-1"><button onClick={() => removeFromCart(product.id)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-green-700"><Minus className="h-4 w-4" /></button><span className="font-black">{qty}</span><button onClick={() => addToCart(product)} className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white hover:bg-green-700"><Plus className="h-4 w-4" /></button></div>}</div></article>; })}</div></main>}
    {activeTab === 'orders' && <main className="mx-auto max-w-3xl space-y-4 px-5 pt-6 lg:px-8">
      {myOrders.length === 0 && loyalty.redemptions.length === 0 ? <Empty icon={ReceiptText} title="Aun no tienes actividad" text="Tus compras y canjes apareceran aqui." /> : <>
        {myOrders.map((o) => <OrderCard key={o.id} order={o} />)}
        {loyalty.redemptions.map((redemption) => <RedemptionCard key={redemption.id} redemption={redemption} />)}
      </>}
    </main>}
    {activeTab === 'rewards' && rewardsEnabled && <StudentRewardsPanel availablePoints={loyalty.availablePoints} error={loyalty.error} loading={loyalty.loading} onRedeem={handleRewardRedemption} redeemingRewardId={redeemingRewardId} redemptions={loyalty.redemptions} rewards={loyalty.rewards} />}
    {cartCount > 0 && !showCart && <div className="fixed bottom-4 left-4 right-4 z-30"><button onClick={() => { setShowCart(true); setPayStep('cart'); }} className="flex w-full items-center justify-between rounded-3xl bg-green-600 px-5 py-4 font-black text-white shadow-2xl shadow-green-950/20 hover:bg-green-700"><span>{cartCount} items</span><span>Ver pedido</span><span>${fmt(cartGrandTotal)}</span></button></div>}
    {showCart && <CartSheet cart={cart} cartTotal={cartTotal} total={cartGrandTotal} lastReceipt={lastReceipt} payStep={payStep} paymentMethod={paymentMethod} placing={placing} reference={reference} tip={tip} onAdd={addToCart} onClose={() => { setShowCart(false); setPayStep('cart'); }} onPay={handlePlaceOrder} onRemove={removeFromCart} onSelectPayment={setPaymentMethod} onSetPayStep={setPayStep} onSetTab={setTab} onTip={setTip} />}
  </div>;
}

function CartSheet({ cart, cartTotal, total, lastReceipt, payStep, paymentMethod, placing, reference, tip, onAdd, onClose, onPay, onRemove, onSelectPayment, onSetPayStep, onSetTab, onTip }: { cart: CartItem[]; cartTotal: number; total: number; lastReceipt: { orderNumber: string; reference: string; pickup: string } | null; payStep: PayStep; paymentMethod: Order['payment_method']; placing: boolean; reference: string; tip: string; onAdd: (product: Product) => void; onClose: () => void; onPay: () => void; onRemove: (id: string) => void; onSelectPayment: (method: Order['payment_method']) => void; onSetPayStep: (step: PayStep) => void; onSetTab: (tab: Tab) => void; onTip: (tip: string) => void; }) {
  return <div className="fixed inset-0 z-40 flex flex-col justify-end bg-slate-950/50" onClick={onClose}><section className="max-h-[88vh] overflow-y-auto rounded-t-[2rem] bg-white" onClick={(e) => e.stopPropagation()}><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><h2 className="text-xl font-black">{payStep === 'receipt' ? 'Recibo digital' : payStep === 'payment' ? 'Confirmar pago' : 'Tu pedido'}</h2><button onClick={onClose} className="text-sm font-bold text-slate-400">Cerrar</button></div><div className="space-y-4 p-5">
    {payStep === 'cart' && <><div className="space-y-3">{cart.map((item) => <div key={item.id} className="flex items-center gap-3"><img src={item.image_url} alt={item.name} className="h-14 w-14 rounded-2xl object-cover" /><div className="flex-1"><p className="text-sm font-black">{item.name}</p><p className="text-sm font-bold text-green-800">${fmt(item.price)} x {item.qty}</p></div><button onClick={() => onRemove(item.id)} className="rounded-full bg-green-50 p-2 text-green-700"><Minus className="h-4 w-4" /></button><button onClick={() => onAdd(item)} className="rounded-full bg-green-600 p-2 text-white hover:bg-green-700"><Plus className="h-4 w-4" /></button></div>)}</div><div><p className="mb-2 text-sm font-black">Método de pago</p><div className="grid grid-cols-2 gap-2">{paymentOptions.map((opt) => <button key={opt.value} onClick={() => onSelectPayment(opt.value)} className={`rounded-2xl border p-3 text-left ${paymentMethod === opt.value ? 'border-green-600 bg-green-50' : 'border-slate-200'}`}><span className={`mb-2 block h-2 w-8 rounded-full ${opt.accent}`} /><span className="block text-sm font-black">{opt.label}</span><span className="text-xs text-slate-600">{opt.hint}</span></button>)}</div></div><textarea value={tip} onChange={(e) => onTip(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-200" rows={2} placeholder="Notas para cafeteria" /><Summary subtotal={cartTotal} total={total} /><Button onClick={() => onSetPayStep('payment')} className="w-full rounded-2xl bg-green-600 py-6 text-white hover:bg-green-700">Continuar al pago <ChevronRight className="ml-1 h-5 w-5" /></Button></>}
    {payStep === 'payment' && <><div className="rounded-3xl bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-green-600" /><p className="font-black">Pago - {paymentOptions.find((p) => p.value === paymentMethod)?.label}</p></div><p className="text-sm text-slate-600">Referencia: <b>{reference}</b></p><p className="text-sm text-slate-600">Total a registrar: <b>${fmt(total)}</b></p><p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-700">El pago quedará pendiente hasta que un administrador lo revise y apruebe. El QR de recogida se habilitará únicamente después de la aprobación.</p></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => onSetPayStep('cart')} className="rounded-2xl py-6">Volver</Button><Button disabled={placing} onClick={onPay} className="rounded-2xl bg-green-600 py-6 text-white hover:bg-green-700">{placing ? 'Procesando...' : 'Enviar para aprobación'}</Button></div></>}
    {payStep === 'receipt' && lastReceipt && <div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-5 text-center"><Clock3 className="mx-auto mb-3 h-12 w-12 text-amber-600" /><p className="text-sm font-bold text-slate-600">Pedido enviado</p><p className="text-3xl font-black text-slate-900">{lastReceipt.orderNumber}</p><p className="mt-3 text-sm font-bold text-amber-700">Pago pendiente de aprobación</p><p className="mt-2 text-sm text-slate-600">El código QR y el código de recogida estarán disponibles cuando Admin apruebe el pago.</p><p className="mt-3 text-xs text-slate-600">Ref. pago: {lastReceipt.reference}</p><Button onClick={() => { onClose(); onSetTab('orders'); onSetPayStep('cart'); }} className="mt-5 w-full rounded-2xl bg-green-600 py-6 text-white hover:bg-green-700">Ver historial</Button></div>}
  </div></section></div>;
}
function Summary({ subtotal, total }: { subtotal: number; total: number }) { return <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm"><div className="flex justify-between border-t pt-2 text-lg font-black"><span>Total</span><span className="text-green-800">${fmt(total)}</span></div>{subtotal !== total && <div className="text-xs text-slate-500">Subtotal: ${fmt(subtotal)}</div>}</div>; }
function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Icon className="mx-auto mb-3 h-12 w-12 text-green-300" /><h3 className="font-black">{title}</h3><p className="mt-1 text-sm text-slate-600">{text}</p></div>; }
function statusData(order: Order): [string, number, LucideIcon] { if (order.status === 'cancelled') return ['Cancelado', 100, XCircle]; if (order.status === 'delivered') return ['Entregado', 100, CheckCircle2]; if (order.status === 'ready') return ['Listo para recoger', 78, PackageCheck]; if (order.status === 'preparing') return ['En preparación', 52, Utensils]; return ['Recibido', 22, Clock3]; }
function OrderCard({ order }: { order: Order }) {
  const [label, progress, Icon] = statusData(order);
  const [expanded, setExpanded] = useState(false);
  const created = new Date(order.created_at);
  const paymentApproved = order.payment_status === 'confirmed';
  const cancelled = order.status === 'cancelled';
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setExpanded((value) => !value)} className="w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">#{order.order_number}</p><h3 className="font-black">{label}</h3><p className="mt-1 text-xs text-slate-500">{created.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })} · {created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p></div><div className="flex items-center gap-2"><Badge className={paymentApproved ? 'bg-green-500 text-white' : order.payment_status === 'rejected' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}>{paymentApproved ? 'Pagado' : order.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}</Badge><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} /></div></div><div className="mt-3 flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-2xl ${cancelled ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}><Icon className="h-5 w-5" /></div><div className="flex-1"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${cancelled ? 'bg-red-600' : 'bg-green-600'}`} style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-600">{cancelled ? 'El pago fue rechazado y el pedido quedó cancelado.' : <>Recogida: <b>{paymentApproved ? (order.pickup_code ?? '----') : 'Disponible tras aprobación'}</b> - {order.estimated_minutes ?? 12} min</>}</p></div></div><div className="mt-3 flex justify-between border-t pt-3 text-sm"><span className="text-slate-600">Total</span><b className="text-green-800">${fmt(order.total)}</b></div></button>
    {expanded && <div className="border-t bg-slate-50/70 p-4"><div className="space-y-2">{order.order_items?.length ? order.order_items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.product?.name ?? 'Producto'}</p><p className="text-xs text-slate-500">{item.quantity} × ${fmt(Number(item.price))}</p></div><b className="text-sm text-green-800">${fmt(Number(item.price) * item.quantity)}</b></div>) : <p className="text-xs text-slate-500">No hay detalle de artículos disponible.</p>}</div><div className="mt-3 grid gap-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200"><div className="flex justify-between"><span className="text-slate-500">Fecha</span><b>{created.toLocaleDateString('es-CO')}</b></div><div className="flex justify-between"><span className="text-slate-500">Hora</span><b>{created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</b></div><div className="flex justify-between"><span className="text-slate-500">Método de pago</span><b>{order.payment_method === 'bre-b' ? 'Bre-B' : order.payment_method === 'cash' ? 'Efectivo' : 'Nequi'}</b></div>{order.notes && <div className="rounded-xl bg-amber-50 p-2"><p className="text-xs font-bold text-amber-800">Comentario</p><p className="text-sm text-slate-700">{order.notes}</p></div>}</div>{paymentApproved ? <div className="mt-3 flex flex-col items-center rounded-3xl border border-dashed border-green-300 bg-green-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-green-800">Código QR para reclamar</p><QRCodeSVG value={order.pickup_code ?? order.order_number} size={170} className="mt-3 rounded-xl bg-white p-2" /><p className="mt-2 text-2xl font-black tracking-[0.2em] text-green-800">{order.pickup_code ?? '----'}</p><p className="mt-1 text-xs text-slate-500">Presenta este código al recoger tu pedido.</p></div> : <div className={`mt-3 rounded-3xl border border-dashed p-4 text-center ${cancelled ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}><Clock3 className={`mx-auto h-8 w-8 ${cancelled ? 'text-red-600' : 'text-amber-600'}`} /><p className={`mt-2 text-sm font-bold ${cancelled ? 'text-red-800' : 'text-amber-800'}`}>{cancelled ? 'Pedido cancelado' : 'QR bloqueado'}</p><p className="mt-1 text-xs text-slate-600">{cancelled ? 'El pago fue rechazado; este pedido no será preparado ni entregado.' : 'El QR aparecerá cuando Admin apruebe el pago.'}</p></div>}</div>}
  </article>;
}
function RedemptionCard({ redemption }: { redemption: LoyaltyRedemption }) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(redemption.created_at);
  const productName = redemption.reward?.product?.name ?? redemption.reward?.title ?? 'Recompensa';
  const approved = redemption.status === 'approved' || redemption.status === 'delivered' || redemption.status === 'fulfilled';
  const statusLabel = approved ? (redemption.status === 'approved' ? 'Aprobado' : 'Entregado') : redemption.status === 'cancelled' ? 'Rechazado' : 'Pendiente';
  const statusClass = approved ? 'bg-green-600 text-white' : redemption.status === 'cancelled' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  return <article className="overflow-hidden rounded-3xl border border-green-200 bg-white shadow-sm"><button onClick={() => setExpanded((value) => !value)} className="w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div><Badge className="bg-green-100 text-green-800">CANJE</Badge><h3 className="mt-2 font-black">{productName}</h3><p className="mt-1 text-xs text-slate-500">{created.toLocaleDateString('es-CO')} · {created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p></div><div className="flex items-center gap-2"><Badge className={statusClass}>{statusLabel}</Badge><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} /></div></div><div className="mt-3 flex justify-between rounded-2xl bg-green-50 px-3 py-2 text-sm"><span className="text-slate-600">Puntos canjeados</span><b className="text-green-800">{redemption.points_spent} pts</b></div></button>{expanded && <div className="border-t bg-green-50/50 p-4"><div className="grid gap-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-green-100"><div className="flex justify-between"><span className="text-slate-500">Tipo</span><b>Canje</b></div><div className="flex justify-between"><span className="text-slate-500">Producto</span><b>{productName}</b></div><div className="flex justify-between"><span className="text-slate-500">Puntos</span><b>{redemption.points_spent}</b></div><div className="flex justify-between"><span className="text-slate-500">Fecha</span><b>{created.toLocaleDateString('es-CO')}</b></div><div className="flex justify-between"><span className="text-slate-500">Hora</span><b>{created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</b></div><div className="flex justify-between"><span className="text-slate-500">Estado</span><b>{statusLabel}</b></div></div>{approved ? <div className="mt-3 flex flex-col items-center rounded-3xl border border-dashed border-green-300 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-green-800">QR para reclamar canje</p><QRCodeSVG value={redemption.redemption_code} size={170} className="mt-3 rounded-xl bg-white p-2" /><p className="mt-2 text-xl font-black tracking-[0.12em] text-green-800">{redemption.redemption_code}</p></div> : <div className="mt-3 rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center"><Clock3 className="mx-auto h-8 w-8 text-amber-600" /><p className="mt-2 text-sm font-bold text-amber-800">QR bloqueado</p><p className="mt-1 text-xs text-slate-600">El QR aparecerá únicamente cuando Admin apruebe el canje.</p></div>}</div>}</article>;
}
