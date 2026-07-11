import { Link } from 'react-router-dom';
import { Banknote, ShoppingBag, Users } from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

export function AdminStudents() {
  const { users, orders } = useDataStore();
  const students = users.filter((user) => user.role === 'student');

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-4xl font-bold text-blue-900">
          <Users className="h-9 w-9" />
          Estudiantes
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          Consulta los estudiantes y sus compras desde el panel de administración.
        </p>
      </div>

      {students.length === 0 ? (
        <Card className="border-0 bg-white p-12 text-center shadow-lg">
          <Users className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <p className="text-lg text-gray-500">No hay estudiantes registrados.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {students.map((student) => {
            const studentOrders = orders.filter((order) => order.user_id === student.id);
            const pendingCash = studentOrders.filter(
              (order) => order.payment_method === 'cash' && order.payment_status === 'pending',
            );
            const confirmedTotal = studentOrders
              .filter((order) => order.payment_status === 'confirmed')
              .reduce((sum, order) => sum + order.total, 0);

            return (
              <Card key={student.id} className="border-0 bg-white p-5 shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{student.full_name}</h2>
                    <p className="text-sm text-gray-600">{student.email}</p>
                    {student.ti && <p className="mt-1 text-sm text-gray-500">TI: {student.ti}</p>}
                  </div>
                  {pendingCash.length > 0 && (
                    <Badge className="bg-amber-500 text-white">
                      {pendingCash.length} efectivo pendiente
                    </Badge>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div className="rounded-xl bg-blue-50 p-3">
                    <ShoppingBag className="mb-1 h-4 w-4 text-blue-700" />
                    <p className="font-bold text-blue-950">{studentOrders.length}</p>
                    <p className="text-blue-800">Pedidos</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <Banknote className="mb-1 h-4 w-4 text-emerald-700" />
                    <p className="font-bold text-emerald-950">${confirmedTotal.toLocaleString()}</p>
                    <p className="text-emerald-800">Pagado</p>
                  </div>
                </div>
                {pendingCash.length > 0 && (
                  <Link to="/admin/payments" className="mt-4 block">
                    <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                      Confirmar efectivo
                    </Button>
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
