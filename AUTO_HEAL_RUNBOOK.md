# QuickBite Auto-Heal

QuickBite now has an automated recovery pipeline with four safety layers:

1. **Immediate recovery** — production smoke checks run every 5 minutes. Temporary failures are retried before rollback. If production remains unhealthy and Vercel credentials are configured, the workflow requests a rollback to the previous production deployment. Vercel documents Instant Rollback as the rapid-recovery path; on the Hobby plan the previous production deployment is the rollback target. See: https://vercel.com/docs/deployments/rollback-production-deployment
2. **Diagnosis** — a failed `CI` run on `main` captures the failed workflow logs into an isolated repair workspace.
3. **AI repair** — Codex can diagnose the failure and make a minimal repair on a dedicated branch. Gemini can perform a second independent review when its secret is configured. Neither agent is allowed to deploy or modify production secrets.
4. **Verification** — the repair workspace must pass Typecheck, Lint, Tests and Build, plus E2E when its existing CI secrets are available. A pull request is then created against `main`; normal CI remains the merge gate.

## Required encrypted GitHub secrets

Add these under **Settings → Secrets and variables → Actions**:

- `VERCEL_TOKEN` — Vercel access token allowed to manage the QuickBite project.
- `QUICKBITE_HEALTH_URL` — the deployed `quickbite-health` Edge Function URL.
- `QUICKBITE_HEALTH_TOKEN` — the same value configured as `HEALTH_CHECK_TOKEN` in the Edge Function, when used.
- `QUICKBITE_ALERT_WEBHOOK_URL` — optional webhook for incident notifications.
- `OPENAI_API_KEY` — optional; enables the automatic Codex repair agent.
- `GEMINI_API_KEY` — optional; enables the independent Gemini second review. Google documents a free-quota path for Gemini API keys through Google AI Studio.

The existing E2E secrets remain unchanged:

- `VITE_SUPABASE_ANON_KEY`
- `PLAYWRIGHT_E2E_EMAIL`
- `PLAYWRIGHT_E2E_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`

## Vercel project identity

The workflow is pinned to the current QuickBite Vercel project:

- Team: `team_RO7iBCvGd2vw4GbiV9vthNdh`
- Project: `prj_Udwcqe1402DfGaXdIFOIO3pTFf5f`
- Production domain: `https://quick-bite-snowy-ten.vercel.app/`

The workflow creates `.vercel/project.json` only inside its ephemeral runner workspace and never commits it.

## Safety rules

- Automatic rollback only occurs after repeated failed smoke checks.
- Automatic code repair never writes directly to `main`.
- AI agents cannot deploy to Vercel from the repair workflow.
- Tests cannot be weakened to make a repair green.
- Production environment variables are not modified by Auto-Heal.
- A repair must pass the normal repository CI before it can be merged.

## Manual verification

Run **Actions → QuickBite Auto-Heal → Run workflow** to execute the production watchdog immediately.

To test the AI repair path safely, use a dedicated failing branch/commit and keep the workflow scoped to trusted `main` CI failures as configured.
