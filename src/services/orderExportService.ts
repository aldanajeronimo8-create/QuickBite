import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Eye,
  EyeOff,
  FileSpreadsheet,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { exportActiveSalesToGoogleSheets } from '../../../services/googleSheetsExportService';
import type { Order } from '../../../lib/supabase';
import { useDataStore } from '../../../store/dataStore';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

const statusLabels: Record<
  Order['status'],
  {
    label: string;
    className: string;
  }
> = {
  pending: {
    label: 'Pedido recibido',
    className: 'bg-yellow-500 text-white',
  },

  preparing: {
    label: 'En preparación',
    className: 'bg-blue-500 text-white',
  },

  ready: {
    label: 'Listo para recoger',
    className: 'bg-green-500 text-white',
  },

  delivered: {
    label: 'Entregado',
    className: 'bg-gray-500 text-white',
  },
};

const paymentLabels: Record<
  Order['payment_status'],
  {
    label: string;
    className: string;
  }
> = {
  confirmed: {
    label: 'Confirmado',
    className: 'bg-green-100 text-green-800',
  },

  pending: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-800',
  },

  rejected: {
    label: 'Rechazado',
    className: 'bg-red-100 text-red-800',
  },
};

function getOrderErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  if (
    /not_authorized|permission denied|row-level security/i.test(
      message,
    )
  ) {
    return 'Solo los administradores pueden actualizar o cerrar el período de pedidos.';
  }

  if (
    /google sheets|exportar ventas|no se pudo conectar/i.test(
      message,
    )
  ) {
    return message;
  }

  if (
    message.includes('admin_hidden') ||
    message.includes('exported_at') ||
    message.includes('column')
  ) {
    return 'Falta aplicar una migración pendiente en Supabase. Verifica que las columnas admin_hidden y exported_at existan en la tabla de pedidos.';
  }

  return (
    message ||
    'No se pudo completar la operación con Supabase.'
  );
}

function getStatusBadge(status: Order['status']) {
  const statusConfig =
    statusLabels[status] ?? statusLabels.pending;

  return (
    <Badge className={statusConfig.className}>
      {statusConfig.label}
    </Badge>
  );
}

function getPaymentBadge(
  status: Order['payment_status'],
) {
  const paymentConfig =
    paymentLabels[status] ?? paymentLabels.pending;

  return (
    <Badge className={paymentConfig.className}>
      Pago: {paymentConfig.label}
    </Badge>
  );
}

function getItemsCount(order: Order): number {
  return (
    order.order_items?.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ) ?? 0
  );
}

export function AdminOrders() {
  const {
    orders,
    updateOrder,
    loadData,
  } = useDataStore();

  const [selectedOrder, setSelectedOrder] =
    useState<Order | null>(null);

  const [filterStatus, setFilterStatus] =
    useState<string>('all');

  const [showHidden, setShowHidden] =
    useState(false);

  const [exporting, setExporting] =
    useState(false);

  /**
   * Pedidos que todavía pertenecen al período activo.
   *
   * Los pedidos exportados a Google Sheets poseen
   * `exported_at`, por lo que dejan de aparecer aquí.
   *
   * IMPORTANTE:
   * Los pedidos NO se eliminan de Supabase.
   */
  const activeOrders = useMemo(() => {
    return orders.filter(
      (order) => !order.exported_at,
    );
  }, [orders]);

  /**
   * Cantidad de pedidos ocultos del período actual.
   */
  const hiddenCount = useMemo(() => {
    return activeOrders.filter(
      (order) => order.admin_hidden,
    ).length;
  }, [activeOrders]);

  /**
   * Aplicar filtros y ordenar los pedidos
   * desde el más reciente al más antiguo.
   */
  const filteredOrders = useMemo(() => {
    let filtered = activeOrders
      .filter((order) =>
        showHidden
          ? order.admin_hidden
          : !order.admin_hidden,
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );

    if (filterStatus !== 'all') {
      filtered = filtered.filter(
        (order) =>
          order.status === filterStatus,
      );
    }

    return filtered;
  }, [
    activeOrders,
    filterStatus,
    showHidden,
  ]);

  /**
   * Cambiar estado de un pedido.
   */
  const handleStatusChange = async (
    orderId: string,
    newStatus: Order['status'],
  ) => {
    try {
      await updateOrder(orderId, {
        status: newStatus,
      });

      toast.success(
        'Estado del pedido actualizado.',
      );

      if (
        selectedOrder?.id === orderId
      ) {
        setSelectedOrder({
          ...selectedOrder,
          status: newStatus,
        });
      }
    } catch (error) {
      toast.error(
        getOrderErrorMessage(error),
      );
    }
  };

  /**
   * Ocultar o mostrar un pedido en el panel
   * administrativo.
   */
  const handleHiddenChange = async (
    order: Order,
    hidden: boolean,
  ) => {
    try {
      await updateOrder(order.id, {
        admin_hidden: hidden,
      });

      toast.success(
        hidden
          ? 'Pedido ocultado en Admin.'
          : 'Pedido restaurado en Admin.',
      );

      if (
        selectedOrder?.id === order.id
      ) {
        setSelectedOrder({
          ...selectedOrder,
          admin_hidden: hidden,
        });
      }
    } catch (error) {
      toast.error(
        getOrderErrorMessage(error),
      );
    }
  };

  /**
   * Cierra el período actual y envía
   * las ventas activas a Google Sheets.
   *
   * Los pedidos NO se eliminan.
   *
   * El servicio de Google Sheets debe encargarse
   * de marcar los pedidos exportados con
   * `exported_at`.
   */
  const handleGoogleSheetsExport =
    async () => {
      if (activeOrders.length === 0) {
        toast.info(
          'No hay pedidos activos para enviar a Google Sheets.',
        );

        return;
      }

      const confirmed =
        window.confirm(
          'Se enviarán a Google Sheets todas las ventas activas del período actual. Después de confirmar correctamente la recepción, esas ventas dejarán de aparecer como activas en la aplicación. Los pedidos no se eliminarán de Supabase. ¿Deseas continuar?',
        );

      if (!confirmed) {
        return;
      }

      setExporting(true);

      try {
        const result =
          await exportActiveSalesToGoogleSheets();

        await loadData({
          silent: true,
        });

        setSelectedOrder(null);

        toast.success(
          `Período cerrado correctamente. ${result.exportedCount} pedido(s) enviados a Google Sheets.`,
        );
      } catch (error) {
        toast.error(
          getOrderErrorMessage(error),
        );
      } finally {
        setExporting(false);
      }
    };

  return (
    <div>
      {/* HEADER */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold text-blue-900">
            Gestión de pedidos
          </h1>

          <p className="text-lg text-gray-600">
            Administra los pedidos activos del período actual.
          </p>
        </div>

        <Button
          type="button"
          onClick={
            handleGoogleSheetsExport
          }
          disabled={
            exporting ||
            activeOrders.length === 0
          }
          className="bg-green-700 text-white hover:bg-green-800"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />

          {exporting
            ? 'Enviando a Google Sheets...'
            : 'Cerrar período en Google Sheets'}
        </Button>
      </div>

      {/* AVISO */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p>
          <strong>
            Cierre de período:
          </strong>{' '}
          las ventas activas se enviarán a
          Google Sheets con información del
          comprador, productos, cantidades,
          precios, estado del pedido, estado
          del pago y datos de inventario.
        </p>

        <p className="mt-1">
          Los pedidos no se eliminan de
          Supabase. Después de una exportación
          correcta quedan marcados como
          exportados y dejan de aparecer en
          este listado activo.
        </p>
      </div>

      {/* FILTROS */}
      <Card className="mb-6 border-0 bg-white p-6 shadow-lg">
        <div className="flex flex-wrap items-center gap-4">
          <label className="font-medium text-gray-700">
            Filtrar por estado:
          </label>

          <Select
            value={filterStatus}
            onValueChange={
              setFilterStatus
            }
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">
                Todos los pedidos
              </SelectItem>

              <SelectItem value="pending">
                Pendientes
              </SelectItem>

              <SelectItem value="preparing">
                En preparación
              </SelectItem>

              <SelectItem value="ready">
                Listos
              </SelectItem>

              <SelectItem value="delivered">
                Entregados
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setShowHidden(
                (value) => !value,
              )
            }
            className="border-blue-600 text-blue-700 hover:bg-blue-50"
          >
            {showHidden ? (
              <Eye className="mr-2 h-4 w-4" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" />
            )}

            {showHidden
              ? 'Ver activos'
              : `Ver ocultos (${hiddenCount})`}
          </Button>

          <div className="ml-auto text-sm text-gray-600">
            Total:{' '}
            <span className="font-bold text-blue-900">
              {filteredOrders.length}
            </span>{' '}
            pedido(s)
          </div>
        </div>
      </Card>

      {/* LISTA DE PEDIDOS */}
      {filteredOrders.length === 0 ? (
        <Card className="border-0 bg-white p-12 text-center shadow-lg">
          <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-gray-300" />

          <p className="text-lg text-gray-500">
            No hay pedidos para mostrar
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(
            (order) => (
              <Card
                key={order.id}
                className="border-0 bg-white p-6 shadow-lg transition hover:shadow-xl"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* INFORMACIÓN DEL PEDIDO */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-bold text-green-700">
                        {order.order_number}
                      </h3>

                      {getStatusBadge(
                        order.status,
                      )}

                      {getPaymentBadge(
                        order.payment_status,
                      )}

                      {order.admin_hidden && (
                        <Badge className="bg-slate-200 text-slate-700">
                          Oculto
                        </Badge>
                      )}
                    </div>

                    <p className="mb-3 text-sm text-gray-600">
                      {format(
                        new Date(
                          order.created_at,
                        ),
                        "d 'de' MMMM, yyyy - HH:mm",
                        {
                          locale: es,
                        },
                      )}
                    </p>

                    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                      <UserRound className="h-4 w-4 text-blue-600" />

                      <span className="font-medium">
                        Estudiante:
                      </span>

                      <span>
                        {order.user
                          ?.full_name ??
                          'No disponible'}
                      </span>

                      {order.user?.ti && (
                        <span className="text-gray-500">
                          TI {order.user.ti}
                        </span>
                      )}
                    </div>

                    {order.user?.email && (
                      <p className="mb-3 text-sm text-gray-500">
                        Correo:{' '}
                        {order.user.email}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">
                        Artículos:
                      </span>

                      <span>
                        {getItemsCount(
                          order,
                        )}{' '}
                        unidades
                      </span>
                    </div>
                  </div>

                  {/* TOTAL Y ACCIONES */}
                  <div className="text-right">
                    <p className="mb-1 text-sm text-gray-600">
                      Total
                    </p>

                    <p className="mb-3 text-3xl font-bold text-blue-900">
                      $
                      {Number(
                        order.total,
                      ).toLocaleString(
                        'es-CO',
                      )}
                    </p>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedOrder(
                            order,
                          )
                        }
                        className="border-blue-600 text-blue-700 hover:bg-blue-50"
                      >
                        Ver detalles
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleHiddenChange(
                            order,
                            !order.admin_hidden,
                          )
                        }
                        className={
                          order.admin_hidden
                            ? 'border-green-600 text-green-700 hover:bg-green-50'
                            : 'border-slate-500 text-slate-700 hover:bg-slate-50'
                        }
                      >
                        {order.admin_hidden ? (
                          <Eye className="mr-2 h-4 w-4" />
                        ) : (
                          <EyeOff className="mr-2 h-4 w-4" />
                        )}

                        {order.admin_hidden
                          ? 'Mostrar'
                          : 'Ocultar'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* RESUMEN DE COMPRA */}
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <p className="mb-3 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">
                      Compra:{' '}
                    </span>

                    {order.order_items
                      ?.map(
                        (item) =>
                          `${item.quantity}× ${
                            item.product
                              ?.name ??
                            'Producto'
                          }`,
                      )
                      .join(', ') ||
                      'Sin artículos'}
                  </p>

                  {/* CAMBIO DE ESTADO */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      Cambiar estado:
                    </span>

                    <div className="flex flex-wrap gap-2">
                      {order.status !==
                        'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleStatusChange(
                              order.id,
                              'pending',
                            )
                          }
                          className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                        >
                          Pendiente
                        </Button>
                      )}

                      {order.status !==
                        'preparing' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusChange(
                              order.id,
                              'preparing',
                            )
                          }
                          className="bg-blue-500 text-white hover:bg-blue-600"
                        >
                          En preparación
                        </Button>
                      )}

                      {order.status !==
                        'ready' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusChange(
                              order.id,
                              'ready',
                            )
                          }
                          className="bg-green-500 text-white hover:bg-green-600"
                        >
                          Listo
                        </Button>
                      )}

                      {order.status !==
                        'delivered' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusChange(
                              order.id,
                              'delivered',
                            )
                          }
                          className="bg-gray-500 text-white hover:bg-gray-600"
                        >
                          Entregado
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      )}

      {/* MODAL DE DETALLES */}
      <Dialog
        open={!!selectedOrder}
        onOpenChange={() =>
          setSelectedOrder(null)
        }
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              Detalles del pedido
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* INFORMACIÓN GENERAL */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Estudiante
                  </p>

                  <p className="font-medium">
                    {selectedOrder.user
                      ?.full_name ??
                      'No disponible'}
                  </p>

                  {selectedOrder.user
                    ?.ti && (
                    <p className="text-sm text-gray-500">
                      TI{' '}
                      {
                        selectedOrder
                          .user.ti
                      }
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Correo
                  </p>

                  <p className="break-all font-medium">
                    {selectedOrder.user
                      ?.email ??
                      'No disponible'}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Número de orden
                  </p>

                  <p className="text-xl font-bold text-green-700">
                    {
                      selectedOrder.order_number
                    }
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Total
                  </p>

                  <p className="text-xl font-bold text-blue-900">
                    $
                    {Number(
                      selectedOrder.total,
                    ).toLocaleString(
                      'es-CO',
                    )}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Estado
                  </p>

                  {getStatusBadge(
                    selectedOrder.status,
                  )}
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Estado del pago
                  </p>

                  {getPaymentBadge(
                    selectedOrder.payment_status,
                  )}
                </div>

                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Método de pago
                  </p>

                  <p className="font-medium capitalize">
                    {selectedOrder.payment_method ===
                    'cash'
                      ? 'Efectivo'
                      : selectedOrder.payment_method}
                  </p>
                </div>

                {selectedOrder.pickup_code && (
                  <div>
                    <p className="mb-1 text-sm text-gray-600">
                      Código de recogida
                    </p>

                    <p className="font-bold text-green-700">
                      {
                        selectedOrder.pickup_code
                      }
                    </p>
                  </div>
                )}

                {selectedOrder.estimated_minutes !=
                  null && (
                  <div>
                    <p className="mb-1 text-sm text-gray-600">
                      Tiempo estimado
                    </p>

                    <p className="font-medium">
                      {
                        selectedOrder.estimated_minutes
                      }{' '}
                      minutos
                    </p>
                  </div>
                )}
              </div>

              {/* ARTÍCULOS */}
              <div>
                <h3 className="mb-3 text-lg font-bold text-blue-900">
                  Artículos del pedido
                </h3>

                <div className="space-y-2">
                  {selectedOrder.order_items
                    ?.map(
                      (item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
                              {
                                item.quantity
                              }
                            </span>

                            <div>
                              <p className="font-medium">
                                {item.product
                                  ?.name ??
                                  'Producto'}
                              </p>

                              <p className="text-sm text-gray-600">
                                $
                                {Number(
                                  item.price,
                                ).toLocaleString(
                                  'es-CO',
                                )}{' '}
                                c/u
                              </p>
                            </div>
                          </div>

                          <span className="font-bold text-blue-900">
                            $
                            {Number(
                              item.price *
                                item.quantity,
                            ).toLocaleString(
                              'es-CO',
                            )}
                          </span>
                        </div>
                      ),
                    )}

                  {(!selectedOrder.order_items ||
                    selectedOrder.order_items
                      .length === 0) && (
                    <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
                      Este pedido no tiene
                      artículos registrados.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}