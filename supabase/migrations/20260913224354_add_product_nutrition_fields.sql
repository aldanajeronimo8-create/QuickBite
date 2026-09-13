ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_healthy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegetarian boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calories numeric,
  ADD COLUMN IF NOT EXISTS protein_g numeric,
  ADD COLUMN IF NOT EXISTS fiber_g numeric,
  ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_calories_nonnegative,
  DROP CONSTRAINT IF EXISTS products_protein_nonnegative,
  DROP CONSTRAINT IF EXISTS products_fiber_nonnegative;

ALTER TABLE public.products
  ADD CONSTRAINT products_calories_nonnegative CHECK (calories IS NULL OR calories >= 0),
  ADD CONSTRAINT products_protein_nonnegative CHECK (protein_g IS NULL OR protein_g >= 0),
  ADD CONSTRAINT products_fiber_nonnegative CHECK (fiber_g IS NULL OR fiber_g >= 0);

CREATE INDEX IF NOT EXISTS products_healthy_idx ON public.products (is_healthy);
CREATE INDEX IF NOT EXISTS products_vegetarian_idx ON public.products (is_vegetarian);
