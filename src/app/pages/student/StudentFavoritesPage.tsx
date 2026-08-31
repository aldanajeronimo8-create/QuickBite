import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, ShoppingCart, Search, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient, type Product } from '../../../lib/supabase';

export function StudentFavoritesPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = requireSupabaseClient();
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = session.session?.user.id;
    if (!userId) throw new Error('Sesión no disponible.');
    const { data: favoriteRows, error: favoriteError } = await client
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId);
    if (favoriteError) throw favoriteError;
    const ids = (favoriteRows ?? []).map((row) => row.product_id);
    setFavoriteIds(ids);
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    const { data: productRows, error: productError } = await client
      .from('products')
      .select('id,name,description,price,image_url,category_id,stock,available,created_at')
      .in('id', ids)
      .order('name');
    if (productError) throw productError;
    setProducts((productRows ?? []) as Product[]);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudieron cargar tus favoritos.')).finally(() => setLoading(false));
  }, [load]);

  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.description ?? ''}`.toLowerCase().includes(query.toLowerCase())), [products, query]);

  const toggleFavorite = async (productId: string) => {
    const client = requireSupabaseClient();
    const { data: session } = await client.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId || saving) return;
    const exists = favoriteIds.includes(productId);
    setSaving(productId);
    try {
      const result = exists
        ? await client.from('favorites').delete().eq('user_id', userId).eq('product_id', productId)
        : await client.from('favorites').insert({ user_id: userId, product_id: productId });
      if (result.error) throw result.error;
      if (exists) {
        setFavoriteIds((current) => current.filter((id) => id !== productId));
        setProducts((current) => current.filter((product) => product.id !== productId));
      }
      toast.success(exists ? 'Quitado de favoritos.' : 'Agregado a favoritos.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el favorito.');
    } finally {
      setSaving(null);
    }
  };

  const addToCart = (product: Product) => {
    if (!product.available || product.stock <= 0) {
      toast.info('Este producto no está disponible en este momento.');
      return;
    }
    navigate(`/menu?addProduct=${encodeURIComponent(product.id)}`);
  };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between">
        <Link to="/student/features" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Funciones</Link>
        <button type="button" onClick={() => void load()} className="rounded-full bg-white/80 p-3 shadow-sm" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button>
      </header>
      <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl">
        <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Student</p>
        <h1 className="mt-1 text-3xl font-black">Mis favoritos</h1>
        <p className="mt-1 text-sm text-slate-600">Aquí aparecen únicamente los alimentos que tú guardaste como favoritos.</p>
        <div className="relative mt-5"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar entre tus favoritos..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-emerald-200"/></div>
      </section>
      {loading ? <div className="rounded-3xl bg-white p-8 text-center text-slate-500">Cargando tus favoritos…</div> : <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filteredProducts.map((product) => { const available = product.available && product.stock > 0; return <article key={product.id} className="overflow-hidden rounded-3xl border border-white/60 bg-white/75 shadow-lg backdrop-blur-xl"><div className="relative">{product.image_url ? <img src={product.image_url} alt={product.name} className="h-44 w-full object-cover"/> : <div className="grid h-44 place-items-center bg-slate-100 text-slate-400">Sin imagen</div>}<button type="button" onClick={() => void toggleFavorite(product.id)} disabled={saving === product.id} aria-label={`Quitar ${product.name} de favoritos`} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/90 text-rose-600 shadow-lg"><Heart className="h-5 w-5" fill="currentColor"/></button></div><div className="space-y-3 p-4"><div><h2 className="font-black">{product.name}</h2><p className="mt-1 text-sm text-slate-500">{product.description ?? 'Producto de QuickBite'}</p></div><div className="flex items-center justify-between"><p className="text-lg font-black text-emerald-700">${Number(product.price).toLocaleString('es-CO')}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{available ? `${product.stock} disponibles` : 'No disponible'}</span></div><button type="button" onClick={() => addToCart(product)} disabled={!available} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"><ShoppingCart className="h-4 w-4"/>Agregar al carrito</button></div></article>; })}</section>}
      {!loading && filteredProducts.length === 0 && <div className="rounded-3xl bg-white p-8 text-center text-slate-500">Aún no tienes alimentos favoritos. Ve al Menú y pulsa el corazón de cualquier alimento.</div>}
    </div>
  </div>;
}
