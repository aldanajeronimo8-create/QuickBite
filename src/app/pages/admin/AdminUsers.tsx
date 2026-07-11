import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Edit2, Lock, Plus, Trash2, UserCog, X } from 'lucide-react';
import { useDataStore } from '../../../store/dataStore';
import type { Profile } from '../../../lib/supabase';
import { listProtectedAdminEmails } from '../../../repositories/quickbiteRepository';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

type UserForm = {
  id?: string;
  email: string;
  password: string;
  full_name: string;
  role: Profile['role'];
  ti: string;
};

const emptyForm: UserForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'student',
  ti: '',
};

export function AdminUsers() {
  const { users, addUser, updateUser, deleteUser } = useDataStore();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [protectedEmails, setProtectedEmails] = useState<Set<string>>(new Set());
  const [loadingProtected, setLoadingProtected] = useState(true);

  useEffect(() => {
    let active = true;
    void listProtectedAdminEmails()
      .then((emails) => {
        if (active) setProtectedEmails(emails);
      })
      .catch(() => {
        if (active) toast.error('No pudimos verificar las cuentas protegidas.');
      })
      .finally(() => {
        if (active) setLoadingProtected(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      `${user.full_name} ${user.email} ${user.role} ${user.ti ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, users]);

  const beginCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const beginEdit = (user: Profile) => {
    if (protectedEmails.has(user.email.toLowerCase())) return;
    setForm({
      id: user.id,
      email: user.email,
      password: '',
      full_name: user.full_name,
      role: user.role,
      ti: user.ti ?? '',
    });
    setOpen(true);
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    if (!form.id && form.password.length < 6) {
      toast.error('La contrasena temporal debe tener al menos 6 caracteres');
      return;
    }
    if (form.id && form.password.trim() && form.password.length < 6) {
      toast.error('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await updateUser({
          id: form.id,
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role: form.role,
          ti: form.role === 'admin' ? '' : form.ti.trim(),
          password: form.password.trim() || undefined,
        });
        toast.success('Usuario actualizado en Supabase');
      } else {
        await addUser({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          ti: form.role === 'admin' ? '' : form.ti.trim(),
        });
        toast.success('Usuario creado en Supabase');
      }
      setOpen(false);
      setForm(emptyForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user: Profile) => {
    if (protectedEmails.has(user.email.toLowerCase())) return;
    if (!window.confirm(`Eliminar definitivamente a ${user.email}?`)) return;
    try {
      await deleteUser(user.id);
      toast.success('Usuario eliminado en Supabase');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el usuario');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <UserCog className="h-8 w-8 text-blue-600" />
            Usuarios
          </h1>
          <p className="mt-1 text-gray-500">
            Gestiona administradores y estudiantes directamente en Supabase Auth y profiles.
          </p>
        </div>
        <Button onClick={beginCreate} className="bg-blue-700 text-white hover:bg-blue-800">
          <Plus className="mr-2 h-4 w-4" />
          Crear usuario
        </Button>
      </div>

      <Card className="mb-5 border-0 bg-white p-4 shadow-sm">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, correo, rol o TI"
        />
      </Card>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">TI</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => {
              const isProtected = loadingProtected || protectedEmails.has(user.email.toLowerCase());
              return (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-900">{user.full_name}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{user.ti || '-'}</td>
                <td className="px-4 py-3">
                  {isProtected ? (
                    <div className="flex justify-end items-center gap-2 text-xs font-semibold text-amber-700">
                      <Lock className="h-4 w-4" />
                      Cuenta protegida
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => beginEdit(user)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeUser(user)}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="w-full max-w-lg border-0 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {form.id ? 'Editar usuario' : 'Crear usuario'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>{form.id ? 'Nueva contrasena opcional' : 'Contrasena temporal'}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={
                    form.id ? 'Dejar vacio para conservar la actual' : 'Minimo 6 caracteres'
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Rol</Label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Profile['role'] })}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="student">Estudiante</option>
                    <option value="admin">Admin</option>
                    <option value="both">Ambos</option>
                  </select>
                </div>
                <div>
                  <Label>TI</Label>
                  <Input
                    value={form.ti}
                    onChange={(e) => setForm({ ...form, ti: e.target.value })}
                    disabled={form.role === 'admin'}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-700 text-white hover:bg-blue-800"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
