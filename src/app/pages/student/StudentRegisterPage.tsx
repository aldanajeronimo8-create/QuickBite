import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Coffee, User, ArrowLeft, Mail, Lock, Eye, EyeOff, CreditCard } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  ti: string;
  created_at: string;
}

export function StudentRegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    ti: '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[field];
      return n;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (!form.name.trim() || form.name.trim().length < 3) errs.name = 'Mínimo 3 caracteres';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Correo electrónico inválido';
    if (!form.password || form.password.length < 6) errs.password = 'Mínimo 6 caracteres';
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Las contraseñas no coinciden';
    if (!form.ti.trim()) errs.ti = 'Ingresa tu T.I.';
    else if (!/^\d+$/.test(form.ti.trim())) errs.ti = 'Solo se permiten números';
    else if (form.ti.trim().length > 11) errs.ti = 'Máximo 11 dígitos';

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const student: StudentProfile = {
      id: `student-${Date.now()}`,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      ti: form.ti.trim(),
      created_at: new Date().toISOString(),
    };

    {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: student.email,
        password: form.password,
        options: { data: { full_name: student.name, role: 'student' } },
      });

      if (error) {
        const msg = error.message ?? '';
        if (/already registered|already exists/i.test(msg)) {
          // Email already has an account — try signing in and adding a student profile on top
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: student.email,
            password: form.password,
          });
          if (loginError || !loginData.user) {
            setErrors({
              email:
                'Este correo ya tiene una cuenta. Usa la misma contraseña de esa cuenta para añadir el perfil de estudiante.',
            });
            return;
          }
          const { error: rpcErr } = await supabase.rpc('create_student_profile', {
            p_user_id: loginData.user.id,
            p_email: student.email,
            p_full_name: student.name,
            p_ti: student.ti,
          });
          if (rpcErr) {
            await supabase.auth.signOut();
            if (
              /already|duplicate/i.test(rpcErr.message) &&
              /student|profile/i.test(rpcErr.message)
            ) {
              setErrors({ email: 'Ya tienes una cuenta de estudiante con ese correo.' });
            } else if (/unique|duplicate/i.test(rpcErr.message) && /ti/i.test(rpcErr.message)) {
              setErrors({ ti: 'Esta T.I. ya está registrada.' });
            } else {
              toast.error(
                /could not find the function/i.test(rpcErr.message)
                  ? 'La base de datos aún no tiene las funciones necesarias. Aplica las migraciones SQL (ver APPLY_MIGRATIONS.sql).'
                  : 'Error al crear el perfil: ' + rpcErr.message,
              );
            }
            return;
          }
          toast.success(`¡Bienvenido, ${student.name}!`);
          navigate('/menu');
          return;
        } else {
          toast.error(msg || 'No fue posible crear la cuenta.');
        }
        return;
      }

      if (!data.user) {
        toast.error('No fue posible crear la cuenta.');
        return;
      }

      // Use SECURITY DEFINER RPC — works even without a session (email confirmation pending)
      const { error: rpcError } = await supabase.rpc('create_student_profile', {
        p_user_id: data.user.id,
        p_email: student.email,
        p_full_name: student.name,
        p_ti: student.ti,
      });

      if (rpcError) {
        if (/unique|duplicate/i.test(rpcError.message) && /ti|identity/i.test(rpcError.message)) {
          setErrors({ ti: 'Esta T.I. ya está registrada.' });
        } else if (/unique|duplicate/i.test(rpcError.message)) {
          setErrors({ email: 'Ya existe una cuenta con ese correo.' });
        } else {
          toast.error(
            /could not find the function/i.test(rpcError.message)
              ? 'La base de datos aún no tiene las funciones necesarias. Aplica las migraciones SQL (ver APPLY_MIGRATIONS.sql).'
              : 'Error al crear el perfil: ' + rpcError.message,
          );
        }
        return;
      }

      // If no session yet (email confirmation required), ask user to confirm
      if (!data.session) {
        toast.success('Cuenta creada. Revisa tu correo y confirma antes de iniciar sesión.', {
          duration: 8000,
        });
        navigate('/');
        return;
      }

      toast.success(`¡Bienvenido, ${student.name}!`);
      navigate('/menu');
      return;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 via-orange-400 to-amber-300 flex flex-col items-center justify-center p-5">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-yellow-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-red-400/20 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-3 shadow-xl p-3 bg-white">
            <Coffee className="w-9 h-9 text-orange-500" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">QuickBite</h1>
          <p className="text-orange-100 text-sm mt-1">Crear cuenta de estudiante</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-7 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-0.5">Regístrate</h2>
            <p className="text-gray-400 text-sm">Completa tus datos para crear tu cuenta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Nombre */}
            <div>
              <Label className="text-gray-700 text-sm mb-1 block">Nombre completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Tu nombre completo"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={`pl-9 ${errors.name ? 'border-red-400' : ''}`}
                  autoFocus
                />
              </div>
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Correo */}
            <div>
              <Label className="text-gray-700 text-sm mb-1 block">Correo electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={`pl-9 ${errors.email ? 'border-red-400' : ''}`}
                />
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Contraseña */}
            <div>
              <Label className="text-gray-700 text-sm mb-1 block">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className={`pl-9 pr-10 ${errors.password ? 'border-red-400' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <Label className="text-gray-700 text-sm mb-1 block">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repite tu contraseña"
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  className={`pl-9 pr-10 ${errors.confirmPassword ? 'border-red-400' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Tarjeta de identidad */}
            <div>
              <Label className="text-gray-700 text-sm mb-1 block">
                T.I. <span className="text-gray-400 font-normal">(Tarjeta de identidad)</span>
              </Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Hasta 11 dígitos"
                  inputMode="numeric"
                  value={form.ti}
                  onChange={(e) => set('ti', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className={`pl-9 ${errors.ti ? 'border-red-400' : ''}`}
                />
              </div>
              {errors.ti ? (
                <p className="text-red-500 text-xs mt-1">{errors.ti}</p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">
                  Solo números · máximo 11 dígitos · única por estudiante
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-6 rounded-xl !mt-5 shadow-lg shadow-orange-200"
            >
              Crear cuenta →
            </Button>
          </form>

          <div className="border-t border-gray-100 pt-3">
            <Link to="/">
              <Button
                variant="outline"
                className="w-full border-orange-200 text-orange-500 hover:bg-orange-50 py-5 rounded-xl text-sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al inicio
              </Button>
            </Link>
          </div>
        </div>

        <p className="text-center text-white/50 text-xs mt-5">
          © 2025 QuickBite · Colegio Bilingüe Maximino Poitiers
        </p>
      </div>
    </div>
  );
}
