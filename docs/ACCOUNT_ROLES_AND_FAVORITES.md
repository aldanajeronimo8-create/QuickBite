# QuickBite — Roles, Family Linking and Favorites

## Registration roles

When a user chooses **Crear cuenta** from the Student entry point, registration must first ask for the account type:

- **Estudiante** — creates a student account and opens the student experience.
- **Padre de Familia** — creates a parent/family account and opens the family experience.

The role must be stored server-side and authorization must rely on the authenticated user's role, not only on client-side navigation.

## Family linking

A parent account can generate a short-lived, single-use linking code. A student enters that code from their family-linking area. The backend validates the code, expiry and unused state, then creates the parent-student relationship. RLS must ensure each user can only read or modify relationships they are authorized to access.

No parent account should be assumed to exist until registration creates one.

## Favorites

Favorites are persisted per authenticated student. The menu provides a favorite toggle for every food. Toggling adds/removes the food in the database. **Mis favoritos** queries the authenticated student's favorites and therefore survives refresh, logout/login and device changes. Removing a favorite from **Mis favoritos** removes the same database relation used by the menu.

## Functions navigation

The student Functions area must expose **Mi cuenta** exactly once. Its account destination is **Mis datos**; duplicate entries must be removed at the source of the navigation list rather than hidden with CSS.
