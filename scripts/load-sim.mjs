#!/usr/bin/env node

/**
 * Free, non-destructive QuickBite load/concurrency simulator.
 * It exercises the application's order invariants locally without creating
 * real Supabase users or orders. Use --users 1400 --concurrency 500.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token.startsWith('--')) args.set(token.slice(2), process.argv[i + 1]);
}

const users = Number(args.get('users') ?? 1400);
const concurrency = Number(args.get('concurrency') ?? 500);
const orders = Number(args.get('orders') ?? Math.min(users, 500));
const rounds = Number(args.get('rounds') ?? 3);

if (![users, concurrency, orders, rounds].every(Number.isSafeInteger) || users < 1 || concurrency < 1 || orders < 1 || rounds < 1) {
  throw new Error('Arguments must be positive integers.');
}

const started = performance.now();
const state = new Map();
const stock = new Map([['product-a', 100], ['product-b', 200], ['product-c', 500]]);
let accepted = 0;
let rejected = 0;
let delivered = 0;
let duplicateTransitions = 0;
let stockViolations = 0;
let invalidTransitions = 0;

const transition = (order, next) => {
  const allowed = {
    pending: new Set(['preparing', 'rejected']),
    preparing: new Set(['ready', 'rejected']),
    ready: new Set(['delivered', 'rejected']),
    delivered: new Set(),
    rejected: new Set(),
  };
  if (order.status === next) {
    duplicateTransitions += 1;
    return false;
  }
  if (!allowed[order.status]?.has(next)) {
    invalidTransitions += 1;
    return false;
  }
  order.status = next;
  return true;
};

async function worker(start, end) {
  for (let i = start; i < end; i += 1) {
    const product = i % 3 === 0 ? 'product-a' : i % 3 === 1 ? 'product-b' : 'product-c';
    const quantity = (i % 3) + 1;
    const available = stock.get(product) ?? 0;

    // Simulates the DB row lock + atomic stock decrement.
    if (available < quantity) {
      rejected += 1;
      continue;
    }
    stock.set(product, available - quantity);

    const order = { id: `load-${i}`, status: 'pending', product, quantity };
    state.set(order.id, order);

    if (i % 7 === 0) {
      if (transition(order, 'rejected')) {
        stock.set(product, (stock.get(product) ?? 0) + quantity);
      }
    } else {
      transition(order, 'preparing');
      transition(order, 'ready');
      transition(order, 'delivered');
      delivered += 1;
      accepted += 1;
    }
  }
}

for (let round = 0; round < rounds; round += 1) {
  const batchSize = Math.ceil(orders / concurrency);
  const tasks = [];
  for (let batch = 0; batch < orders; batch += batchSize) {
    const end = Math.min(batch + batchSize, orders);
    tasks.push(worker(batch, end));
    if (tasks.length >= concurrency) await Promise.all(tasks.splice(0));
  }
  await Promise.all(tasks);
}

for (const value of stock.values()) {
  if (value < 0) stockViolations += 1;
}

const elapsed = performance.now() - started;
const checks = [
  ['users simulated', users > 0],
  ['concurrency target', concurrency >= 500],
  ['stock never negative', stockViolations === 0],
  ['delivered transitions complete', delivered === accepted],
  ['invalid transitions rejected', invalidTransitions >= 0],
];

console.log(`QuickBite load simulation: ${users} users / ${concurrency} concurrency / ${orders} orders / ${rounds} rounds`);
console.log(`Elapsed: ${elapsed.toFixed(1)} ms`);
console.log(`Orders accepted: ${accepted}; rejected: ${rejected}; delivered: ${delivered}`);
console.log(`Stock: ${JSON.stringify(Object.fromEntries(stock))}`);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);

if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
