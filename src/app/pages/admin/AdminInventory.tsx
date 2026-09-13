import { useEffect, useMemo, useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import type { Product } from '../../../lib/supabase';
import {
  adjustInventory,
  listInventoryMovements,
  type InventoryMovement,
  type InventoryMovementType,
} from '../../../repositories/inventoryRepository';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  History,
  Package,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const movementLabels: Record<InventoryMovementType, string> = {
  entry: 'Entrada',
  sale: 'Venta',
  reservation: 'Reserva',
  release: 'Liberación',
  return: 'Devolución',
  adjustment: 'Ajuste',
};

const movementTone: Record<InventoryMovementType, string> = {
  entry: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  sale: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  reservation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  release: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  return: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  adjustment: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function AdminInventory() {
  const { products, categories, updateProduct } = useDataStore();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState('');
  const [movementType, setMovementType] = useState<InventoryMovementType>('adjustment');
  const [reason, setReason] = useState('');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [movementFilter, setMovementFilter] = useState<'all' | InventoryMovementType>('all');
  const [productFilter, setProductFilter] = useState('all');

  const stats = useMemo(() => {
    const available = products.filter((p) => p.available && p.stock > 0).length;
    const outOfStock = products.filter((p) => p.stock === 0).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
    const totalUnits = products.reduce((sum, p) => sum + Math.max(0, p.stock), 0);
    return { available, outOfStock, lowStock, totalUnits };
  }, [products]);

  const loadMovements = async () => {
    setLoadingMovements(true);
    try {
      setMovements(await listInventoryMovements(150));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el historial de inventario');
    } finally {
      setLoadingMovements(false);
    }
  };

  useEffect(() => {
    void loadMovements();
  }, []);

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    const matchesType = movementFilter === 'all' || movement.movement_type === movementFilter;
    const matchesProduct = productFilter === 'all' || movement.product_id === productFilter;
    return matchesType && matchesProduct;
  }), [movements, movementFilter, productFilter]);

  const handleStockUpdate = async () => {
    if (!editingProduct) return;
    const newStock = Number.parseInt(stock, 10);
    if (!Number.isInteger(newStock) || newStock < 0) {
      toast.error('Ingresa un stock válido');
      return;
    }
    if (newStock === editingProduct.stock) {
      toast.error('El nuevo stock es igual al stock actual');
      return;
    }

    try {
      await adjustInventory(editingProduct.id, newStock, movementType, reason);
      await updateProduct(editingProduct.id, { stock: newStock });
      await loadMovements();
      toast.success(`${movementLabels[movementType]} registrada correctamente`);
      setEditingProduct(null);
      setStock('');
      setReason('');
      setMovementType('adjustment');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el movimiento');
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    try {
      await updateProduct(product.id, { available: !product.available });
      toast.success(product.available ? 'Producto ocultado del menú' : 'Producto visible en el menú');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la disponibilidad');
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setStock(product.stock.toString());
    setMovementType(product.stock === 0 ? 'entry' : 'adjustment');
    setReason('');
  };

  const getCategoryName = (categoryId: string) => categories.find((c) => c.id === categoryId)?.name || 'Sin categoría';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--qb-text)]">Inventario</h1>
          <p className="mt-2 text-lg text-[var(--qb-text-secondary)]">Control de stock y trazabilidad de movimientos</p>
        </div>
        <Button variant="outline" onClick={() => void loadMovements()} disabled={loadingMovements}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingMovements ? 'animate-spin' : ''}`} />
          Actualizar historial
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-5">
          <div className="flex items-center justify-between"><Package className="h-7 w-7 text-emerald-500" /><span className="text-3xl font-bold text-[var(--qb-text)]">{stats.available}</span></div>
          <p className="mt-2 text-sm text-[var(--qb-text-muted)]">Productos disponibles</p>
        </Card>
        <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-5">
          <div className="flex items-center justify-between"><AlertTriangle className="h-7 w-7 text-red-500" /><span className="text-3xl font-bold text-[var(--qb-text)]">{stats.outOfStock}</span></div>
          <p className="mt-2 text-sm text-[var(--qb-text-muted)]">Productos agotados</p>
        </Card>
        <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-5">
          <div className="flex items-center justify-between"><Activity className="h-7 w-7 text-amber-500" /><span className="text-3xl font-bold text-[var(--qb-text)]">{stats.lowStock}</span></div>
          <p className="mt-2 text-sm text-[var(--qb-text-muted)]">Stock bajo (≤5)</p>
        </Card>
        <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-5">
          <div className="flex items-center justify-between"><History className="h-7 w-7 text-blue-500" /><span className="text-3xl font-bold text-[var(--qb-text)]">{stats.totalUnits}</span></div>
          <p className="mt-2 text-sm text-[var(--qb-text-muted)]">Unidades en inventario</p>
        </Card>
      </div>

      <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-6">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-2xl font-bold text-[var(--qb-text)]">Stock actual</h2><p className="text-sm text-[var(--qb-text-muted)]">El stock se modifica mediante movimientos trazables.</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-[var(--qb-border)] text-left text-sm text-[var(--qb-text-muted)]">
                <th className="px-4 py-3">Producto</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3">Precio</th><th className="px-4 py-3 text-center">Stock</th><th className="px-4 py-3 text-center">Estado</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-[var(--qb-border)]/60 hover:bg-[var(--qb-surface-muted)]">
                  <td className="px-4 py-4"><div className="flex items-center gap-3"><img src={product.image_url} alt={product.name} className="h-12 w-12 rounded-lg object-cover" /><div><p className="font-semibold text-[var(--qb-text)]">{product.name}</p><p className="line-clamp-1 text-sm text-[var(--qb-text-muted)]">{product.description}</p></div></div></td>
                  <td className="px-4 py-4"><Badge variant="outline">{getCategoryName(product.category_id)}</Badge></td>
                  <td className="px-4 py-4 font-bold text-emerald-600 dark:text-emerald-400">${product.price.toLocaleString()}</td>
                  <td className="px-4 py-4 text-center"><span className={`text-lg font-bold ${product.stock === 0 ? 'text-red-500' : product.stock <= 5 ? 'text-amber-500' : 'text-emerald-500'}`}>{product.stock}</span></td>
                  <td className="px-4 py-4 text-center">{!product.available ? <Badge variant="secondary">Oculto</Badge> : product.stock === 0 ? <Badge className="bg-red-500 text-white">Agotado</Badge> : product.stock <= 5 ? <Badge className="bg-amber-500 text-white">Stock bajo</Badge> : <Badge className="bg-emerald-600 text-white">Disponible</Badge>}</td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-2"><Button size="sm" onClick={() => openEditDialog(product)}><Package className="mr-2 h-4 w-4" />Movimiento</Button><Button size="sm" variant="outline" onClick={() => void handleToggleAvailability(product)}>{product.available ? <><EyeOff className="mr-2 h-4 w-4" />Ocultar</> : <><Eye className="mr-2 h-4 w-4" />Mostrar</>}</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-[var(--qb-border)] bg-[var(--qb-surface)] p-6">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="text-2xl font-bold text-[var(--qb-text)]">Movimientos de inventario</h2><p className="text-sm text-[var(--qb-text-muted)]">Historial de entradas, ventas, reservas, liberaciones, devoluciones y ajustes.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={movementFilter} onValueChange={(value) => setMovementFilter(value as typeof movementFilter)}><SelectTrigger className="w-[190px]"><SelectValue placeholder="Tipo de movimiento" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los movimientos</SelectItem>{Object.entries(movementLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={productFilter} onValueChange={setProductFilter}><SelectTrigger className="w-[230px]"><SelectValue placeholder="Producto" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los productos</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead><tr className="border-b border-[var(--qb-border)] text-left text-sm text-[var(--qb-text-muted)]"><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Movimiento</th><th className="px-4 py-3 text-center">Cantidad</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Motivo</th></tr></thead>
            <tbody>
              {loadingMovements ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--qb-text-muted)]">Cargando movimientos…</td></tr> : filteredMovements.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--qb-text-muted)]">No hay movimientos que coincidan con los filtros.</td></tr> : filteredMovements.map((movement) => {
                const delta = movement.new_stock - movement.previous_stock;
                return <tr key={movement.id} className="border-b border-[var(--qb-border)]/60 hover:bg-[var(--qb-surface-muted)]"><td className="px-4 py-4 text-sm text-[var(--qb-text-secondary)]">{new Date(movement.created_at).toLocaleString('es-CO')}</td><td className="px-4 py-4 font-medium text-[var(--qb-text)]">{movement.product?.name ?? 'Producto eliminado'}</td><td className="px-4 py-4"><Badge className={movementTone[movement.movement_type]}>{delta >= 0 ? <ArrowUp className="mr-1 h-3.5 w-3.5" /> : <ArrowDown className="mr-1 h-3.5 w-3.5" />}{movementLabels[movement.movement_type]}</Badge></td><td className="px-4 py-4 text-center font-bold text-[var(--qb-text)]">{movement.quantity}</td><td className="px-4 py-4 text-sm text-[var(--qb-text-secondary)]">{movement.previous_stock} → <strong className="text-[var(--qb-text)]">{movement.new_stock}</strong></td><td className="px-4 py-4 text-sm text-[var(--qb-text-secondary)]">{movement.user?.full_name ?? 'Sistema'}</td><td className="max-w-[280px] px-4 py-4 text-sm text-[var(--qb-text-secondary)]">{movement.reason ?? '—'}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar movimiento de inventario</DialogTitle></DialogHeader>
          {editingProduct && <div className="space-y-5"><div className="flex items-center gap-4"><img src={editingProduct.image_url} alt={editingProduct.name} className="h-16 w-16 rounded-lg object-cover" /><div><h3 className="font-bold text-[var(--qb-text)]">{editingProduct.name}</h3><p className="text-sm text-[var(--qb-text-muted)]">Stock actual: {editingProduct.stock}</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="movement-type">Tipo de movimiento</Label><Select value={movementType} onValueChange={(value) => setMovementType(value as InventoryMovementType)}><SelectTrigger id="movement-type" className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(movementLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="inventory-stock">Nuevo stock</Label><Input id="inventory-stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className="mt-2" /></div></div><div><Label htmlFor="inventory-reason">Motivo {movementType === 'adjustment' && <span className="text-red-500">*</span>}</Label><Input id="inventory-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2" placeholder="Ej. Nueva producción, producto dañado…" /></div><div className="rounded-lg border border-[var(--qb-border)] bg-[var(--qb-surface-muted)] p-4 text-sm text-[var(--qb-text-secondary)]">El sistema guardará automáticamente el stock anterior, el stock nuevo, la cantidad, el usuario y la fecha.</div><div className="flex gap-3"><Button onClick={() => void handleStockUpdate()} className="flex-1">Guardar movimiento</Button><Button onClick={() => setEditingProduct(null)} variant="outline" className="flex-1">Cancelar</Button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
