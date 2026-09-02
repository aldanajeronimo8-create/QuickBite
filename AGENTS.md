# QuickBite — Agent Engineering Workflow

This repository uses Addy Osmani's agent-skills methodology as the engineering workflow for AI coding agents.

## Required lifecycle

For any non-trivial change, follow this order:

1. **Specify** — clarify the goal, acceptance criteria, boundaries, affected areas, and risks before coding.
2. **Plan** — break the work into small, reversible implementation slices.
3. **Build** — implement one thin vertical slice at a time.
4. **Test** — prove behavior with the smallest useful automated tests, then run the relevant CI checks.
5. **Review** — inspect correctness, maintainability, security, accessibility, and regressions before considering the change complete.
6. **Ship** — verify the production build/deployment and have a rollback path for risky changes.

## QuickBite-specific quality gates

- **Authentication/authorization:** never trust client-side role state alone. Validate the authenticated Supabase session and enforce authorization with Supabase/RLS where applicable.
- **Data integrity:** balance, top-up, order, payment, stock, and export operations must be consistent and auditable.
- **External integrations:** changes involving Supabase, Google Sheets, Vercel, or GitHub must include failure handling and verification.
- **UI:** preserve responsive behavior, accessibility, loading/error/empty states, and the existing QuickBite design system.
- **Testing:** run typecheck, lint, unit tests, build, and relevant E2E coverage for behavior changes. Do not claim a change is verified until the available evidence supports it.
- **Production:** after deployment, confirm the deployed application responds successfully and check relevant runtime/watchdog signals.

## Evidence standard

"Done" means there is evidence: passing tests/build, successful deployment where applicable, and a concrete verification of the changed behavior. Do not replace verification with assumptions.

## Recommended skills

Use the corresponding Addy Osmani agent-skills workflows when available:

- `spec-driven-development` for new features or significant changes
- `incremental-implementation` for multi-file implementation
- `test-driven-development` for logic/behavior changes and bug fixes
- `frontend-ui-engineering` for user-facing UI work
- `code-review-and-quality` before merge
- `security-and-hardening` for auth, input, storage, secrets, and integrations
- `performance-optimization` for performance-sensitive changes
- `shipping-and-launch` before production releases

The upstream skill pack is MIT licensed and maintained at https://github.com/addyosmani/agent-skills.

## Important

These instructions guide the coding agent; they are development tooling and do **not** add runtime code or expose agent tooling to QuickBite users.
