import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import { requireSupabaseClient, type Order, type Product } from '../../../lib/supabase';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  CreditCard,
  History,
  Home,
  LogOut,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  TicketPercent,
  Utensils,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tab = 'menu' | 'orders' | 'rewards';
type PayStep = 'cart' | 'payment' | 'receipt';

interface CartItem extends Product {
  qty: number;
}

interface Student {
  id: string;
  name: string;
  grade: string;
  email?: string;
}

const fmt = (n: number) => n.toLocaleString('es-CO');

const paymentOptions = [
  { value: 'nequi', label: 'Nequi', hint: 'Referencia digital', accent: 'bg-fuchsia-500' },
  {
    value: 'bancolombia',
    label: 'Bancolombia',
    hint: 'Transferencia escolar',
    accent: 'bg-yellow-500',
  },
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
  const [checkout, setCheckout] = useState({ reference: '', pickup: '' });
  const [lastReceipt, setLastReceipt] = useState<{
    orderNumber: string;
    reference: string;
    pickup: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function initializeStudentSession() {
      try {
        const client = requireSupabaseClient();
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        const authUser = sessionData.session?.user;
        if (!authUser) {
          navigate('/');
          return;
        }

        const { data: profile, error } = await client
          .from('profiles')
          .select('id,email,full_name,role,ti')
          .eq('id', authUser.id)
          .maybeSingle();

        if (error) throw error;
        if (!profile || !['student', 'admin', 'both'].includes(profile.role)) {
          await client.auth.signOut();
          navigate('/');
          return;
        }

        if (active) {
          setStudent({
            id: profile.id,
            name: profile.full_name,
            grade: profile.ti ?? '',
            email: profile.email,
          });
        }
        await loadData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar tu sesion');
        navigate('/setup');
      }
    }

    initializeStudentSession();
    return () => {
      active = false;
    };
  }, [loadData, navigate]);

  const myOrders = useMemo(
    () => (student ? orders.filter((o) => o.user_id === student.id) : []),
    [orders, student],
  );
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const serviceFee = paymentMethod === 'cash' ? 0 : 250;
  const cartGrandTotal = cartTotal + serviceFee;
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const points = myOrders
    .filter((o) => o.payment_status === 'confirmed')
    .reduce((s, o) => s + Math.floor(o.total / 1000), 0);

  const availableProducts = useMemo(
    () =>
      products.filter((p) => {
        const byCat = selectedCat ? p.category_id === selectedCat : true;
        const byQuery = `${p.name} ${p.description ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return p.available && p.stock > 0 && byCat && byQuery;
      }),
    [products, selectedCat, query],
  );

  useEffect(() => {
    setCart((currentCart) => {
      if (currentCart.length === 0) return currentCart;
      let changed = false;
      const nextCart = currentCart.flatMap((item) => {
        const latest = products.find((product) => product.id === item.id);
        if (!latest || !latest.available || latest.stock <= 0) {
          changed = true;
          return [];
        }
        const nextQty = Math.min(item.qty, latest.stock);
        if (nextQty !== item.qty || latest.price !== item.price || latest.name !== item.name) {
          changed = true;
        }
        return [{ ...latest, qty: nextQty }];
      });
      if (changed) toast.info('Actualizamos tu carrito porque el menu cambio.');
      return changed ? nextCart : currentCart;
    });
  }, [products]);

  const addToCart = (product: Product) => {
    const current = cart.find((i) => i.id === product.id)?.qty ?? 0;
    if (current >= product.stock) {
      toast.warning('No queda mas stock disponible');
      return;
    }
    setCart((prev) =>
      prev.some((i) => i.id === product.id)
        ? prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { ...product, qty: 1 }],
    );
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (!existing) return prev;
      return existing.qty === 1
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i));
    });

  const cartQty = (id: string) => cart.find((i) => i.id === id)?.qty ?? 0;
  const startCheckout = () => {
    setCheckout({
      reference: `QB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      pickup: Math.random().toString(36).slice(2, 6).toUpperCase(),
    });
    setShowCart(true);
    setPayStep('cart');
  };

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
        pickup_code: checkout.pickup,
        estimated_minutes: 8 + cart.length * 3,
        payment_reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : checkout.reference,
        order_items: cart.map((i) => ({ product_id: i.id, quantity: i.qty, price: i.price })),
      });
      setLastReceipt({
        orderNumber,
        reference: paymentMethod === 'cash' ? 'PAGO-EN-CAJA' : checkout.reference,
        pickup: checkout.pickup,
      });
      setCart([]);
      setPayStep('receipt');
      toast.success(`Pedido ${orderNumber} creado`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al enviar el pedido');
    } finally {
      setPlacing(false);
    }
  };

  const handleLogout = async () => {
    await requireSupabaseClient().auth.signOut();
    navigate('/');
  };

  if (!student) return null;

  return (
    <div className="min-h-screen bg-[#fff7e8] pb-24 text-slate-900">
      <header className="sticky top-0 z-20 bg-[#14213d] text-white shadow-xl shadow-orange-900/10">
        <div className="mx-auto max-w-6xl px-5 pb-5 pt-5 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30">
                <Coffee className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-black leading-none">QuickBite</p>
                <p className="text-xs text-orange-100">
                  {student.name}
                  {student.grade ? ` - ${student.grade}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCart(true)}
                className="relative rounded-full bg-white/10 p-2"
                aria-label="Abrir carrito"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-xs font-black">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="rounded-full bg-white/10 p-2"
                aria-label="Cerrar sesion"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mt-5 rounded-[2rem] bg-gradient-to-r from-orange-500 to-amber-400 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-100">
                  Recreo inteligente
                </p>
                <h1 className="mt-1 text-2xl font-black">Pide ahora, recoge sin fila</h1>
              </div>
              <Badge className="bg-white text-orange-700">{points} pts</Badge>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs">Inventario en vivo</span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs">
                Tiempo promedio: 12 min
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav className="sticky top-[190px] z-10 mx-5 mt-5 grid grid-cols-3 rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-orange-100">
        {(
          [
            ['menu', Home, 'Menu'],
            ['orders', History, 'Historial'],
            ['rewards', Star, 'Puntos'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-sm font-bold transition ${tab === id ? 'bg-[#14213d] text-white' : 'text-slate-600'}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'menu' && (
        <main className="mx-auto max-w-6xl px-5 pt-6 lg:px-8">
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar empanadas, jugos, almuerzos..."
              className="w-full rounded-2xl border border-orange-100 bg-white py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCat(null)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${!selectedCat ? 'bg-orange-500 text-white' : 'bg-white text-slate-600'}`}
            >
              Todo
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${selectedCat === cat.id ? 'bg-orange-500 text-white' : 'bg-white text-slate-600'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {availableProducts.map((product) => {
              const qty = cartQty(product.id);
              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="relative">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-44 w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-slate-700">
                      Stock {product.stock}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="min-h-10 text-sm font-black leading-tight">{product.name}</p>
                    <p className="line-clamp-1 text-xs text-slate-600">{product.description}</p>
                    <p className="mt-2 text-lg font-black text-orange-500">${fmt(product.price)}</p>
                    {qty === 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-[#14213d] py-2 text-sm font-bold text-white"
                      >
                        <Plus className="h-4 w-4" />
                        Agregar
                      </button>
                    ) : (
                      <div className="mt-2 flex items-center justify-between rounded-2xl bg-orange-50 p-1">
                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="grid h-8 w-8 place-items-center rounded-full bg-white text-orange-600"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="font-black">{qty}</span>
                        <button
                          onClick={() => addToCart(product)}
                          className="grid h-8 w-8 place-items-center rounded-full bg-orange-500 text-white"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      )}

      {tab === 'orders' && (
        <main className="mx-auto max-w-3xl space-y-4 px-5 pt-6 lg:px-8">
          {myOrders.length === 0 ? (
            <Empty
              icon={ReceiptText}
              title="Aun no tienes compras"
              text="Cuando confirmes tu primer pedido aparecera aqui con su recibo y estado."
            />
          ) : (
            myOrders.map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </main>
      )}
      {tab === 'rewards' && (
        <main className="mx-auto max-w-6xl px-5 pt-6 lg:px-8">
          <div className="rounded-3xl bg-[#14213d] p-5 text-white">
            <Sparkles className="mb-3 h-8 w-8 text-orange-300" />
            <p className="text-sm text-orange-100">Tus puntos QuickBite</p>
            <p className="text-5xl font-black">{points}</p>
            <p className="mt-2 text-sm text-white/70">
              Gana 1 punto por cada $1.000 en pagos confirmados.
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            <Reward points={20} current={points} title="Jugo gratis" />
            <Reward points={45} current={points} title="Empanada + bebida" />
            <Reward points={80} current={points} title="Almuerzo con descuento" />
          </div>
        </main>
      )}

      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 z-30">
          <button
            onClick={startCheckout}
            className="flex w-full items-center justify-between rounded-3xl bg-orange-500 px-5 py-4 font-black text-white shadow-2xl shadow-orange-500/30"
          >
            <span>{cartCount} items</span>
            <span>Ver pedido</span>
            <span>${fmt(cartGrandTotal)}</span>
          </button>
        </div>
      )}

      {showCart && (
        <CartSheet
          cart={cart}
          cartTotal={cartTotal}
          fee={serviceFee}
          total={cartGrandTotal}
          lastReceipt={lastReceipt}
          payStep={payStep}
          paymentMethod={paymentMethod}
          placing={placing}
          reference={checkout.reference}
          tip={tip}
          onAdd={addToCart}
          onClose={() => {
            setShowCart(false);
            setPayStep('cart');
          }}
          onPay={handlePlaceOrder}
          onRemove={removeFromCart}
          onSelectPayment={setPaymentMethod}
          onSetPayStep={setPayStep}
          onSetTab={setTab}
          onTip={setTip}
        />
      )}
    </div>
  );
}

function CartSheet({
  cart,
  cartTotal,
  fee,
  total,
  lastReceipt,
  payStep,
  paymentMethod,
  placing,
  reference,
  tip,
  onAdd,
  onClose,
  onPay,
  onRemove,
  onSelectPayment,
  onSetPayStep,
  onSetTab,
  onTip,
}: {
  cart: CartItem[];
  cartTotal: number;
  fee: number;
  total: number;
  lastReceipt: { orderNumber: string; reference: string; pickup: string } | null;
  payStep: PayStep;
  paymentMethod: Order['payment_method'];
  placing: boolean;
  reference: string;
  tip: string;
  onAdd: (product: Product) => void;
  onClose: () => void;
  onPay: () => void;
  onRemove: (id: string) => void;
  onSelectPayment: (method: Order['payment_method']) => void;
  onSetPayStep: (step: PayStep) => void;
  onSetTab: (tab: Tab) => void;
  onTip: (tip: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-slate-950/50" onClick={onClose}>
      <section
        className="max-h-[88vh] overflow-y-auto rounded-t-[2rem] bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 className="text-xl font-black">
            {payStep === 'receipt'
              ? 'Recibo digital'
              : payStep === 'payment'
                ? 'Confirmar pago'
                : 'Tu pedido'}
          </h2>
          <button onClick={onClose} className="text-sm font-bold text-slate-400">
            Cerrar
          </button>
        </div>
        <div className="space-y-4 p-5">
          {payStep === 'cart' && (
            <>
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-14 w-14 rounded-2xl object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-black">{item.name}</p>
                      <p className="text-sm font-bold text-orange-500">
                        ${fmt(item.price)} x {item.qty}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="rounded-full bg-orange-50 p-2 text-orange-600"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onAdd(item)}
                      className="rounded-full bg-orange-500 p-2 text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-black">Metodo de pago</p>
                <div className="grid grid-cols-2 gap-2">
                  {paymentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onSelectPayment(opt.value)}
                      className={`rounded-2xl border p-3 text-left ${paymentMethod === opt.value ? 'border-orange-500 bg-orange-50' : 'border-slate-100'}`}
                    >
                      <span className={`mb-2 block h-2 w-8 rounded-full ${opt.accent}`} />
                      <span className="block text-sm font-black">{opt.label}</span>
                      <span className="text-xs text-slate-600">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={tip}
                onChange={(e) => onTip(e.target.value)}
                className="w-full rounded-2xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                rows={2}
                placeholder="Notas para cafeteria"
              />
              <Summary subtotal={cartTotal} fee={fee} total={total} />
              <Button
                onClick={() => onSetPayStep('payment')}
                className="w-full rounded-2xl bg-[#14213d] py-6 text-white"
              >
                Continuar al pago <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </>
          )}
          {payStep === 'payment' && (
            <>
              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-orange-500" />
                  <p className="font-black">
                    Pago - {paymentOptions.find((p) => p.value === paymentMethod)?.label}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  Referencia: <b>{reference}</b>
                </p>
                <p className="text-sm text-slate-600">
                  Total a registrar: <b>${fmt(total)}</b>
                </p>
                <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
                  {paymentMethod === 'cash'
                    ? 'El pedido quedara pendiente hasta que el admin confirme el efectivo.'
                    : 'El pedido quedara confirmado y sincronizado en Supabase.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => onSetPayStep('cart')}
                  className="rounded-2xl py-6"
                >
                  Volver
                </Button>
                <Button
                  disabled={placing}
                  onClick={onPay}
                  className="rounded-2xl bg-orange-500 py-6 text-white"
                >
                  {placing ? 'Procesando...' : 'Pagar'}
                </Button>
              </div>
            </>
          )}
          {payStep === 'receipt' && lastReceipt && (
            <div className="rounded-3xl border border-dashed border-orange-300 bg-orange-50 p-5 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <p className="text-sm font-bold text-slate-600">Pedido creado</p>
              <p className="text-3xl font-black text-[#14213d]">{lastReceipt.orderNumber}</p>
              <p className="mt-3 text-sm">Codigo de recogida</p>
              <p className="text-4xl font-black tracking-[0.2em] text-orange-500">
                {lastReceipt.pickup}
              </p>
              <p className="mt-3 text-xs text-slate-600">Ref. pago: {lastReceipt.reference}</p>
              <Button
                onClick={() => {
                  onClose();
                  onSetTab('orders');
                  onSetPayStep('cart');
                }}
                className="mt-5 w-full rounded-2xl bg-[#14213d] py-6 text-white"
              >
                Ver historial
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Summary({ subtotal, fee, total }: { subtotal: number; fee: number; total: number }) {
  return (
    <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <b>${fmt(subtotal)}</b>
      </div>
      <div className="flex justify-between">
        <span>Cargo de pago</span>
        <b>{fee ? `$${fmt(fee)}` : 'Gratis'}</b>
      </div>
      <div className="flex justify-between border-t pt-2 text-lg font-black">
        <span>Total</span>
        <span className="text-orange-500">${fmt(total)}</span>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
      <Icon className="mx-auto mb-3 h-12 w-12 text-orange-300" />
      <h3 className="font-black">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function statusData(order: Order): [string, number, LucideIcon] {
  if (order.status === 'delivered') return ['Entregado', 100, CheckCircle2];
  if (order.status === 'ready') return ['Listo para recoger', 78, PackageCheck];
  if (order.status === 'preparing') return ['En preparacion', 52, Utensils];
  return ['Recibido', 22, Clock3];
}

function OrderCard({ order }: { order: Order }) {
  const [label, progress, Icon] = statusData(order);
  const purchasedItems = order.order_items?.length
    ? order.order_items
        .map((item) => `${item.quantity}× ${item.product?.name ?? 'Producto'}`)
        .join(' · ')
    : 'Los artículos de este pedido se están cargando.';
  return (
    <article className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400">#{order.order_number}</p>
          <h3 className="font-black">{label}</h3>
        </div>
        <Badge
          className={
            order.payment_status === 'confirmed'
              ? 'bg-emerald-500 text-white'
              : order.payment_status === 'rejected'
                ? 'bg-red-500 text-white'
                : 'bg-yellow-500 text-white'
          }
        >
          {order.payment_status === 'confirmed'
            ? 'Pagado'
            : order.payment_status === 'rejected'
              ? 'Rechazado'
              : 'Pendiente'}
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-50 text-orange-500">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Recogida: <b>{order.pickup_code ?? '----'}</b> - {order.estimated_minutes ?? 12} min
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-orange-50 px-3 py-2">
        <p className="text-xs font-bold text-slate-500">Compraste</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">{purchasedItems}</p>
      </div>
      <div className="mt-3 flex justify-between border-t pt-3 text-sm">
        <span className="text-slate-600">Total</span>
        <b className="text-orange-500">${fmt(order.total)}</b>
      </div>
    </article>
  );
}

function Reward({ points, current, title }: { points: number; current: number; title: string }) {
  const unlocked = current >= points;
  return (
    <div
      className={`flex items-center gap-3 rounded-3xl p-4 ${unlocked ? 'bg-orange-500 text-white' : 'bg-white'}`}
    >
      <TicketPercent className="h-8 w-8" />
      <div className="flex-1">
        <p className="font-black">{title}</p>
        <p className={`text-xs ${unlocked ? 'text-orange-100' : 'text-slate-600'}`}>
          {points} puntos requeridos
        </p>
      </div>
      <ShieldCheck className={`h-5 w-5 ${unlocked ? 'opacity-100' : 'opacity-20'}`} />
    </div>
  );
}
