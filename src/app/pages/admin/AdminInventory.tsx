import { useState, useMemo } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Package, AlertTriangle, Edit, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export function AdminInventory() {
  const { products, categories, updateProduct } = useDataStore();
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [stock, setStock] = useState('');

  const stats = useMemo(() => {
    const available = products.filter((p) => p.available && p.stock > 0).length;
    const outOfStock = products.filter((p) => p.stock === 0).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
    const hidden = products.filter((p) => !p.available).length;

    return { available, outOfStock, lowStock, hidden };
  }, [products]);

  const handleStockUpdate = async () => {
    if (!editingProduct) return;

    const newStock = parseInt(stock);
    if (isNaN(newStock) || newStock < 0) {
      toast.error('Ingresa un stock válido');
      return;
    }

    try {
      await updateProduct(editingProduct.id, { stock: newStock });
      toast.success('Stock actualizado exitosamente');
      setEditingProduct(null);
      setStock('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el stock');
    }
  };

  const handleToggleAvailability = async (product: any) => {
    try {
      await updateProduct(product.id, { available: !product.available });
      toast.success(
        product.available ? 'Producto ocultado del menú' : 'Producto visible en el menú',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar la disponibilidad');
    }
  };

  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setStock(product.stock.toString());
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || 'Sin categoría';
  };

  const getStockBadge = (product: any) => {
    if (!product.available) {
      return <Badge className="bg-gray-500 text-white">Oculto</Badge>;
    }
    if (product.stock === 0) {
      return <Badge className="bg-red-500 text-white">Agotado</Badge>;
    }
    if (product.stock <= 5) {
      return <Badge className="bg-orange-500 text-white">Stock Bajo</Badge>;
    }
    return <Badge className="bg-green-500 text-white">Disponible</Badge>;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-blue-900 mb-2">Inventario</h1>
        <p className="text-gray-600 text-lg">Gestiona el stock y disponibilidad de productos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.available}</span>
          </div>
          <p className="text-green-100 text-sm font-medium">Productos Disponibles</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.outOfStock}</span>
          </div>
          <p className="text-red-100 text-sm font-medium">Productos Agotados</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.lowStock}</span>
          </div>
          <p className="text-orange-100 text-sm font-medium">Stock Bajo (≤5)</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-gray-500 to-gray-600 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <EyeOff className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.hidden}</span>
          </div>
          <p className="text-gray-100 text-sm font-medium">Productos Ocultos</p>
        </Card>
      </div>

      {/* Products Table */}
      <Card className="p-6 bg-white shadow-lg border-0">
        <h2 className="text-2xl font-bold text-blue-900 mb-6">Productos</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 font-bold text-gray-700">Producto</th>
                <th className="text-left py-3 px-4 font-bold text-gray-700">Categoría</th>
                <th className="text-left py-3 px-4 font-bold text-gray-700">Precio</th>
                <th className="text-center py-3 px-4 font-bold text-gray-700">Stock</th>
                <th className="text-center py-3 px-4 font-bold text-gray-700">Estado</th>
                <th className="text-right py-3 px-4 font-bold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-sm text-gray-600 line-clamp-1">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {getCategoryName(product.category_id)}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-bold text-green-700">
                      ${product.price.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span
                      className={`text-lg font-bold ${
                        product.stock === 0
                          ? 'text-red-600'
                          : product.stock <= 5
                            ? 'text-orange-600'
                            : 'text-green-700'
                      }`}
                    >
                      {product.stock}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">{getStockBadge(product)}</td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        onClick={() => openEditDialog(product)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Ajustar Stock
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleAvailability(product)}
                        className={
                          product.available
                            ? 'border-gray-600 text-gray-700 hover:bg-gray-50'
                            : 'border-green-600 text-green-700 hover:bg-green-50'
                        }
                      >
                        {product.available ? (
                          <>
                            <EyeOff className="w-4 h-4 mr-2" />
                            Ocultar
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            Mostrar
                          </>
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Stock Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Stock</DialogTitle>
          </DialogHeader>

          {editingProduct && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <img
                  src={editingProduct.image_url}
                  alt={editingProduct.name}
                  className="w-20 h-20 object-cover rounded-lg"
                />
                <div>
                  <h3 className="font-bold text-lg">{editingProduct.name}</h3>
                  <p className="text-sm text-gray-600">Stock actual: {editingProduct.stock}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="stock">Nuevo Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="mt-2"
                  placeholder="Ingresa la cantidad"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleStockUpdate}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  Guardar Cambios
                </Button>
                <Button
                  onClick={() => setEditingProduct(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
