-- Keep cancellation records after a product line is removed during approval.
ALTER TABLE public.order_cancellation_requests
  DROP CONSTRAINT IF EXISTS order_cancellation_requests_order_item_id_fkey;
ALTER TABLE public.order_cancellation_requests
  ADD CONSTRAINT order_cancellation_requests_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;
