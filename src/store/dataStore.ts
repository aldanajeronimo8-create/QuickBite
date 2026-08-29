    if (!options?.silent) set({ loading: true });
    try {
      const [categories, products, orders] = await Promise.all([repo.listCategories(), repo.listProducts(), repo.listOrders()]);
      let users: Profile[] = [];
      try { users = await repo.listProfiles(); } catch { users = []; }
      set({ categories, products, orders, users });
    } finally { if (!options?.silent) set({ loading: false }); }
  },

  addProduct: async (productData) => { const product = await repo.createProduct(productData); await remoteAudit({ action: 'product.create', entity: 'product', entityId: product.id, metadata: { name: product.name } }); set({ products: [product, ...get().products] }); },
  updateProduct: async (id, updates) => { const product = await repo.updateProduct(id, updates); await remoteAudit({ action: 'product.update', entity: 'product', entityId: id, metadata: updates as Record<string, unknown> }); set({ products: get().products.map((item) => item.id === id ? product : item) }); },
  deleteProduct: async (id) => { await repo.deleteProduct(id); await remoteAudit({ action: 'product.delete', entity: 'product', entityId: id }); set({ products: get().products.filter((product) => product.id !== id) }); },

  addOrder: async (orderData) => {
    const orderNumber = await repo.createOrder(orderData);
    await remoteAudit({ action: 'order.create', actorId: orderData.user_id, entity: 'order', metadata: { payment_method: orderData.payment_method } });
    await Promise.allSettled((orderData.order_items ?? []).map((item) => recordDemand(item.product_id, item.quantity, 'order')));
    await get().loadData({ silent: true });
    return orderNumber;
  },

  updateOrder: async (id, updates) => {
    let order: Order;
    if (updates.status && Object.keys(updates).length === 1) {
      await setOrderStatus(id, updates.status);
      const current = get().orders.find((item) => item.id === id);
      if (!current) { await get().loadData({ silent: true }); return; }
      order = { ...current, status: updates.status };
    } else {
      order = await repo.updateOrder(id, updates);
    }
    await remoteAudit({ action: updates.payment_status ? 'payment.update' : updates.status ? 'order.status_change' : 'order.update', entity: 'order', entityId: id, metadata: updates as Record<string, unknown> });
    set({ orders: get().orders.map((item) => item.id === id ? order : item) });
  },

  archiveOrders: async (ids) => { const archivedCount = await repo.archiveOrders(ids); if (!archivedCount) return 0; const archivedIds = new Set(ids); await remoteAudit({ action: 'order.update', entity: 'order', metadata: { action: 'period_closed', archived_orders: archivedCount } }); set({ orders: get().orders.map((order) => archivedIds.has(order.id) ? { ...order, admin_hidden: true } : order) }); return archivedCount; },