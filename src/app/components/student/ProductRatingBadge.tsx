import { useEffect, useState } from 'react';
import { Heart, Star } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type RatingSummary = { average_stars: number; review_count: number };

const cache = new Map<string, RatingSummary | null>();
const pending = new Map<string, Promise<RatingSummary | null>>();

async function loadRating(productId: string) {
  if (cache.has(productId)) return cache.get(productId) ?? null;
  if (pending.has(productId)) return pending.get(productId)!;

  const request = (async () => {
    try {
      const { data, error } = await requireSupabaseClient()
        .from('product_review_summary')
        .select('average_stars,review_count')
        .eq('product_id', productId)
        .maybeSingle();
      if (error) throw error;
      const rating = data ? { average_stars: Number(data.average_stars ?? 0), review_count: Number(data.review_count ?? 0) } : null;
      cache.set(productId, rating);
      return rating;
    } catch {
      cache.set(productId, null);
      return null;
    } finally {
      pending.delete(productId);
    }
  })();

  pending.set(productId, request);
  return request;
}

async function getEffectiveUserId() {
  const client = requireSupabaseClient();
  const { data: session, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const authUserId = session.session?.user.id;
  if (!authUserId) throw new Error('Sesión no disponible.');

  try {
    const { data, error } = await client.rpc('effective_student_user_id');
    if (!error && typeof data === 'string' && data) return data;
  } catch {
    // Fall back to the authenticated user for regular student accounts.
  }

  return authUserId;
}

export function ProductRatingBadge({ productId }: { productId: string }) {
  const [rating, setRating] = useState<RatingSummary | null>(() => cache.get(productId) ?? null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadRating(productId).then((next) => { if (mounted) setRating(next); });
    return () => { mounted = false; };
  }, [productId]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const client = requireSupabaseClient();
        const userId = await getEffectiveUserId();
        const { data, error } = await client
          .from('favorites')
          .select('product_id')
          .eq('user_id', userId)
          .eq('product_id', productId)
          .limit(1);
        if (error) throw error;
        if (mounted) setIsFavorite((data ?? []).length > 0);
      } catch {
        if (mounted) setIsFavorite(false);
      }
    })();
    return () => { mounted = false; };
  }, [productId]);

  const toggleFavorite = async () => {
    if (savingFavorite) return;
    setSavingFavorite(true);
    try {
      const client = requireSupabaseClient();
      const userId = await getEffectiveUserId();
      if (isFavorite) {
        const { error } = await client.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
        if (error) throw error;
        setIsFavorite(false);
        toast.success('Quitado de favoritos.');
      } else {
        const { error } = await client.from('favorites').insert({ user_id: userId, product_id: productId });
        if (error) throw error;
        setIsFavorite(true);
        toast.success('Agregado a favoritos.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el favorito.');
    } finally {
      setSavingFavorite(false);
    }
  };

  return <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => void toggleFavorite()}
      disabled={savingFavorite}
      aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      aria-pressed={isFavorite}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${isFavorite ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300' : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-500 dark:border-slate-700 dark:bg-[#0D111D] dark:text-slate-500 dark:hover:border-rose-500/30 dark:hover:text-rose-300'}`}
      title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <Heart className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
    {rating && rating.review_count > 0 && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-300" aria-label={`${rating.average_stars.toFixed(1)} de 5, ${rating.review_count} opiniones`}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {rating.average_stars.toFixed(1)} <span className="text-slate-400 dark:text-slate-500">({rating.review_count})</span>
    </span>}
  </div>;
}
