-- Security fix: make the product review summary view execute with the
-- permissions/RLS context of the querying user instead of the view owner.
ALTER VIEW public.product_review_summary SET (security_invoker = true);
