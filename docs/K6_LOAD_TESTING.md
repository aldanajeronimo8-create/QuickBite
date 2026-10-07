# QuickBite performance tests with Grafana k6

QuickBite now has two performance baselines:

- `tests/k6/quickbite-load.js`: public-shell baseline.
- `tests/k6/quickbite-400-users.js`: authenticated functional load test with **400 concurrent virtual users**, split into **100 student + 100 parent + 100 staff + 100 admin**.

## 400-user test

The 400-user scenario authenticates the existing isolated E2E identities, so it does not create hundreds of new production profiles or write test orders. Each k6 VU keeps its own session and exercises real Supabase/RLS-backed reads.

Student flow checks the app shell, profile, recess status, available products, notifications, and non-admin authorization.

Parent flow checks the app shell, profile, active student, family dashboard, spending summary, food controls, notifications, and non-admin authorization.

Staff flow checks the app shell, profile, active orders, notifications, and non-admin authorization.

Admin flow checks the app shell, profile, orders, user management, dashboard intelligence, notifications, and admin authorization.

Peak concurrency is 400 VUs. The test ramps 25 → 50 → 100 VUs per interface, holds 100 per interface, then ramps down.

## Run locally

Install Grafana k6 and export the same role credentials used by CI:

```bash
K6_BASE_URL=https://your-host.example \
VITE_SUPABASE_URL=https://your-project.supabase.co \
VITE_SUPABASE_ANON_KEY=... \
K6_STUDENT_EMAIL=... K6_STUDENT_PASSWORD=... \
K6_PARENT_EMAIL=... K6_PARENT_PASSWORD=... \
K6_STAFF_EMAIL=... K6_STAFF_PASSWORD=... \
K6_ADMIN_EMAIL=... K6_ADMIN_PASSWORD=... \
k6 run tests/k6/quickbite-400-users.js
```

The CI workflow validates all credentials before starting the test.

## Thresholds

- HTTP failure rate: below 2%
- p95 response time: below 2000 ms
- p99 response time: below 4000 ms
- overall checks: above 98.5%
- per-role flow errors: below 2%

A passing run means the tested authenticated flows sustained the configured 400-VU workload under these thresholds. It does not by itself prove an unlimited number of students or guarantee behaviour for every browser/device.
