import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, CreditCard, History, LayoutGrid, LogOut, Minus, Plus, Search, ShoppingCart, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import { requireSupabaseClient, type Order, type Product } from '../../../lib/supabase';
import { useStudentContextStore } from '../../../store/studentContextStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

type CartItem = Product & { qty: number };

const money = (value: number) => Number(value).toLocaleString('es-CO');

export function ParentStudentMenuPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const { categories, products, orders, loadData, addOrder } = useDataStore();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  const returnToParent = async () => {
    try {
      const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');
      if (error) throw error;
      clearActiveStudent();
      navigate('/parent/family');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo volver al panel de padre.');
    }
  };

  const loadStudentData = useCallback(async () => {
    if (!activeStudent) {
      navigate('/parent/family', { replace: true });
      return;
    }
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const { data: wallet, error: walletError } = await client.from('wallet_accounts').select('balance').eq('user_id', activeStudent.id).maybeSingle();
      if (walletError) throw walletError;
      setWalletBalance(Number(wallet?.balance ?? 0));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el entorno del estudiante.');
    } finally {
      setLoading(false);
    }
  }, [activeStudent, loadData, navigate]);

  useEffect(() => { void loadStudentData(); }, [loadStudentData]);

  const studentOrders = useMemo(() => (activeStudent ? orders.filter((order) => order.user_id === activeStudent.id) : []), [orders, activeStudent]);
  const activeOrders = useMemo(() => studentOrders.filter((order) => ['pending', 'preparing', 'ready'].includes(order.status)), [studentOrders]);
  const availableProducts = useMemo(() => products.filter((product) => {
    const categoryMatch = categoryId ? product.category_id === categoryId : true;
    const queryMatch = `${product.name} ${product.description ?? ''}`.toLowerCase().includes(query.toLowerCase());
    return product.available && product.stock > 0 && categoryMatch && queryMatch;
  }), [products, categoryId, query]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0), [cart]);

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          toast.info('No queda más stock disponible de este producto.');
          return current;
        }
        return current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...current, { ...product, qty: 1 }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== productId) return [item];
      const next = item.qty + delta;
      return next <= 0 ? [] : [{ ...item, qty: Math.min(next, item.stock) }];
    }));
  };

  const placeOrder = async () => {
    if (!activeStudent || cart.length === 0 || placing) return;
    setPlacing(true);
    try {
      const pickup = Math.random().toString(36).slice(2, 7).toUpperCase();
      const orderNumber = await addOrder({
        user_id: activeStudent.id,
        total: cartTotal,
        status: 'pending',
        payment_method: 'credits',
        payment_status: 'confirmed',
        pickup_code: pickup,
        estimated_minutes: 8 + cart.length * 3,
        payment_reference: 'PAGO-CON-CREDITOS',
        order_items: cart.map((item) => ({ product_id: item.id, quantity: item.qty, price: item.price })),
      });
      setCart([]);
      toast.success(`Pedido ${orderNumber} creado para ${activeStudent.full_name}.`);
      await loadStudentData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el pedido.';
      toast.error(/insufficient_wallet_balance/i.test(message) ? 'El estudiante no tiene créditos suficientes.' : message);
    } finally {
      setPlacing(false);
    }
  };

  if (!activeStudent) return null;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.1),_transparent_30%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="sticky top-0 z-30 rounded-3xl border border-blue-200 bg-blue-50/95 p-4 shadow-lg backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><UserCircle className="h-7 w-7 shrink-0 text-blue-700"/><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-black text-blue-950">Estás usando la interfaz de {activeStudent.full_name}.</p></div></div>
          <button type="button" onClick={() => void returnToParent()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100"><ArrowLeft className="h-4 w-4"/>Volver a Padre</button>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-white/80 p-6 shadow-xl ring-1 ring-white/70 backdrop-blur-xl">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite Student</p><h1 className="mt-1 text-3xl font-black">Menú</h1><p className="mt-1 text-sm text-slate-600">Compra y consulta la experiencia del estudiante seleccionado.</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">Saldo: ${money(walletBalance)}</span><span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">Pedidos activos: {activeOrders.length}</span></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="rounded-[2rem] bg-white/80 p-6 shadow-xl ring-1 ring-white/70 backdrop-blur-xl">
          <div className="flex flex-wrap gap-3"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alimentos…" className="pl-9"/></div><button type="button" onClick={() => setCategoryId(null)} className={`rounded-full px-4 py-2 text-sm font-black ${!categoryId ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Todos</button>{categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`rounded-full px-4 py-2 text-sm font-black ${categoryId === category.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{category.name}</button>)}</div>
          {loading ? <p className="py-10 text-center text-sm font-bold text-slate-500">Cargando menú…</p> : availableProducts.length === 0 ? <div className="py-12 text-center text-sm font-bold text-slate-500">No hay productos disponibles con esos filtros.</div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{availableProducts.map((product) => <article key={product.id} className="flex flex-col rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><div className="min-h-24 flex-1"><p className="font-black">{product.name}</p>{product.description && <p className="mt-1 text-sm leading-5 text-slate-500">{product.description}</p>}</div><div className="mt-4 flex items-center justify-between gap-3"><div><p className="text-lg font-black">${money(Number(product.price))}</p><p className="text-xs text-slate-400">Stock: {product.stock}</p></div><Button type="button" onClick={() => addToCart(product)} className="bg-emerald-600 font-black text-white hover:bg-emerald-700"><Plus className="mr-1 h-4 w-4"/>Agregar</Button></div></article>)}</div>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] bg-white/90 p-6 shadow-xl ring-1 ring-white/70 backdrop-blur-xl"><div className="flex items-center gap-3"><ShoppingCart className="h-6 w-6 text-emerald-700"/><div><h2 className="font-black">Carrito</h2><p className="text-xs text-slate-500">Este pedido quedará asociado a {activeStudent.full_name}.</p></div></div>{cart.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">El carrito está vacío.</p> : <div className="mt-5 space-y-3">{cart.map((item) => <div key={item.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate font-black">{item.name}</p><p className="font-black">${money(Number(item.price) * item.qty)}</p></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-2"><button type="button" onClick={() => changeQty(item.id, -1)} className="rounded-full bg-white p-2 shadow-sm"><Minus className="h-3 w-3"/></button><span className="w-6 text-center text-sm font-black">{item.qty}</span><button type="button" onClick={() => changeQty(item.id, 1)} className="rounded-full bg-white p-2 shadow-sm"><Plus className="h-3 w-3"/></button></div></div></div>)}<div className="border-t border-slate-200 pt-4"><div className="flex items-center justify-between text-sm"><span className="font-bold text-slate-500">Total</span><span className="text-xl font-black">${money(cartTotal)}</span></div><Button type="button" onClick={() => void placeOrder()} disabled={placing || cartTotal > walletBalance} className="mt-4 w-full bg-emerald-600 font-black text-white hover:bg-emerald-700">{placing ? 'Creando pedido…' : cartTotal > walletBalance ? 'Saldo insuficiente' : 'Confirmar pedido'}</Button></div></div>}</section>
          <section className="rounded-[2rem] bg-white/90 p-6 shadow-xl ring-1 ring-white/70 backdrop-blur-xl"><div className="flex items-center gap-3"><History className="h-5 w-5 text-blue-700"/><h2 className="font-black">Últimos pedidos</h2></div><div className="mt-4 space-y-2">{studentOrders.slice(0, 5).map((order: Order) => <div key={order.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="font-black">#{order.order_number}</span><span className="text-xs font-bold text-slate-500">{order.status}</span></div><p className="mt-1 text-sm">${money(Number(order.total))}</p></div>)}{studentOrders.length === 0 && <p className="text-sm text-slate-500">Aún no hay pedidos.</p>}</div></section>
        </aside>
      </div>

      <footer className="flex flex-wrap gap-2 rounded-[2rem] bg-white/70 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-xl"><button type="button" onClick={() => navigate('/student/features')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><LayoutGrid className="h-4 w-4 text-emerald-700"/>Funciones</button><button type="button" onClick={() => navigate('/student/account')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><UserCircle className="h-4 w-4 text-blue-700"/>Mi cuenta</button><button type="button" onClick={() => navigate('/student/wallet')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><CreditCard className="h-4 w-4 text-violet-700"/>Saldos</button><button type="button" onClick={() => navigate('/student/order-windows')} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><Clock3 className="h-4 w-4 text-blue-700"/>Ventanas</button><button type="button" onClick={() => void returnToParent()} className="ml-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><LogOut className="h-4 w-4"/>Salir de modo padre</button></footer>
    </div>
  </div>;
}
