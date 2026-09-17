BEGIN;

DROP POLICY IF EXISTS "Usuarios pueden crear sus propios pedidos" ON public.orders;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS orders_parent_insert_effective ON public.orders;
DROP POLICY IF EXISTS "Usuarios pueden crear sus propios items de pedido" ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_own ON public.order_items;
DROP POLICY IF EXISTS order_items_parent_insert_effective ON public.order_items;
REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;

COMMIT;
