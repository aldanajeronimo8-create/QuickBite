import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { requireSupabaseClient } from '../../../lib/supabase';

type RatingSummary = { average_stars: number; review_count: number };

const cache = new Map<string, RatingSummary | null>();
const pending = new Map<string, Promise<RatingSummary | null>>();

async function loadRating(productId: string) {
  if (cache.has(productId)) return cache.get(productId) ?? null;
  if (pending.has(productId)) return pending.get(productId)!;
  const request = requireSupabaseClient()
    .from('product_review_summary')
    .select('average_stars,review_count')
    .eq('product_id', productId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      const rating = data ? { average_stars: Number(data.average_stars ?? 0), review_count: Number(data.review_count ?? 0) } : null;
      cache.set(productId, rating);
      return rating;
    })
    .catch(() => {
      cache.set(productId, null);
      return null;
    })
    .finally(() => pending.delete(productId));
  pending.set(productId, request);
  return request;
}

export function ProductRatingBadge({ productId }: { productId: string }) {
  const [rating, setRating] = useState<RatingSummary | null>(() => cache.get(productId) ?? null);

  useEffect(() => {
    let mounted = true;
    void loadRating(productId).then((next) => { if (mounted) setRating(next); });
    return () => { mounted = false; };
  }, [productId]);

  if (!rating || rating.review_count === 0) return null;

  return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-300" aria-label={`${rating.average_stars.toFixed(1)} de 5, ${rating.review_count} opiniones`}>
    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
    {rating.average_stars.toFixed(1)} <span className="text-slate-400 dark:text-slate-500">({rating.review_count})</span>
  </span>;
}
