# QuickBite performance tests with Grafana k6

The k6 scenario in `tests/k6/quickbite-load.js` measures the public production shell of QuickBite without attempting to automate Google/Firebase authentication or create real orders.

## Run locally

Install Grafana k6 using the official installation instructions, then run:

```bash
pnpm test:k6
```

Smoke test:

```bash
pnpm test:k6:smoke
```

Use another environment:

```bash
K6_BASE_URL=https://your-host.example pnpm test:k6
```

## Current thresholds

- HTTP failure rate: below 2%
- p95 response time: below 1500 ms
- p99 response time: below 3000 ms
- checks: above 98%

The default scenario ramps to 25 virtual users and then ramps down. These are baseline thresholds, not a claim that QuickBite supports a specific number of students in production.

## What this test does not cover

Authentication, Supabase RLS, order creation, payment flows, and administrator actions should be tested with dedicated scenarios using test accounts/data rather than by replaying real student credentials.

For a later school-break capacity test, add authenticated test users and representative read/write flows, then run the test against an isolated environment first.
