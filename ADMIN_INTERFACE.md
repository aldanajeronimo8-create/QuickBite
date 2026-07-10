# QuickBite Admin Interface

Admin routes live under `/admin` and must be protected by authenticated `role = admin` profiles.

Routes:

- `/admin`: dashboard
- `/admin/orders`: order operations
- `/admin/payments`: payment review
- `/admin/inventory`: stock and visibility
- `/admin/menu`: menu CRUD
- `/admin/verification`: pickup verification

No default admin credentials are shipped. Create the first administrator through the configured setup/bootstrap flow for your own environment.
