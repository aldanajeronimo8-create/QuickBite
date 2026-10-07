# QuickBite Staff

## Purpose

The Staff role is the cafeteria operation workspace. It is separate from Admin and is limited to active order processing.

## Access model

- Only an active Staff account can enter /staff.
- Only an Admin can create, edit, activate, or deactivate Staff accounts.
- Staff cannot create users, change roles, manage administrators, or access /admin.
- Deactivating a Staff account revokes its active sessions.

## Operational flow

pending -> preparing -> ready -> delivered

Every Staff status transition is recorded in audit_logs with the Staff identity and the previous/new status.

## Data access

The Staff interface reads active orders through a dedicated database RPC and changes order state through a dedicated Staff RPC. It does not receive broad administrative access to the orders table.

## Real-time behavior

The dashboard refreshes on a short polling interval and listens for order changes through Realtime so the operational queue remains current.

## Testing

The intended next audit stage is:

1. Functional Staff route and authorization tests.
2. Four-role functional tests.
3. Isolated test accounts.
4. k6 load tests for Student, Parent, Staff, and Admin.
5. Mixed-role concurrency test.
