-- QuickBite Phase 1: product reviews and ratings.
-- Students can review products they have received; admins moderate publication.

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, product_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_status_created
  ON public.product_reviews(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_student_created
  ON public.product_reviews(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status_created
  ON public.product_reviews(status, created_at DESC);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_reviews_public_read_approved ON public.product_reviews;
CREATE POLICY product_reviews_public_read_approved
  ON public.product_reviews FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR public.is_admin() OR student_id = auth.uid());

DROP POLICY IF EXISTS product_reviews_student_insert_own ON public.product_reviews;
CREATE POLICY product_reviews_student_insert_own
  ON public.product_reviews FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.id = product_reviews.order_id
        AND o.user_id = auth.uid()
        AND o.status = 'delivered'
        AND oi.product_id = product_reviews.product_id
    )
  );

DROP POLICY IF EXISTS product_reviews_student_update_pending ON public.product_reviews;
CREATE POLICY product_reviews_student_update_pending
  ON public.product_reviews FOR UPDATE TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS product_reviews_admin_manage ON public.product_reviews;
CREATE POLICY product_reviews_admin_manage
  ON public.product_reviews FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS product_reviews_touch_updated_at ON public.product_reviews;
CREATE TRIGGER product_reviews_touch_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.product_review_summary AS
SELECT
  p.id AS product_id,
  COALESCE(ROUND(AVG(r.stars)::numeric, 1), 0) AS average_stars,
  COUNT(r.id)::INTEGER AS review_count
FROM public.products p
LEFT JOIN public.product_reviews r
  ON r.product_id = p.id
 AND r.status = 'approved'
GROUP BY p.id;

GRANT SELECT ON public.product_review_summary TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_product_review(
  p_product_id UUID,
  p_order_id UUID,
  p_stars INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.product_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.product_reviews;
  normalized_comment TEXT := NULLIF(BTRIM(p_comment), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'invalid_stars';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id = p_order_id
      AND o.user_id = auth.uid()
      AND o.status = 'delivered'
      AND oi.product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'review_purchase_required';
  END IF;

  INSERT INTO public.product_reviews(student_id, product_id, order_id, stars, comment, status)
  VALUES(auth.uid(), p_product_id, p_order_id, p_stars, normalized_comment, 'pending')
  RETURNING * INTO result;

  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'review_already_exists';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_product_review(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_product_review(UUID, UUID, INTEGER, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'product_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reviews;
  END IF;
END $$;
