-- The interface and the business rules define "both" as a combined student
-- and administrator role. Keep every administrative RPC and RLS policy in
-- sync by recognizing it through the shared authorization function.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'both')
  );
$$;
