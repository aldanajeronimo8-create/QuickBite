import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import { getErrorMessage } from '../../../lib/errorMessage';
import { requireSupabaseClient, type LoyaltyReward, type Order, type Product } from '../../../lib/supabase';
import { UserNotificationBell } from '../../components/notifications/UserNotificationBell';
import { StudentRewardsPanel } from '../../components/student/StudentRewardsPanel';
import { useLoyalty } from '../../hooks/useLoyalty';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { CheckCircle2, ChevronRight, Clock3, CreditCard, History, Home, LogOut, Minus, PackageCheck, Plus, ReceiptText, Search, ShoppingCart, Star, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessStudent } from '../../../lib/access';
import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';

type Tab = 'menu' | 'orders' | 'rewards';
type PayStep = 'cart' | 'payment' | 'receipt';
interface CartItem extends Product { qty: number; }
interface Student { id: string; name: string; grade: string; email?: string; }
const fmt = (n: number) => n.toLocaleString('es-CO');
const paymentOptions = [
  { value: 'nequi', label: 'Nequi', hint: 'Referencia digital', accent: 'bg-fuchsia-500' },
  { value: 'bancolombia', label: 'Bancolombia', hint: 'Transferencia escolar', accent: 'bg-yellow-500' },
  { value: 'daviplata', label: 'Daviplata', hint: 'Pago digital', accent: 'bg-red-500' },
  { value: 'cash', label: 'Efectivo', hint: 'Pago al recoger', accent: 'bg-emerald-500' },
] as const;

export function StudentMenuPage() {
  const navigate = useNavigate();
  const { categories, products, orders, loadData, addOrder } = useDataStore();
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
  const serviceFee = 0;
  const cartGrandTotal = cartTotal;
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const navigationTabs = rewardsEnabled ? [['menu', Home, 'Menú'], ['orders', History, 'Historial'], ['rewards', Star, 'Puntos']] as const : [['menu', Home, 'Menú'], ['orders', History, 'Historial']] as const;
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
    setCart((prev) => prev.some((i) => i.id === product.id) ? prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...product, qty: 1 }]);
  };
  const removeFromCart = (id: string) => setCart((prev) => {
    const existing = prev.find((i) => i.id === id);
    if (!existing) return prev;
    return existing.qty === 1 ? prev.filter((i) => i.id !== id) : prev.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i);
  });
  const cartQty = (id: string) => cart.find((i) => i.id === id)?.qty ?? 0;
  const reference = useMemo(() => `QB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, [showCart, payStep]);
  const pickup = useMemo(() => Math.random().toString(36).slice(2, 6).toUpperCase(), [showCart, payStep]);

  const handlePlaceOrder = async () => {
    if (!student || cart.length === 0) return;
    setPlacing(true);
    try {
      const orderNumber = await addOrder({
        user_id: student.id,
        total: cartGrandTotal,
        status: paymentMethod === 'cash' ? 'pending' : 'preparing',
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'cash' ? 'pending' : 'confirmed',
        pickup_code: pickup,
        estimated_minutes: 8 + cart.length * 3,
        payment_reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : reference,
        order_items: cart.map((i) => ({ product_id: i.id, quantity: i.qty, price: i.price })),
      });

      const comment = tip.trim();
      if (comment) {
        const { error: commentError } = await requireSupabaseClient().rpc('update_own_order_comment', {
          p_order_number: orderNumber,
          p_comment: comment,
        });
        if (commentError) throw commentError;
      }

      setLastReceipt({ orderNumber, reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : reference, pickup });
      setCart([]);
      setTip('');
      setPayStep('receipt');
      toast.success(`Pedido ${orderNumber} creado`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar el pedido');
    } finally { setPlacing(false); }
  };

  const handleLogout = async () => { await requireSupabaseClient().auth.signOut(); navigate('/'); };
  const handleRewardRedemption = async (reward: LoyaltyReward) => {
    if (redeemingRewardId) return;
    setRedeemingRewardId(reward.id);
    try {
      const redemption = await loyalty.redeem(reward.id);
      toast.success(`Canje confirmado. Presenta el codigo ${redemption.redemption_code ?? 'generado en tu historial'} en caja.`);
    } catch (error) { toast.error(getErrorMessage(error, 'No se pudo completar el canje.')); }
    finally { setRedeemingRewardId(null); }
  };

  if (!student) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="sticky top-0 z-20 bg-[#166534] text-white shadow-xl shadow-green-950/10">
        <div className="mx-auto max-w-6xl px-5 pb-5 pt-5 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><QuickBiteLogo className="h-11 w-11 rounded-2xl" /><div><p className="text-lg font-black leading-none">QuickBite</p><p className="text-xs text-green-100">{student.name}{student.grade ? ` - ${student.grade}` : ''}</p></div></div>
            <div className="flex items-center gap-2"><UserNotificationBell userId={student.id} /><button onClick={() => setShowCart(true)} className="relative rounded-full bg-white/10 p-2" aria-label="Abrir carrito"><ShoppingCart className="h-5 w-5" />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-green-500 text-xs font-black">{cartCount}</span>}</button><button onClick={handleLogout} className="rounded-full bg-white/10 p-2" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button></div>
          </div>
          <div className="mt-5 rounded-[2rem] bg-gradient-to-r from-green-600 to-green-700 p-4 text-white shadow-lg shadow-green-950/10"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-green-100">Recreo inteligente</p><h1 className="mt-1 text-2xl font-black">Pide ahora, recoge sin fila</h1></div>{rewardsEnabled && <Badge className="bg-white text-green-800">{loyalty.availablePoints} pts</Badge>}</div><div className="mt-4 flex gap-2 overflow-x-auto"><span className="rounded-full bg-white/20 px-3 py-1 text-xs">Inventario en vivo</span><span className="rounded-full bg-white/20 px-3 py-1 text-xs">Tiempo promedio: 12 min</span></div></div>
        </div>
      </header>

      <nav className={`sticky top-[190px] z-10 mx-5 mt-5 grid ${rewardsEnabled ? 'grid-cols-3' : 'grid-cols-2'} rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200`}>{navigationTabs.map(([id, Icon, label]) => <button key={id} onClick={() => setTab(id)} className={`flex items-center justify-center gap-1 rounded-xl py-2 text-sm font-bold transition ${activeTab === id ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600 hover:bg-green-50'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

      {activeTab === 'menu' && <main className="mx-auto max-w-6xl px-5 pt-6 lg:px-8">
        <div className="relative mb-3"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empanadas, jugos, almuerzos..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-green-200" /></div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setSelectedCat(null)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${!selectedCat ? 'bg-[#DCFCE7] text-green-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todo</button>{categories.map((cat) => <button key={cat.id} onClick={() => setSelectedCat(cat.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${selectedCat === cat.id ? 'bg-[#DCFCE7] text-green-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{cat.name}</button>)}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{availableProducts.map((product) => { const qty = cartQty(product.id); return <article key={product.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="relative"><img src={product.image_url} alt={product.name} className="h-44 w-full object-cover" /><span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700">Stock {product.stock}</span></div><div className="p-4"><p className="min-h-10 text-sm font-black leading-tight">{product.name}</p><p className="line-clamp-1 text-xs text-slate-600">{product.description}</p><p className="mt-2 text-lg font-black text-green-800">${fmt(product.price)}</p>{qty === 0 ? <button onClick={() => addToCart(product)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-green-600 py-2 text-sm font-bold text-white hover:bg-green-700"><Plus className="h-4 w-4" />Agregar</button> : <div className="mt-2 flex items-center justify-between rounded-2xl bg-green-50 p-1"><button onClick={() => removeFromCart(product.id)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-green-700"><Minus className="h-4 w-4" /></button><span className="font-black">{qty}</span><button onClick={() => addToCart(product)} className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-white hover:bg-green-700"><Plus className="h-4 w-4" /></button></div>}</div></article>; })}</div>
      </main>}

      {activeTab === 'orders' && <main className="mx-auto max-w-3xl space-y-4 px-5 pt-6 lg:px-8">{myOrders.length === 0 ? <Empty icon={ReceiptText} title="Aun no tienes compras" text="Cuando confirmes tu primer pedido aparecera aqui con su estado y codigo de recogida." /> : myOrders.map((order) => <article key={order.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Pedido #{order.order_number}</p><h2 className="mt-1 text-lg font-black">${fmt(Number(order.total))}</h2></div><Badge>{order.status}</Badge></div><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-bold text-slate-500"><StatusStep active={['pending','confirmed','preparing','ready','delivered'].includes(order.status)} icon={Clock3} label="Recibido" /><StatusStep active={['preparing','ready','delivered'].includes(order.status)} icon={Utensils} label="Preparando" /><StatusStep active={['ready','delivered'].includes(order.status)} icon={PackageCheck} label="Listo" /><StatusStep active={order.status === 'delivered'} icon={CheckCircle2} label="Entregado" /></div><p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Código de recogida: <strong>{order.pickup_code ?? '—'}</strong></p></article>)}</main>}

      {activeTab === 'rewards' && rewardsEnabled && <main className="mx-auto max-w-3xl px-5 pt-6 lg:px-8"><StudentRewardsPanel rewards={loyalty.rewards} availablePoints={loyalty.availablePoints} redemptions={loyalty.redemptions} loading={loyalty.loading} error={loyalty.error} onRedeem={handleRewardRedemption} redeemDisabled={Boolean(redeemingRewardId)} /></main>}

      {showCart && <div className="fixed inset-0 z-40 bg-slate-950/40 p-4" onClick={() => setShowCart(false)}><section className="mx-auto mt-10 max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-xl font-black">Tu carrito</h2><button onClick={() => setShowCart(false)} className="rounded-full bg-slate-100 p-2">×</button></div>{cart.length === 0 ? <p className="py-10 text-center text-slate-500">Tu carrito está vacío.</p> : <><div className="mt-5 space-y-3">{cart.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div><p className="font-bold">{item.name}</p><p className="text-sm text-slate-500">{item.qty} × ${fmt(item.price)}</p></div><div className="flex gap-1"><button onClick={() => removeFromCart(item.id)} className="rounded-full bg-white p-2"><Minus className="h-4 w-4" /></button><button onClick={() => addToCart(item)} className="rounded-full bg-green-600 p-2 text-white"><Plus className="h-4 w-4" /></button></div></div>)}</div><div className="mt-5 flex items-center justify-between border-t pt-4"><span className="font-bold">Total</span><strong className="text-xl">${fmt(cartGrandTotal)}</strong></div><Button className="mt-4 w-full" onClick={() => setPayStep('payment')}>Continuar al pago <ChevronRight className="ml-1 h-4 w-4" /></Button></>}</section></div>}

      {showCart && payStep === 'payment' && <div className="fixed inset-0 z-50 bg-slate-950/50 p-4" onClick={() => setPayStep('cart')}><section className="mx-auto mt-10 max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><h2 className="text-xl font-black">Método de pago</h2><div className="mt-4 grid grid-cols-2 gap-2">{paymentOptions.map((option) => <button key={option.value} onClick={() => setPaymentMethod(option.value as Order['payment_method'])} className={`rounded-2xl border p-3 text-left ${paymentMethod === option.value ? 'border-green-600 bg-green-50' : 'border-slate-200'}`}><span className="font-bold">{option.label}</span><span className="block text-xs text-slate-500">{option.hint}</span></button>)}</div><Button className="mt-5 w-full" disabled={placing} onClick={handlePlaceOrder}>{placing ? 'Enviando…' : 'Confirmar pedido'}</Button></section></div>}

      {lastReceipt && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl"><CheckCircle2 className="mx-auto h-14 w-14 text-green-600" /><h2 className="mt-3 text-2xl font-black">¡Pedido confirmado!</h2><p className="mt-2 text-slate-600">#{lastReceipt.orderNumber}</p><div className="mt-5 rounded-2xl bg-green-50 p-4"><p className="text-xs font-bold uppercase text-green-700">Código de recogida</p><p className="mt-1 text-3xl font-black tracking-widest text-green-800">{lastReceipt.pickup}</p></div><Button className="mt-5 w-full" onClick={() => { setLastReceipt(null); setShowCart(false); setTab('orders'); setPayStep('cart'); }}>Ver mi pedido</Button></section></div>}
    </div>
  );
}

function StatusStep({ active, icon: Icon, label }: { active: boolean; icon: LucideIcon; label: string }) { return <div className={active ? 'text-green-700' : 'text-slate-300'}><Icon className="mx-auto h-5 w-5" /><span className="mt-1 block">{label}</span></div>; }
function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><Icon className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
