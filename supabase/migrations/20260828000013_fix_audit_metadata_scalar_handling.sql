-- Audit details routinely contain strings and numbers. Those scalar JSON
-- values have no keys to inspect and must be accepted after their parent keys
-- have been checked.
CREATE OR REPLACE FUNCTION public.audit_payload_has_sensitive_key(p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_key TEXT;
  v_value JSONB;
BEGIN
  IF p_payload IS NULL OR p_payload IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb) THEN
    RETURN false;
  END IF;

  CASE jsonb_typeof(p_payload)
    WHEN 'object' THEN
      FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_payload)
      LOOP
        IF lower(v_key) ~ '(password|passphrase|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|jwt|credential)' THEN
          RETURN true;
        END IF;
        IF public.audit_payload_has_sensitive_key(v_value) THEN
          RETURN true;
        END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v_value IN SELECT value FROM jsonb_array_elements(p_payload) AS values_table(value)
      LOOP
        IF public.audit_payload_has_sensitive_key(v_value) THEN
          RETURN true;
        END IF;
      END LOOP;
    ELSE
      RETURN false;
  END CASE;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_payload_has_sensitive_key(JSONB) FROM PUBLIC;
