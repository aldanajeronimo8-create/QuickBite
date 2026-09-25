BEGIN;

-- pgcrypto is installed in the extensions schema. create_order_tx is SECURITY DEFINER
-- and therefore uses an explicit search_path; include extensions so gen_random_bytes()
-- resolves correctly at runtime.
ALTER FUNCTION public.create_order_tx(uuid,text,text,text,text,integer,text,jsonb,text,uuid)
SET search_path = pg_catalog, public, auth, extensions;

COMMIT;
