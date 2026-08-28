import { useState } from 'react';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '../../../lib/supabase';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';

export function AdminMenu() {
  const { products, categories, addProduct, updateProduct, deleteProduct } = useDataStore();
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: '', image_url: '', category_id: '', stock: '', available: true });

  const openNewProductDialog = () => {
    setEditingProduct(null);
    setFormData({ name: '', description: '', price: '', image_url: '', category_id: safeCategories[0]?.id || '', stock: '', available: true });
    setIsDialogOpen(true);
  };

  const openEditProductDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name ?? '',
      description: product.description ?? '',
      price: String(Number(product.price ?? 0)),
      image_url: product.image_url ?? '',
      category_id: product.category_id ?? '',
      stock: String(Number(product.stock ?? 0)),
      available: product.available !== false,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(formData.price);
    const stock = Number.parseInt(formData.stock, 10);
    if (!Number.isFinite(price) || price <= 0) return void toast.error('Ingresa un precio válido');
    if (!Number.isInteger(stock) || stock < 0) return void toast.error('Ingresa un stock válido');
    if (!formData.name.trim() || !formData.category_id) return void toast.error('Completa todos los campos requeridos');

    const productData = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      price,
      image_url: formData.image_url.trim() || FALLBACK_IMAGE,
      category_id: formData.category_id,
      stock,
      available: formData.available,
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('Producto actualizado exitosamente');
      } else {
        await addProduct(productData);
        toast.success('Producto agregado exitosamente');
      }
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto');
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar "${productName}"?`)) return;
    try {
      await deleteProduct(productId);
      toast.success('Producto eliminado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el producto');
    }
  };

  const getCategoryName = (categoryId: string | null | undefined) => safeCategories.find((c) => c.id === categoryId)?.name || 'Sin categoría';

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div><h1 className="mb-2 text-4xl font-bold text-blue-900">Edición de Menú</h1><p className="text-lg text-gray-600">Agrega, edita o elimina productos del menú</p></div>
        <Button onClick={openNewProductDialog} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700"><Plus className="mr-2 h-5 w-5" />Agregar Producto</Button>
      </div>

      {safeProducts.length === 0 ? (
        <Card className="border border-slate-200 bg-white p-8 text-center"><p className="font-bold text-slate-800">No hay productos para mostrar</p><p className="mt-1 text-sm text-slate-500">Comprueba la conexión con Supabase o agrega el primer producto.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {safeProducts.map((product) => {
            const image = product.image_url?.trim() || FALLBACK_IMAGE;
            const price = Number(product.price ?? 0);
            const stock = Number(product.stock ?? 0);
            return (
              <Card key={product.id} className="overflow-hidden border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
                <div className="aspect-square overflow-hidden bg-gray-100">
                  <img src={image} alt={product.name || 'Producto'} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
                </div>
                <div className="p-4">
                  <div className="mb-3"><h3 className="mb-1 text-lg font-bold text-blue-900">{product.name || 'Producto sin nombre'}</h3><p className="line-clamp-2 min-h-[40px] text-sm text-gray-600">{product.description || 'Sin descripción'}</p></div>
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Precio:</span><span className="text-xl font-bold text-green-700">${price.toLocaleString('es-CO')}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Stock:</span><span className={`font-bold ${stock === 0 ? 'text-red-600' : stock <= 5 ? 'text-amber-600' : 'text-green-700'}`}>{stock}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Categoría:</span><span className="text-sm font-medium text-blue-900">{getCategoryName(product.category_id)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Estado:</span><span className={`text-sm font-medium ${product.available ? 'text-green-700' : 'text-gray-500'}`}>{product.available ? 'Visible' : 'Oculto'}</span></div>
                  </div>
                  <div className="flex gap-2"><Button onClick={() => openEditProductDialog(product)} size="sm" className="flex-1 bg-blue-600 text-white hover:bg-blue-700"><Edit className="mr-2 h-4 w-4" />Editar</Button><Button onClick={() => handleDelete(product.id, product.name || 'producto')} size="sm" variant="destructive" className="flex-1"><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">{editingProduct ? 'Editar Producto' : 'Agregar Producto'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label htmlFor="name">Nombre del Producto *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Hamburguesa Clásica" required /></div>
              <div className="col-span-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descripción del producto" rows={3} /></div>
              <div><Label htmlFor="price">Precio *</Label><Input id="price" type="number" min="0" step="100" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="Ej: 10000" required /></div>
              <div><Label htmlFor="stock">Stock *</Label><Input id="stock" type="number" min="0" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="Ej: 20" required /></div>
              <div className="col-span-2"><Label htmlFor="category">Categoría *</Label><Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}><SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger><SelectContent>{safeCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2"><Label htmlFor="image_url">URL de Imagen</Label><Input id="image_url" type="url" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://example.com/image.jpg" /><p className="mt-1 text-xs text-gray-500">Deja en blanco para usar imagen por defecto</p></div>
              <div className="col-span-2"><div className="flex items-center gap-2"><input type="checkbox" id="available" checked={formData.available} onChange={(e) => setFormData({ ...formData, available: e.target.checked })} className="h-4 w-4" /><Label htmlFor="available" className="cursor-pointer">Producto visible en el menú</Label></div></div>
            </div>
            <div className="flex gap-3 pt-4"><Button type="submit" className="flex-1 bg-green-600 text-white hover:bg-green-700">{editingProduct ? 'Guardar Cambios' : 'Agregar Producto'}</Button><Button type="button" onClick={() => setIsDialogOpen(false)} variant="outline" className="flex-1">Cancelar</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
