-- Keep a single unambiguous RPC signature for wallet topup requests.
-- The 5-argument function is the canonical implementation and stores comments.
DROP FUNCTION IF EXISTS public.request_wallet_topup(numeric, text, text, uuid);
