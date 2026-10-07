# QuickBite performance tests with Grafana k6

QuickBite has two k6 baselines:

- `tests/k6/quickbite-load.js`: public-shell HTTP baseline.
- `tests/k6/quickbite-400-users.js`: authenticated Chromium browser audit with **400 concurrent VUs**, split into **100 Student + 100 Parent + 100 Staff + 100 Admin**.

## 400-user browser test

The browser test uses four pre-existing, isolated role identities supplied through GitHub Actions secrets. It does **not** provision hundreds of production accounts.

Each role scenario runs 100 VUs in Chromium. Every VU audits the current routed interface for that role and, for each routed page, checks:

1. The page renders a non-empty application shell.
2. Every discoverable button/action control is inspected for actionability.
3. Controls classified as read-only/navigation are actually clicked.
4. Mutating controls are actionability-tested without changing production data.
5. Every internal link is opened and checked for an HTTP status below 500.
6. Every visible form control is actionability-tested and safely populated where supported.
7. Browser console errors are captured.
8. Document/fetch/XHR responses with HTTP 4xx/5xx are captured.
9. Network-level request failures are captured.

The four interfaces currently covered are Student, Parent, Staff and Admin. The route inventory is kept in `tests/k6/quickbite-400-users.js`.

### Important functional boundary

This is an **authenticated full-UI/load audit**, not a blind destructive test. A passing run proves that the tested role sessions can load the routed interfaces and that the discovered controls are actionable under 400 concurrent browser VUs.

It does **not** claim that destructive business operations such as placing orders, deleting users, approving/rejecting payments, changing inventory, resetting data, or closing a sales period were executed against production. Those operations require an isolated test database/tenant with disposable fixtures before they should be clicked for real.

## Role credentials

The workflow expects these existing GitHub Actions secrets:

```
PLAYWRIGHT_E2E_EMAIL
PLAYWRIGHT_E2E_PASSWORD

PLAYWRIGHT_PARENT_EMAIL
PLAYWRIGHT_PARENT_PASSWORD

PLAYWRIGHT_STAFF_EMAIL
PLAYWRIGHT_STAFF_PASSWORD

PLAYWRIGHT_ADMIN_EMAIL
PLAYWRIGHT_ADMIN_PASSWORD
```

No passwords are stored in the repository.

## Run locally

Install the current Grafana k6 release, then export the same variables used by CI:

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

Or from the repository package scripts:

```bash
pnpm test:k6:400
```

## Thresholds

The browser suite currently enforces:

- overall checks above 99.5%;
- UI function failure rate below 1%;
- browser document/fetch/XHR HTTP failure rate below 1%.

The test is configured for 100 VUs in each role scenario, for a peak of 400 concurrent browser VUs.

A passing run is evidence for this exact workload and test data. It is not a guarantee for unlimited traffic, every device/browser combination, or every destructive production workflow.
