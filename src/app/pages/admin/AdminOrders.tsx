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
    return 'Solo los administradores pueden realizar esta operación.';
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
    message.includes('export_batch_id') ||
    message.includes('column')
  ) {
    return 'La base de datos de Supabase no tiene todas las migraciones necesarias. Aplica las migraciones pendientes y vuelve a intentarlo.';
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

function formatCurrency(value: number | string): string {
  return Number(value).toLocaleString('es-CO');
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

  /*
   * Los pedidos que ya fueron enviados correctamente
   * a Google Sheets tienen exported_at.
   *
   * Esos pedidos permanecen en Supabase como historial,
   * pero ya no aparecen dentro del período activo.
   */
  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) => !order.exported_at,
      ),
    [orders],
  );

  /*
   * Cantidad de pedidos ocultos del período actual.
   */
  const hiddenCount = useMemo(
    () =>
      activeOrders.filter(
        (order) => order.admin_hidden === true,
      ).length,
    [activeOrders],
  );

  /*
   * Aplica los filtros de estado y visibilidad.
   */
  const filteredOrders = useMemo(() => {
    let filtered = activeOrders.filter(
      (order) => {
        if (showHidden) {
          return order.admin_hidden === true;
        }

        return order.admin_hidden !== true;
      },
    );

    if (filterStatus !== 'all') {
      filtered = filtered.filter(
        (order) =>
          order.status === filterStatus,
      );
    }

    return [...filtered].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime(),
    );
  }, [
    activeOrders,
    filterStatus,
    showHidden,
  ]);

  /*
   * Cambia el estado del pedido.
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
        'Estado del pedido actualizado correctamente.',
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

  /*
   * Oculta o restaura un pedido únicamente
   * de la vista administrativa.
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
          ? 'Pedido ocultado en Administración.'
          : 'Pedido restaurado en Administración.',
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

  /*
   * Cierra el período actual.
   *
   * El backend:
   * 1. Toma las ventas activas.
   * 2. Las registra en Google Sheets.
   * 3. Si Google Sheets confirma correctamente,
   *    marca los pedidos como exportados.
   *
   * Los pedidos NO se eliminan de Supabase.
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
          'Se enviarán a Google Sheets todas las ventas activas del período actual. Después de una exportación exitosa, dejarán de aparecer como pedidos activos. Los registros NO se eliminarán de Supabase. ¿Deseas continuar?',
        );

      if (!confirmed) {
        return;
      }

      setExporting(true);

      try {
        const result =
          await exportActiveSalesToGoogleSheets();

        /*
         * Actualizamos los datos para que los pedidos
         * que ahora tienen exported_at desaparezcan
         * inmediatamente de la lista activa.
         */
        await loadData({
          silent: true,
        });

        setSelectedOrder(null);

        toast.success(
          `Período cerrado correctamente. ${result.exportedCount} pedido(s) fueron enviados a Google Sheets.`,
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
        <p className="font-medium">
          Cierre del período de ventas
        </p>

        <p className="mt-1">
          Al cerrar el período, las ventas activas
          se envían a Google Sheets con la información
          disponible de compradores, productos,
          cantidades, precios, pagos e inventario.
          Los pedidos no se eliminan de Supabase:
          quedan registrados como exportados.
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
                Listos para recoger
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
            {showHidden
              ? 'No hay pedidos ocultos.'
              : 'No hay pedidos para mostrar.'}
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
                {/* INFORMACIÓN PRINCIPAL */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* ESTADO */}
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

                      {order.admin_hidden ===
                        true && (
                        <Badge className="bg-slate-200 text-slate-700">
                          Oculto
                        </Badge>
                      )}
                    </div>

                    {/* FECHA */}
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

                    {/* CLIENTE */}
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

                    {/* ARTÍCULOS */}
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
                      {formatCurrency(
                        order.total,
                      )}
                    </p>

                    <div className="flex flex-wrap justify-end gap-2">
                      {/* VER DETALLES */}
                      <Button
                        type="button"
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

                      {/* OCULTAR / MOSTRAR */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleHiddenChange(
                            order,
                            order.admin_hidden !==
                              true,
                          )
                        }
                        className={
                          order.admin_hidden ===
                          true
                            ? 'border-green-600 text-green-700 hover:bg-green-50'
                            : 'border-slate-500 text-slate-700 hover:bg-slate-50'
                        }
                      >
                        {order.admin_hidden ===
                        true ? (
                          <Eye className="mr-1 h-4 w-4" />
                        ) : (
                          <EyeOff className="mr-1 h-4 w-4" />
                        )}

                        {order.admin_hidden ===
                        true
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
                      {/* PENDIENTE */}
                      {order.status !==
                        'pending' && (
                        <Button
                          type="button"
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

                      {/* PREPARANDO */}
                      {order.status !==
                        'preparing' && (
                        <Button
                          type="button"
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

                      {/* LISTO */}
                      {order.status !==
                        'ready' && (
                        <Button
                          type="button"
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

                      {/* ENTREGADO */}
                      {order.status !==
                        'delivered' && (
                        <Button
                          type="button"
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
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
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
                {/* ESTUDIANTE */}
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

                {/* NÚMERO */}
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

                {/* TOTAL */}
                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Total
                  </p>

                  <p className="text-xl font-bold text-blue-900">
                    $
                    {formatCurrency(
                      selectedOrder.total,
                    )}
                  </p>
                </div>

                {/* ESTADO */}
                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Estado
                  </p>

                  {getStatusBadge(
                    selectedOrder.status,
                  )}
                </div>

                {/* MÉTODO DE PAGO */}
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

                {/* ESTADO DEL PAGO */}
                <div>
                  <p className="mb-1 text-sm text-gray-600">
                    Estado del pago
                  </p>

                  {getPaymentBadge(
                    selectedOrder.payment_status,
                  )}
                </div>

                {/* CÓDIGO DE RECOGIDA */}
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

                {/* TIEMPO ESTIMADO */}
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

                {/* REFERENCIA DE PAGO */}
                {selectedOrder.payment_reference && (
                  <div>
                    <p className="mb-1 text-sm text-gray-600">
                      Referencia de pago
                    </p>

                    <p className="break-all font-medium">
                      {
                        selectedOrder.payment_reference
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* ARTÍCULOS */}
              <div>
                <h3 className="mb-3 text-lg font-bold text-blue-900">
                  Artículos del pedido
                </h3>

                {selectedOrder.order_items &&
                selectedOrder.order_items.length > 0 ? (
                  <div className="space-y-2">
                    {selectedOrder.order_items.map(
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
                                {item
                                  .product
                                  ?.name ??
                                  'Producto'}
                              </p>

                              <p className="text-sm text-gray-600">
                                $
                                {formatCurrency(
                                  item.price,
                                )}{' '}
                                c/u
                              </p>

                              {item.stock_before !=
                                null &&
                                item.stock_after !=
                                  null && (
                                  <p className="text-xs text-gray-500">
                                    Stock:{' '}
                                    {
                                      item.stock_before
                                    }{' '}
                                    →{' '}
                                    {
                                      item.stock_after
                                    }
                                  </p>
                                )}
                            </div>
                          </div>

                          <span className="font-bold text-blue-900">
                            $
                            {formatCurrency(
                              Number(
                                item.price,
                              ) *
                                item.quantity,
                            )}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                    Este pedido no contiene artículos.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}