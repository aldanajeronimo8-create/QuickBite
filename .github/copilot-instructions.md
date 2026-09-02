# QuickBite coding instructions

Follow the QuickBite agent workflow documented in `AGENTS.md` and use the Addy Osmani agent-skills methodology where supported.

For non-trivial work:
1. Specify requirements and acceptance criteria before coding.
2. Plan small, reversible implementation slices.
3. Implement incrementally.
4. Test and verify behavior; run the relevant CI checks.
5. Review correctness, security, accessibility, maintainability, and regressions.
6. Before shipping, verify the production build/deployment and rollback path.

QuickBite gates:
- Validate Supabase Auth sessions server-side/client-side as appropriate; never trust client role state alone.
- Preserve RLS and authorization boundaries.
- Treat balances, top-ups, orders, payments, stock, and Google Sheets exports as data-integrity-sensitive.
- Preserve responsive, accessible UI and loading/error/empty states.
- For behavior changes, use typecheck, lint, tests, build, and relevant E2E coverage.
- Do not claim a change is complete without evidence.

Do not commit secrets or weaken security/CI checks just to make a build pass.
