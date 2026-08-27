import { create } from 'zustand';
import {
  requireSupabaseClient,
  type Category,
  type Order,
  type Product,
  type Profile,
} from '../lib/supabase';
import { writeAuditLog } from '../lib/auditLog';
import { appConfig } from '../config/appConfig';
import * as repo from '../repositories/quickbiteRepository';

const REALTIME_TABLES = ['profiles', 'categories', 'products', 'orders', 'order_items'] as const;

export interface HistoryEntry {
  id: string;
  action: 'create' | 'update' | 'delete' | 'status_change';
  entity: 'product' | 'order' | 'category' | 'user';
  description: string;
  timestamp: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface DataState {
  categories: Category[];
  products: Product[];
  orders: Order[];
  users: Profile[];
  history: HistoryEntry[];
  loading: boolean;
  loadData: (options?: { silent?: boolean }) => Promise<void>;
  addProduct: (product: repo.NewProduct) => Promise<void>;
  updateProduct: (id: string, updates: repo.ProductUpdate) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addOrder: (orderData: repo.NewOrder) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addUser: (user: repo.NewManagedUser) => Promise<void>;
  updateUser: (user: repo.ManagedUserUpdate) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  getProductsByCategory: (categoryId?: string) => Product[];
  getOrdersByUser: (userId: string) => Order[];
  subscribeRealtime: () => () => void;
  clearHistory: () => void;
}

async function remoteAudit(entry: Parameters<typeof writeAuditLog>[0]) {
  writeAuditLog(entry);
  try {
    await repo.writeAudit({
      action: entry.action,
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      entity: entry.entity,
      entity_id: entry.entityId,
      metadata: entry.metadata,
    });
  } catch (error) {
    writeAuditLog({
      action: 'app.error',
      metadata: { source: 'remote_audit', message: String(error) },
    });
  }
}

export const useDataStore = create<DataState>((set, get) => ({
  categories: [],
  products: [],
  orders: [],
  users: [],
  history: [],
  loading: false,

  loadData: async (options) => {
    if (!options?.silent) set({ loading: true });
    try {
      const [categories, products, orders] = await Promise.all([
        repo.listCategories(),
        repo.listProducts(),
        repo.listOrders(),
      ]);

      let users: Profile[] = [];
      try {
        users = await repo.listProfiles();
      } catch {
        users = [];
      }

      set({ categories, products, orders, users });
    } finally {
      if (!options?.silent) set({ loading: false });
    }
  },

  addProduct: async (productData) => {
    const product = await repo.createProduct(productData);
    await remoteAudit({
      action: 'product.create',
      entity: 'product',
      entityId: product.id,
      metadata: { name: product.name },
    });
    set({ products: [product, ...get().products] });
  },

  updateProduct: async (id, updates) => {
    const product = await repo.updateProduct(id, updates);
    await remoteAudit({
      action: 'product.update',
      entity: 'product',
      entityId: id,
      metadata: updates as Record<string, unknown>,
    });
    set({ products: get().products.map((item) => (item.id === id ? product : item)) });
  },

  deleteProduct: async (id) => {
    await repo.deleteProduct(id);
    await remoteAudit({ action: 'product.delete', entity: 'product', entityId: id });
    set({ products: get().products.filter((product) => product.id !== id) });
  },

  addOrder: async (orderData) => {
    const orderNumber = await repo.createOrder(orderData);
    await remoteAudit({
      action: 'order.create',
      actorId: orderData.user_id,
      entity: 'order',
      metadata: { payment_method: orderData.payment_method },
    });
    await get().loadData({ silent: true });
    return orderNumber;
  },

  updateOrder: async (id, updates) => {
    const order = await repo.updateOrder(id, updates);
    await remoteAudit({
      action: updates.payment_status ? 'payment.update' : 'order.update',
      entity: 'order',
      entityId: id,
      metadata: updates as Record<string, unknown>,
    });
    set({ orders: get().orders.map((item) => (item.id === id ? order : item)) });
  },

  deleteOrder: async (id) => {
    await repo.deleteOrder(id);
    await remoteAudit({
      action: 'order.update',
      entity: 'order',
      entityId: id,
      metadata: { deleted: true },
    });
    set({ orders: get().orders.filter((order) => order.id !== id) });
  },

  addUser: async (user) => {
    await repo.createManagedUser(user);
    await remoteAudit({
      action: 'auth.signup',
      actorEmail: user.email,
      entity: 'user',
      metadata: { role: user.role },
    });
    await get().loadData({ silent: true });
  },

  updateUser: async (user) => {
    await repo.updateManagedUser(user);
    await remoteAudit({
      action: 'settings.update',
      actorEmail: user.email,
      entity: 'user',
      entityId: user.id,
      metadata: { role: user.role },
    });
    await get().loadData({ silent: true });
  },

  deleteUser: async (id) => {
    await repo.deleteManagedUser(id);
    await remoteAudit({
      action: 'settings.update',
      entity: 'user',
      entityId: id,
      metadata: { deleted: true },
    });
    set({ users: get().users.filter((user) => user.id !== id) });
  },

  getProductsByCategory: (categoryId) => {
    const { products } = get();
    const visible = products.filter((product) => product.available && product.stock > 0);
    return categoryId ? visible.filter((product) => product.category_id === categoryId) : visible;
  },

  getOrdersByUser: (userId) => get().orders.filter((order) => order.user_id === userId),

  subscribeRealtime: () => {
    const supabase = requireSupabaseClient();
    if (!appConfig.supabaseRealtimeEnabled) return () => undefined;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshInterval: ReturnType<typeof setInterval> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        get()
          .loadData({ silent: true })
          .catch((error) => {
            writeAuditLog({
              action: 'app.error',
              metadata: { source: 'realtime_refresh', message: String(error) },
            });
          });
      }, 150);
    };
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    let channel = supabase.channel('quickbite-db-changes');
    REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    });

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        writeAuditLog({
          action: 'app.error',
          metadata: { source: 'realtime_subscription', status, message: error?.message },
        });
      }
      if (status === 'SUBSCRIBED') scheduleRefresh();
    });

    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', scheduleRefresh);
    if (appConfig.dataRefreshIntervalMs > 0) {
      refreshInterval = setInterval(scheduleRefresh, appConfig.dataRefreshIntervalMs);
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', scheduleRefresh);
      supabase.removeChannel(channel);
    };
  },

  clearHistory: () => set({ history: [] }),
}));
