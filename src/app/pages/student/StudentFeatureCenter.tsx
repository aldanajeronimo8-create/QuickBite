import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Heart, History, Package, RefreshCcw, Star, UtensilsCrossed } from 'lucide-react';
import { requireSupabaseClient, type Product } from '../../../lib/supabase';

export function StudentFeatureCenter() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const loadFavorites = useCallback(async () => {
    const supabase = requireSupabaseClient();
    const { data: session } = await supabase.auth.getSession();
    const id = session.session?.user.id;
    if (!id) return;
    setUserId(id);
    const [{ data: favoriteRows, error: favoritesError }, { data: productRows, error: productsError }] = await Promise.all([
      supabase.from('favorites').select('product_id').eq('user_id', id),
      supabase.from('products').select('id,name,description,price,image_url,category_id,stock,available,created_at').eq('available', true).order('name'),
    ]);
    if (favoritesError) throw favoritesError;
    if (productsError) throw productsError;
    setFavoriteIds((favoriteRows ?? []).map((row) => row.product_id));
    setProducts((productRows ?? []) as Product[]);
  }, []);
  useEffect(() => { void loadFavorites().finally(() => setLoading(false)); }, [loadFavorites]);
  const favorites = useMemo(() => products.filter((product) => favoriteIds.includes(product.id)), [products, favoriteIds]);
  const toggleFavorite = async (productId: string) => {
    if (!userId || saving) return;
    setSaving(productId);
    try {
      const supabase = requireSupabaseClient();
      const exists = favoriteIds.includes(productId);
      if (exists) {
        const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
        if (error) throw error;
        setFavoriteIds((ids) => ids.filter((id) => id !== productId));
      } else {
        const { error } = await supabase.from('favorites').insert({ user_id: userId, product_id: productId });
        if (error) throw error;
        setFavoriteIds((ids) => [...ids, productId]);
      }
    } finally { setSaving(null); }
  };
  const goToMenuTab = (tab: 'menu' | 'orders' | 'rewards') => navigate(`/menu?tab=${tab}`);
  const goToNotifications = () => navigate('/menu?open=notifications');
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.12),_transparent_34%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite</p><h1 className="text-3xl font-black">Centro de funciones</h1><p className="mt-1 text-sm text-slate-600">Accede directamente a cada función de tu experiencia.</p></div><Link to="/menu?tab=menu" className="rounded-full bg-[#16A36A] px-4 py-2 text-sm font-black text-white">Volver al menú</Link></div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => goToMenuTab('menu')} className="rounded-3xl border border-white/60 bg-white/65 p-5 text-left shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-lg"><UtensilsCrossed className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Menú</h2><p className="mt-1 text-sm text-slate-600">Comprar y consultar disponibilidad.</p></button>
        <button type="button" onClick={() => goToMenuTab('orders')} className="rounded-3xl border border-white/60 bg-white/65 p-5 text-left shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-lg"><History className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Historial</h2><p className="mt-1 text-sm text-slate-600">Ver pedidos, estados y recibos.</p></button>
        <button type="button" onClick={() => goToMenuTab('rewards')} className="rounded-3xl border border-white/60 bg-white/65 p-5 text-left shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-lg"><Star className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Puntos</h2><p className="mt-1 text-sm text-slate-600">Consultar y canjear recompensas.</p></button>
        <button type="button" onClick={goToNotifications} className="rounded-3xl border border-white/60 bg-white/65 p-5 text-left shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-lg"><Bell className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Notificaciones</h2><p className="mt-1 text-sm text-slate-600">Abrir avisos y cambios del pedido.</p></button>
      </div>
      <section id="favorites" className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Heart className="h-6 w-6 text-rose-500"/><div><h2 className="font-black">Favoritos</h2><p className="text-sm text-slate-600">Se guardan en tu cuenta de QuickBite.</p></div></div><button type="button" onClick={() => navigate('/menu?favorites=true')} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Ver en menú</button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Cargando favoritos…</p> : favorites.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no tienes favoritos. Elige productos del menú para guardarlos.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2">{favorites.map((product) => <div key={product.id} className="flex gap-3 rounded-2xl border border-white/60 bg-white/60 p-3"><img src={product.image_url} alt={product.name} className="h-20 w-20 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="font-black">{product.name}</p><p className="text-sm text-emerald-700">${product.price.toLocaleString('es-CO')}</p><button type="button" onClick={() => void toggleFavorite(product.id)} disabled={saving === product.id} className="mt-2 text-xs font-bold text-rose-600">Quitar de favoritos</button></div></div>)}</div>}</section>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => goToMenuTab('menu')} className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-bold"><Package className="h-4 w-4"/>Comprar</button><button type="button" onClick={() => navigate('/menu?tab=orders&reorder=true')} className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-bold"><RefreshCcw className="h-4 w-4"/>Recompra</button></div>
    </div>
  </div>;
}
