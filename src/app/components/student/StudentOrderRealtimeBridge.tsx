import { useEffect } from 'react';
import { toast } from 'sonner';
import { subscribeToOrderQueue } from '../../../services/platformFeatures';

type OrderChange = { eventType?: string; new?: { id?: string; user_id?: string; order_number?: string; status?: string }; old?: { id?: string; user_id?: string; order_number?: string; status?: string } };

const labels: Record<string, string> = {
  pending: 'recibido',
  confirmed: 'confirmado',
  preparing: 'en preparación',
  ready: 'listo para recoger',
  delivered: 'entregado',
  cancelled: 'cancelado',
};

/** Keeps the Student experience synchronized with order status changes in Supabase Realtime. */
export function StudentOrderRealtimeBridge({ userId }: { userId: string }) {
  useEffect(() => {
    const channel = subscribeToOrderQueue((payload) => {
      const change = payload as OrderChange;
      const order = change.new;
      if (!order?.user_id || order.user_id !== userId || !order.status) return;
      toast.info(`Pedido ${order.order_number ?? ''} ${labels[order.status] ?? order.status}.`);
    });
    return () => {
      void channel.unsubscribe();
    };
  }, [userId]);

  return null;
}
