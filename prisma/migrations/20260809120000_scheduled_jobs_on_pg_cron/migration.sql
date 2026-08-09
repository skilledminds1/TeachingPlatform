-- Scheduled jobs move from GitHub Actions to pg_cron (PAY-02 follow-up to QLT-04).
--
-- WHY. The job routes are driven from outside by a bearer CRON_SECRET, and GitHub Actions was
-- the thing doing the driving. Actions delivers scheduled runs on a best-effort basis and on
-- 9 August 2026 the measured gaps between consecutive runs of a */5 schedule were 44, 16 and
-- then 51+ minutes. A five-minute email queue delivered every fifty-one minutes is not a five
-- minute email queue, and the staleness thresholds in src/server/jobs/registry.ts allow fifteen
-- minutes of jitter, so the monitoring sat permanently red and told the truth about it.
--
-- pg_cron fires from inside the database that is already the system of record. There is no
-- runner queue to wait behind.
--
-- WHAT IS HERE AND WHAT IS NOT. This migration creates the extensions and the one function that
-- performs a call. It deliberately does NOT create the schedules or store any secret: both are
-- per-environment, and a migration lives in the repository where a secret must never be. Those
-- belong to scripts/setup-pg-cron.ts, which reads the registry and the environment.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- NOT in `public`. PostgREST exposes public, so a SECURITY DEFINER function there is callable
-- over the REST API by anyone holding the anon key — which is published to every browser by
-- design. This schema is not exposed, and EXECUTE is revoked below besides.
CREATE SCHEMA IF NOT EXISTS scheduler;

/**
 * Call one job route with the bearer token the routes require.
 *
 * SECURITY DEFINER because it reads Vault, and `search_path = ''` so every name below has to
 * be schema-qualified and none of them can be shadowed by a caller's search_path.
 *
 * The job name is checked against a fixed list rather than interpolated as given. It is
 * concatenated into a URL, so an unchecked value is a path traversal that would make the
 * database send the CRON_SECRET to an arbitrary path — `../../` and the token goes somewhere
 * it was never meant to. The list mirrors CRON_JOBS in src/server/jobs/registry.ts; a job added
 * there and not here fails loudly at its first tick rather than silently never running.
 */
CREATE OR REPLACE FUNCTION scheduler.invoke_scheduled_job(job_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret_value text;
  base_url     text;
  request_id   bigint;
BEGIN
  IF job_name IS NULL OR job_name NOT IN (
    'session-reminders',
    'expire-booking-requests',
    'finalize-sessions',
    'refresh-fx-rates',
    'subscription-lifecycle',
    'process-email-outbox'
  ) THEN
    RAISE EXCEPTION 'invoke_scheduled_job: unknown job %', job_name;
  END IF;

  SELECT decrypted_secret INTO secret_value
    FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'app_base_url';

  -- Fail loudly. A missing secret would otherwise send an unauthenticated request, the route
  -- would 401, and withJobCheckIn deliberately does not record a 401 as a run — so the job
  -- would look like it had never run at all, which is exactly the ambiguity being avoided.
  IF secret_value IS NULL OR base_url IS NULL THEN
    RAISE EXCEPTION 'invoke_scheduled_job: cron_secret or app_base_url is missing from vault';
  END IF;

  SELECT net.http_get(
    url := base_url || '/api/v1/jobs/' || job_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret_value),
    timeout_milliseconds := 120000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION scheduler.invoke_scheduled_job(text) FROM PUBLIC;
REVOKE ALL ON SCHEMA scheduler FROM PUBLIC;
