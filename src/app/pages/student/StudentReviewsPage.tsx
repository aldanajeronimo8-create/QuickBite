import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Send, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient, type Product } from '../../../lib/supabase';
import { useStudentContextStore } from '../../../store/studentContextStore';

type ReviewRow = { id: string; product_id: string; order_id: string; stars: number; comment: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string; product?: Pick<Product, 'name' | 'image_url'> | null };
type PurchaseRow = { order_id: string; product_id: string; product: Pick<Product, 'id' | 'name' | 'image_url'>; order_created_at: string };
type PurchaseQueryOrder = { id: string; created_at: string; order_items?: Array<{ product_id: string; products?: Array<Pick<Product, 'id' | 'name' | 'image_url'>> }> };
type RatingSummary = { product_id: string; average_stars: number; review_count: number };

type ReviewQueryRow = Omit<ReviewRow, 'product'> & { products?: Array<Pick<Product, 'name' | 'image_url'>> };

const Stars = ({ value, onChange, interactive = false }: { value: number; onChange?: (value: number) => void; interactive?: boolean }) => (
  <div className="flex items-center gap-1" aria-label={`${value} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((star) => {
      const active = star <= value;
      return interactive ? (
        <button key={star} type="button" onClick={() => onChange?.(star)} className="rounded-md p-1 transition hover:scale-105" aria-label={`${star} estrellas`}>
          <Star className={`h-6 w-6 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
        </button>
      ) : <Star key={star} className={`h-4 w-4 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />;
    })}
  </div>
);

export function StudentReviewsPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [summaries, setSummaries] = useState<RatingSummary[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const studentId = activeStudent?.id;

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const [{ data: orderData, error: ordersError }, { data: reviewsData, error: reviewsError }, { data: summaryData, error: summaryError }] = await Promise.all([
        client.from('orders').select('id,created_at,status,order_items(product_id,products(id,name,image_url))').eq('user_id', studentId).eq('status', 'delivered').order('created_at', { ascending: false }),
        client.from('product_reviews').select('id,product_id,order_id,stars,comment,status,created_at,products(name,image_url)').eq('student_id', studentId).order('created_at', { ascending: false }),
        client.from('product_review_summary').select('product_id,average_stars,review_count'),
      ]);
      if (ordersError) throw ordersError;
      if (reviewsError) throw reviewsError;
      if (summaryError) throw summaryError;

      const rows: PurchaseRow[] = [];
      for (const order of (orderData ?? []) as unknown as PurchaseQueryOrder[]) {
        for (const item of order.order_items ?? []) {
          const product = item.products?.[0];
          if (!product) continue;
          rows.push({ order_id: order.id, product_id: item.product_id, product, order_created_at: order.created_at });
        }
      }
      const reviewRows = (reviewsData ?? []) as unknown as ReviewQueryRow[];
      setPurchases(rows);
      setReviews(reviewRows.map((review) => ({ ...review, product: review.products?.[0] ?? null })));
      setSummaries((summaryData ?? []) as RatingSummary[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las reseñas.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { void load(); }, [load]);

  const reviewedKeys = useMemo(() => new Set(reviews.map((review) => `${review.order_id}:${review.product_id}`)), [reviews]);
  const reviewablePurchases = useMemo(() => purchases.filter((purchase) => !reviewedKeys.has(`${purchase.order_id}:${purchase.product_id}`)), [purchases, reviewedKeys]);
  const summaryByProduct = useMemo(() => new Map(summaries.map((summary) => [summary.product_id, summary])), [summaries]);

  const submit = async () => {
    if (!studentId || !selectedPurchase) return;
    setSubmitting(true);
    try {
      const { error } = await requireSupabaseClient().rpc('submit_product_review', {
        p_product_id: selectedPurchase.product_id,
        p_order_id: selectedPurchase.order_id,
        p_stars: stars,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      toast.success('Reseña enviada. Quedará pendiente de aprobación.');
      setSelectedPurchase(null);
      setComment('');
      setStars(5);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la reseña.';
      toast.error(message.includes('review_already_exists') ? 'Ya reseñaste este producto en ese pedido.' : message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!studentId) return <div className="qb-page min-h-screen p-6"><div className="mx-auto max-w-4xl qb-surface rounded-3xl border qb-border p-6"><p className="qb-text font-black">No hay un estudiante activo.</p><button className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white" onClick={() => navigate('/menu')}>Volver al menú</button></div></div>;

  return <div className="qb-page min-h-screen p-5 pb-24 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <button type="button" onClick={() => navigate('/menu')} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><ArrowLeft className="h-4 w-4"/>Volver al menú</button>
      <header className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg">
        <p className="text-xs font-black uppercase tracking-[.18em] text-amber-600 dark:text-amber-300">Experiencia QuickBite</p>
        <h1 className="qb-text mt-2 text-3xl font-black">Reseñas y calificaciones</h1>
        <p className="qb-text-secondary mt-2 max-w-2xl text-sm">Califica productos que ya recibiste y ayuda a mejorar el menú de la cafetería.</p>
      </header>

      {loading ? <div className="qb-surface flex items-center justify-center rounded-3xl border qb-border p-12"><Loader2 className="h-6 w-6 animate-spin"/></div> : <>
        <section className="grid gap-4 md:grid-cols-2">
          {reviewablePurchases.map((purchase) => {
            const summary = summaryByProduct.get(purchase.product_id);
            return <button key={`${purchase.order_id}:${purchase.product_id}`} type="button" onClick={() => setSelectedPurchase(purchase)} className="qb-surface flex items-center gap-4 rounded-3xl border qb-border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
              {purchase.product.image_url ? <img src={purchase.product.image_url} alt="" className="h-16 w-16 rounded-2xl object-cover"/> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-xl dark:bg-slate-800">🍽️</div>}
              <div className="min-w-0 flex-1"><p className="qb-text truncate font-black">{purchase.product.name}</p><div className="mt-1 flex items-center gap-2"><Stars value={Math.round(summary?.average_stars ?? 0)}/><span className="qb-text-secondary text-xs">{summary?.average_stars ? summary.average_stars.toFixed(1) : 'Sin calificaciones'} · {summary?.review_count ?? 0}</span></div><p className="qb-text-secondary mt-1 text-xs">Pedido del {new Date(purchase.order_created_at).toLocaleDateString('es-CO')}</p></div><span className="shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">Calificar</span>
            </button>;
          })}
        </section>

        {reviewablePurchases.length === 0 && <div className="qb-surface rounded-3xl border qb-border p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500"/><h2 className="qb-text mt-3 font-black">No tienes reseñas pendientes</h2><p className="qb-text-secondary mt-1 text-sm">Cuando completes un pedido entregado podrás dejar una valoración aquí.</p></div>}

        <section className="qb-surface rounded-3xl border qb-border p-5">
          <h2 className="qb-text text-xl font-black">Mis reseñas</h2>
          <div className="mt-4 space-y-3">
            {reviews.map((review) => <article key={review.id} className="rounded-2xl border qb-border bg-white/60 p-4 dark:bg-slate-900/30"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="qb-text font-black">{review.product?.name ?? 'Producto'}</p><p className="qb-text-secondary text-xs">{new Date(review.created_at).toLocaleDateString('es-CO')}</p></div><div className="flex items-center gap-3"><Stars value={review.stars}/><span className={`rounded-full px-3 py-1 text-xs font-black ${review.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : review.status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'}`}>{review.status === 'approved' ? 'Publicada' : review.status === 'rejected' ? 'Rechazada' : 'Pendiente'}</span></div></div>{review.comment && <p className="qb-text-secondary mt-3 text-sm">“{review.comment}”</p>}</article>)}
            {reviews.length === 0 && <p className="qb-text-secondary py-4 text-sm">Todavía no has enviado reseñas.</p>}
          </div>
        </section>
      </>}

      {selectedPurchase && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"><div className="qb-surface w-full max-w-lg rounded-[2rem] border qb-border p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-600">Tu opinión</p><h2 className="qb-text mt-1 text-2xl font-black">{selectedPurchase.product.name}</h2></div><button type="button" onClick={() => setSelectedPurchase(null)} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500">Cerrar</button></div><div className="mt-6"><p className="qb-text text-sm font-bold">¿Cómo calificarías tu experiencia?</p><div className="mt-2"><Stars value={stars} onChange={setStars} interactive/></div></div><label className="mt-5 block"><span className="qb-text text-sm font-bold">Comentario (opcional)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={5} className="mt-2 w-full rounded-2xl border qb-border bg-white p-3 text-sm dark:bg-slate-950" placeholder="Cuéntanos qué te gustó o qué podemos mejorar..."/><span className="qb-text-secondary mt-1 block text-right text-xs">{comment.length}/500</span></label><button type="button" disabled={submitting} onClick={() => void submit()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-black text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}{submitting ? 'Enviando…' : 'Enviar reseña'}</button></div></div>}
    </div>
  </div>;
}
