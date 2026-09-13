import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type Review = {
  id: string;
  student_id: string;
  product_id: string;
  order_id: string;
  stars: number;
  comment: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  student?: { full_name: string; email: string } | null;
  product?: { name: string; image_url: string | null } | null;
};

type ReviewQueryRow = Omit<Review, 'student' | 'product'> & {
  profiles?: Array<{ full_name: string; email: string }>;
  products?: Array<{ name: string; image_url: string | null }>;
};

const statusLabel: Record<Review['status'], string> = { pending: 'Pendiente', approved: 'Publicada', rejected: 'Rechazada' };

function Stars({ value }: { value: number }) {
  return <div className="flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />)}
  </div>;
}

export function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Review['status'] | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await requireSupabaseClient()
        .from('product_reviews')
        .select('id,student_id,product_id,order_id,stars,comment,status,created_at,profiles!product_reviews_student_id_fkey(full_name,email),products(name,image_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ReviewQueryRow[];
      setReviews(rows.map((item) => ({
        id: item.id,
        student_id: item.student_id,
        product_id: item.product_id,
        order_id: item.order_id,
        stars: item.stars,
        comment: item.comment,
        status: item.status,
        created_at: item.created_at,
        student: item.profiles?.[0] ?? null,
        product: item.products?.[0] ?? null,
      })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las reseñas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => filter === 'all' ? reviews : reviews.filter((review) => review.status === filter), [filter, reviews]);
  const pendingCount = reviews.filter((review) => review.status === 'pending').length;

  const moderate = async (review: Review, status: 'approved' | 'rejected') => {
    setSavingId(review.id);
    try {
      const { error } = await requireSupabaseClient().from('product_reviews').update({ status }).eq('id', review.id);
      if (error) throw error;
      toast.success(status === 'approved' ? 'Reseña publicada.' : 'Reseña rechazada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la reseña.');
    } finally {
      setSavingId(null);
    }
  };

  return <div className="space-y-6">
    <header className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-600 dark:text-amber-300">Fase 1 · Experiencia</p><h1 className="qb-text mt-2 text-3xl font-black">Reseñas de productos</h1><p className="qb-text-secondary mt-2 text-sm">Modera las opiniones antes de mostrarlas públicamente en QuickBite.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border qb-border qb-surface px-4 py-3 text-sm font-black">{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}Actualizar</button>
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-4">
      {([['pending', 'Pendientes', pendingCount], ['approved', 'Publicadas', reviews.filter((r) => r.status === 'approved').length], ['rejected', 'Rechazadas', reviews.filter((r) => r.status === 'rejected').length], ['all', 'Todas', reviews.length]] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-2xl border p-4 text-left transition ${filter === value ? 'border-amber-400 bg-amber-50 dark:border-amber-300/50 dark:bg-amber-400/10' : 'qb-border qb-surface'}`}><p className="qb-text text-xs font-black uppercase tracking-wider">{label}</p><p className="qb-text mt-1 text-2xl font-black">{count}</p></button>)}
    </div>

    <section className="space-y-3">
      {loading && <div className="qb-surface flex items-center justify-center rounded-3xl border qb-border p-12"><Loader2 className="h-6 w-6 animate-spin"/></div>}
      {!loading && filtered.length === 0 && <div className="qb-surface rounded-3xl border qb-border p-10 text-center"><p className="qb-text font-black">No hay reseñas en este estado.</p><p className="qb-text-secondary mt-1 text-sm">Cuando un estudiante envíe una reseña aparecerá aquí.</p></div>}
      {filtered.map((review) => <article key={review.id} className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex items-start gap-3">{review.product?.image_url ? <img src={review.product.image_url} alt="" className="h-14 w-14 rounded-2xl object-cover"/> : <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800">🍽️</div>}<div><h2 className="qb-text font-black">{review.product?.name ?? 'Producto'}</h2><p className="qb-text-secondary text-xs">{review.student?.full_name ?? 'Estudiante'} · {review.student?.email ?? 'sin correo'}</p><div className="mt-2 flex items-center gap-2"><Stars value={review.stars}/><span className="qb-text-secondary text-xs">{new Date(review.created_at).toLocaleDateString('es-CO')}</span></div></div></div>{review.comment && <p className="qb-text-secondary mt-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-950/40">“{review.comment}”</p>}</div><div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col"><span className={`rounded-full px-3 py-1.5 text-center text-xs font-black ${review.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : review.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-400/10 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'}`}>{statusLabel[review.status]}</span>{review.status === 'pending' && <><button type="button" disabled={savingId === review.id} onClick={() => void moderate(review, 'approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Check className="h-4 w-4"/>Publicar</button><button type="button" disabled={savingId === review.id} onClick={() => void moderate(review, 'rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 disabled:opacity-50 dark:border-rose-300/20 dark:bg-rose-400/10 dark:text-rose-300"><X className="h-4 w-4"/>Rechazar</button></>}</div></div></article>)}
    </section>
  </div>;
}
