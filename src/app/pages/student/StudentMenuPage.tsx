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
        const { data: wallet, error: walletError } = await client.from('wallet_accounts').select('balance').eq('user_id', authUser.id).maybeSingle();
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
    initializeStudentSession();
    return () => { active = false; };
  }, [loadData, navigate]);

  const myOrders = useMemo(() => (student ? orders.filter((o) => o.user_id === student.id) : []), [orders, student]);
  const loyalty = useLoyalty(student?.id, orders);
  const rewardsEnabled = loyalty.enabled;
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartGrandTotal = cartTotal;
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const creditsInsufficient = paymentMethod === 'credits' && walletBalance < cartGrandTotal;
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
        notes: note || null,
        order_items: cart.map((i) => ({ product_id: i.id, quantity: i.qty, price: i.price }))
      });
      const paidWithCredits = paymentMethod === 'credits';
      setLastReceipt({ orderNumber, reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : paymentMethod === 'credits' ? 'PAGO-CON-CREDITOS' : reference, pickup, paidWithCredits });
      setCart([]); setTip(''); setPayStep('receipt');
      toast.success(paidWithCredits ? `Pedido ${orderNumber} pagado con créditos.` : `Pedido ${orderNumber} creado y enviado para aprobación`);
      await loadData();
      const { data: wallet } = await requireSupabaseClient().from('wallet_accounts').select('balance').eq('user_id', student.id).maybeSingle();
      setWalletBalance(Number(wallet?.balance ?? 0));
    } catch (error) {
      const message = getErrorMessage(error, 'Error al enviar el pedido');
      if (/insufficient_wallet_balance|Insufficient wallet balance/i.test(message)) {
        toast.error('No tienes créditos suficientes para pagar este pedido.');
      } else {
        toast.error(message);
      }
    }
    finally { setPlacing(false); }
  };

  const handleLogout = async () => { await requireSupabaseClient().auth.signOut(); navigate('/'); };
  const handleRewardRedemption = async (reward: LoyaltyReward) => {
    if (redeemingRewardId) return;
    setRedeemingRewardId(reward.id);
    try { await loyalty.redeem(reward.id); toast.success('Canje solicitado. El codigo estara disponible cuando Admin lo apruebe.'); }
    catch (error) { toast.error(getErrorMessage(error, 'No se pudo completar el canje.')); }
    finally { setRedeemingRewardId(null); }
  };
  if (!student) return null;

  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
    <header className="sticky top-0 z-20 bg-[#166534] text-white shadow-xl shadow-green-950/10"><div className="mx-auto max-w-6xl px-5 pb-5 pt-5 lg:px-8"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><QuickBiteLogo className="h-11 w-11 rounded-2xl" /><div><p className="text-lg font-black leading-none">QuickBite</p><p className="text-xs text-green-100">{student.name}{student.grade ? ` - ${student.grade}` : ''}</p></div></div><div className="flex items-center gap-2"><UserNotificationBell userId={student.id} /><button onClick={() => setShowCart(true)} className="relative rounded-full bg-white/10 p-2" aria-label="Abrir carrito"><ShoppingCart className="h-5 w-5" />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-green-500 text-xs font-black">{cartCount}</span>}</button><button onClick={handleLogout} className="rounded-full bg-white/10 p-2" aria-label="Cerrar sesión"><LogOut className="h-5 w-5" /></button></div></div><div className="mt-5 rounded-[2rem] bg-gradient-to-r from-green-600 to-green-700 p-4 text-white shadow-lg shadow-green-950/10"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-green-100">Recreo inteligente</p><h1 className="mt-1 text-2xl font-black">Pide ahora, recoge sin fila</h1></div>{rewardsEnabled && <Badge className="bg-white text-green-800">{loyalty.availablePoints} pts</Badge>}</div><div className="mt-4 flex gap-2 overflow-x-auto">{navigationTabs.map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${activeTab === key ? 'bg-white text-green-800' : 'bg-white/10 text-white hover:bg-white/20'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div></div></header>
    <main className="mx-auto max-w-6xl px-5 py-7 lg:px-8">
      {activeTab === 'menu' && <><div className="mb-6 flex flex-col gap-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar alimentos..." className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 outline-none focus:border-green-500" /></div><div className="flex gap-2 overflow-x-auto">{categories.map((cat) => <button key={cat.id} type="button" onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${selectedCat === cat.id ? 'bg-green-700 text-white' : 'bg-white text-gray-700 shadow-sm'}`}>{cat.name}</button>)}</div></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{availableProducts.map((product) => <article key={product.id} className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"><div className="aspect-[16/10] overflow-hidden bg-green-50">{product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-4xl">🥗</div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-gray-900">{product.name}</h2><p className="mt-1 text-sm text-gray-500">{product.description}</p></div><span className="rounded-full bg-green-50 px-3 py-1 text-sm font-black text-green-800">${fmt(product.price)}</span></div><div className="mt-4 flex items-center justify-between"><span className="text-xs font-bold text-gray-500">Stock: {product.stock}</span><button type="button" onClick={() => addToCart(product)} className="inline-flex items-center gap-2 rounded-2xl bg-green-700 px-4 py-2 text-sm font-black text-white hover:bg-green-800"><Plus className="h-4 w-4"/>Agregar</button></div></div></article>)}</div></>}
      {activeTab === 'orders' && <section className="space-y-4"><div className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Mis pedidos</h2><p className="mt-1 text-sm text-gray-500">Aquí puedes consultar el estado de tus pedidos recientes.</p></div>{myOrders.length === 0 ? <div className="rounded-3xl bg-white p-10 text-center text-gray-500">No tienes pedidos registrados.</div> : myOrders.map((order) => <article key={order.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-gray-400">#{order.order_number}</p><p className="font-black capitalize">{order.status}</p><p className="text-xs text-gray-500">{order.notes ?? order.student_comment ?? ''}</p></div><span className="font-black text-green-800">${fmt(order.total)}</span></div></article>)}</section>}
      {activeTab === 'rewards' && rewardsEnabled && <StudentRewardsPanel userId={student.id} orders={orders} />}
    </main>
    {showCart && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4" onClick={() => !placing && setShowCart(false)}><div className="mx-auto mt-8 max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Tu carrito</h2><button type="button" onClick={() => !placing && setShowCart(false)} className="rounded-full p-2 hover:bg-slate-100"><XCircle className="h-5 w-5"/></button></div>{cart.length === 0 && !lastReceipt ? <p className="py-10 text-center text-gray-500">Tu carrito está vacío.</p> : payStep === 'receipt' && lastReceipt ? <div className="space-y-5 py-4"><div className="rounded-3xl bg-green-50 p-6"><CheckCircle2 className="h-10 w-10 text-green-700"/><h3 className="mt-3 text-2xl font-black">Pedido enviado</h3><p className="mt-1 text-sm text-gray-600">#{lastReceipt.orderNumber}</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-gray-500">Código de recogida</p><p className="text-2xl font-black">{lastReceipt.pickup}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-gray-500">Pago</p><p className="font-bold">{lastReceipt.paidWithCredits ? 'Créditos' : 'Pendiente de confirmación'}</p></div></div><div className="rounded-3xl border border-slate-200 p-5"><p className="mb-3 text-sm font-black">Código QR de verificación</p><div className="grid place-items-center"><QRCodeSVG value={getOrderVerificationUrl(lastReceipt.orderNumber)} size={220}/></div></div><Button type="button" onClick={() => { setShowCart(false); setLastReceipt(null); }} className="w-full bg-green-700 text-white">Cerrar</Button></div> : <div className="space-y-5 py-4"><div className="space-y-3">{cart.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div><p className="font-bold">{item.name}</p><p className="text-sm text-gray-500">{item.qty} × ${fmt(item.price)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => removeFromCart(item.id)} className="rounded-full bg-white p-2 shadow-sm"><Minus className="h-4 w-4"/></button><span className="w-6 text-center font-black">{item.qty}</span><button type="button" onClick={() => addToCart(item)} className="rounded-full bg-white p-2 shadow-sm"><Plus className="h-4 w-4"/></button></div></div>)}</div><div className="rounded-2xl bg-slate-900 p-5 text-white"><p className="text-xs uppercase tracking-wide text-slate-400">Total</p><p className="text-3xl font-black">${fmt(cartGrandTotal)}</p></div><div className="grid gap-3">{paymentOptions.map((option) => <button key={option.value} type="button" onClick={() => setPaymentMethod(option.value)} className={`rounded-2xl border p-4 text-left transition ${paymentMethod === option.value ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between"><span className="font-black">{option.label}</span><span className={`h-3 w-3 rounded-full ${option.accent}`}/></div><p className="mt-1 text-xs text-gray-500">{option.hint}</p></button>)}
          {paymentMethod === 'credits' && <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">Saldo disponible: <b>${fmt(walletBalance)}</b>{creditsInsufficient && <span className="ml-2 font-bold text-red-600">Saldo insuficiente</span>}</div>}
          <label className="text-sm font-bold text-slate-700">Comentario para la cafetería <span className="font-normal text-slate-400">(opcional)</span><textarea value={tip} onChange={(e) => setTip(e.target.value)} maxLength={500} rows={3} placeholder="Ej. Sin salsa, por favor" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 font-normal outline-none focus:border-green-500" /></label>
          <button type="button" onClick={() => void handlePlaceOrder()} disabled={placing || cart.length === 0 || creditsInsufficient} className="w-full rounded-2xl bg-green-700 px-5 py-3 font-black text-white shadow-sm hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300">{placing ? 'Enviando pedido…' : 'Confirmar pedido'}</button>
        </div></div>}</div></div>}
  </div>;
}
