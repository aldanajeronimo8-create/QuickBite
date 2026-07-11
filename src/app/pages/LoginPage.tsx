import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coffee, Eye, EyeOff, GraduationCap, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

type Mode = 'student' | 'admin';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, checkSession } = useAuthStore();
  const [mode, setMode] = useState<Mode>('student');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showStudentPwd, setShowStudentPwd] = useState(false);
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleStudentLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentEmail || !studentPassword) {
      setErrors({ studentPassword: 'Ingresa correo y contraseña.' });
      return;
    }

    setLoading(true);
    try {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: studentEmail.trim().toLowerCase(),
        password: studentPassword,
      });
      if (error || !data.user) throw new Error('Correo o contraseña incorrectos.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile || !['student', 'both'].includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('No tienes permisos de estudiante.');
      }

      await checkSession();
      navigate('/menu');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      setErrors({ studentPassword: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminEmail || !adminPassword) {
      setErrors({ adminPassword: 'Ingresa correo y contraseña.' });
      return;
    }

    setLoading(true);
    try {
      await signIn(adminEmail, adminPassword);
      toast.success('Bienvenido.');
      navigate('/admin');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      setErrors({ adminPassword: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const isStudent = mode === 'student';

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-5 transition-all duration-500 ${
        isStudent
          ? 'bg-gradient-to-br from-orange-500 via-orange-400 to-amber-300'
          : 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800'
      }`}
    >
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-7">
          <div
            className={`inline-flex items-center justify-center w-18 h-18 rounded-3xl mb-3 shadow-xl p-4 ${isStudent ? 'bg-white' : 'bg-white/10 border border-white/20'}`}
          >
            <Coffee className={`w-9 h-9 ${isStudent ? 'text-orange-500' : 'text-white'}`} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">QuickBite</h1>
          <p className={`text-sm mt-1 ${isStudent ? 'text-orange-100' : 'text-blue-300'}`}>
            Supabase conectado
          </p>
        </div>

        <div className={`flex rounded-2xl p-1 mb-5 ${isStudent ? 'bg-white/25' : 'bg-white/10'}`}>
          <button
            type="button"
            onClick={() => {
              setMode('student');
              setErrors({});
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
              isStudent ? 'bg-white text-orange-500 shadow-md' : 'text-white/60 hover:text-white/90'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Estudiante
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('admin');
              setErrors({});
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
              !isStudent
                ? 'bg-white/20 text-white shadow-md border border-white/30'
                : 'text-white/60 hover:text-white/90'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Administrador
          </button>
        </div>

        <div
          className={`rounded-3xl shadow-2xl p-7 ${isStudent ? 'bg-white' : 'bg-white/10 backdrop-blur-xl border border-white/20'}`}
        >
          {isStudent ? (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">Hola, estudiante</h2>
                <p className="text-gray-400 text-sm mb-5">
                  Inicia sesión para ver el menú en tiempo real.
                </p>
                <Label htmlFor="student-email" className="text-gray-700 text-sm mb-1 block">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="student-email"
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="student-password" className="text-gray-700 text-sm">
                    Contraseña
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-orange-500 underline underline-offset-2"
                  >
                    Recuperar
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="student-password"
                    type={showStudentPwd ? 'text' : 'password'}
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStudentPwd(!showStudentPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showStudentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.studentPassword && (
                  <p className="text-red-500 text-xs mt-1">{errors.studentPassword}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-6 rounded-xl"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Ver menú'
                )}
              </Button>
              <Link to="/register-student">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-orange-200 text-orange-500 hover:bg-orange-50 py-5 rounded-xl text-sm"
                >
                  Crear cuenta de estudiante
                </Button>
              </Link>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Panel de control</h2>
                <p className="text-blue-300 text-sm mb-5">Acceso solo para administradores.</p>
                <Label htmlFor="admin-email" className="text-white/80 text-sm mb-1 block">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                  <Input
                    id="admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="pl-9 bg-white/5 border-white/20 text-white"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="admin-password" className="text-white/80 text-sm">
                    Contraseña
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-blue-400 underline underline-offset-2"
                  >
                    Recuperar
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                  <Input
                    id="admin-password"
                    type={showAdminPwd ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="pl-9 pr-10 bg-white/5 border-white/20 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPwd(!showAdminPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300"
                  >
                    {showAdminPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.adminPassword && (
                  <p className="text-red-300 text-xs mt-1">{errors.adminPassword}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-6 rounded-xl"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Iniciar sesión'
                )}
              </Button>
              <Link to="/register">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/20 text-white/70 hover:bg-white/10 hover:text-white py-5 rounded-xl text-sm"
                >
                  Crear cuenta de administrador
                </Button>
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
