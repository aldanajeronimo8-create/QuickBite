-- Keep the Realtime publication aligned with every table subscribed to by dataStore.
-- RLS remains enabled on all these tables, so users only receive changes they may read.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'supabase_realtime publication does not exist';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
    'notifications',
    'loyalty_settings',
    'loyalty_rewards',
    'loyalty_redemptions'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Required realtime table public.% does not exist', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;
