import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Heart, History, Package, RefreshCcw, Star, UtensilsCrossed } from 'lucide-react';
import { requireSupabaseClient, type Product } from '../../../lib/supabase';

export function StudentFeatureCenter() {
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

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.12),_transparent_34%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite</p><h1 className="text-3xl font-black">Centro de funciones</h1><p className="mt-1 text-sm text-slate-600">Accede a compra, historial, puntos, notificaciones y favoritos.</p></div><Link to="/menu" className="rounded-full bg-[#16A36A] px-4 py-2 text-sm font-black text-white">Volver al menú</Link></div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Menú','Comprar y consultar disponibilidad','/menu',UtensilsCrossed],['Historial','Ver pedidos y recibos','/menu',History],['Puntos','Consultar y canjear recompensas','/menu',Star],['Notificaciones','Cambios y avisos del pedido','/menu',Bell]].map(([title, desc, path, Icon]) => <Link key={title as string} to={path as string} className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:shadow-lg"><Icon className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">{title as string}</h2><p className="mt-1 text-sm text-slate-600">{desc as string}</p></Link>)}
      </div>
      <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><div className="flex items-center gap-3"><Heart className="h-6 w-6 text-rose-500"/><div><h2 className="font-black">Favoritos</h2><p className="text-sm text-slate-600">Se guardan en tu cuenta de QuickBite.</p></div></div>{loading ? <p className="mt-5 text-sm text-slate-500">Cargando favoritos…</p> : favorites.length === 0 ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aún no tienes favoritos. Elige productos del menú para guardarlos.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2">{favorites.map((product) => <div key={product.id} className="flex gap-3 rounded-2xl border border-white/60 bg-white/60 p-3"><img src={product.image_url} alt={product.name} className="h-20 w-20 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="font-black">{product.name}</p><p className="text-sm text-emerald-700">${product.price.toLocaleString('es-CO')}</p><button onClick={() => void toggleFavorite(product.id)} disabled={saving === product.id} className="mt-2 text-xs font-bold text-rose-600">Quitar de favoritos</button></div></div>)}</div>}</section>
      <div className="flex flex-wrap gap-3"><Link to="/menu" className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-bold"><Package className="h-4 w-4"/>Comprar</Link><Link to="/menu" className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-bold"><RefreshCcw className="h-4 w-4"/>Recompra</Link></div>
    </div>
  </div>;
}
