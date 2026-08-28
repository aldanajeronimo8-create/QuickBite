-- The pre-existing health table used `ok`/`down`; the deployed health API
-- exposes the clearer `healthy`/`unhealthy` vocabulary. Normalize safely and
-- retain `degraded` for partial failures.
ALTER TABLE public.system_health_checks
  DROP CONSTRAINT IF EXISTS system_health_checks_status_check;

UPDATE public.system_health_checks
SET status = CASE status
  WHEN 'ok' THEN 'healthy'
  WHEN 'down' THEN 'unhealthy'
  ELSE status
END;

ALTER TABLE public.system_health_checks
  ADD CONSTRAINT system_health_checks_status_check
  CHECK (status IN ('healthy', 'degraded', 'unhealthy'));
