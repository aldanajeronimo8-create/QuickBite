const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('E2E data configuration is incomplete.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const response = await fetch(
  `${url}/rest/v1/products?select=id,name,stock,available&available=eq.true&order=created_at.desc&limit=1`,
  { headers },
);

if (!response.ok) {
  throw new Error(`Failed to load the deterministic E2E product (${response.status}): ${await response.text()}`);
}

const products = await response.json();
const product = products[0];

if (!product?.id) {
  throw new Error('No available product exists for the deterministic purchase E2E.');
}

const targetStock = 100;
const update = await fetch(
  `${url}/rest/v1/products?id=eq.${encodeURIComponent(product.id)}`,
  {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ stock: targetStock, available: true }),
  },
);

if (!update.ok) {
  throw new Error(`Failed to prepare deterministic E2E product stock (${update.status}): ${await update.text()}`);
}

console.log(`Prepared deterministic E2E purchase product "${product.name}" (${product.id}) with stock ${targetStock}.`);
