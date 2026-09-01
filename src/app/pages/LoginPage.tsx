import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, GraduationCap, Loader2, Lock, Mail, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { canAccessParent, canAccessStudent, canAccessAdmin } from '../../lib/access';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';
import { bindStudentUser, clearBoundStudentUser, getBoundStudentUserId } from '../../lib/studentDeviceSession';

type Mode = 'student' | 'parent' | 'admin';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuthStore();
  const [mode, setMode] = useState<Mode>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email || !password) { setError('Ingresa correo y contraseña.'); return; }
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signInError } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInError || !data.user) throw new Error('Correo o contraseña incorrectos.');

      const { data: profile, error: profileError } = await client.from('profiles').select('id,role').eq('id', data.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) { await client.auth.signOut(); throw new Error('Tu cuenta no tiene un perfil de QuickBite.'); }

      // El rol real de Supabase es la fuente de verdad. Admin mantiene su flujo propio.
      if (profile.role === 'parent') {
        if (!canAccessParent(profile.role)) throw new Error('Esta cuenta no tiene acceso de Padre de Familia.');
        // Aunque la pestaña seleccionada sea Estudiante, una cuenta padre entra a Family.
        if (mode === 'parent' || mode === 'student') {
          navigate('/parent/family');
          toast.success('Bienvenido a QuickBite Family.');
          return;
        }
      }

      if (profile.role === 'both' && mode === 'parent') {
        if (!canAccessParent(profile.role)) throw new Error('Esta cuenta no tiene acceso de Padre de Familia.');
        navigate('/parent/family');
        toast.success('Bienvenido a QuickBite Family.');
        return;
      }

      if (mode === 'student') {
        const boundUserId = getBoundStudentUserId();
        if (boundUserId && boundUserId !== data.user.id) {
          await client.auth.signOut();
          throw new Error('Este dispositivo ya está asociado a otra cuenta de estudiante. Usa “Cambiar estudiante en este dispositivo”.');
        }
        if (!canAccessStudent(profile.role)) { await client.auth.signOut(); throw new Error('Esta cuenta no tiene acceso de estudiante.'); }
        bindStudentUser(data.user.id);
        navigate('/menu');
      } else if (mode === 'parent') {
        if (!canAccessParent(profile.role)) { await client.auth.signOut(); throw new Error('Esta cuenta no tiene acceso de Padre de Familia.'); }
        navigate('/parent/family');
      } else {
        if (!canAccessAdmin(profile.role)) { await client.auth.signOut(); throw new Error('Esta cuenta no tiene acceso administrativo.'); }
        await signIn(normalizedEmail, password);
        navigate('/admin');
      }
      toast.success('Bienvenido.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      setError(message); toast.error(message);
    } finally { setLoading(false); }
  };

  const changeStudentOnDevice = async () => {
    const supabase = requireSupabaseClient(); await supabase.auth.signOut(); clearBoundStudentUser(); setEmail(''); setPassword(''); setError(''); toast.success('Este dispositivo ya puede vincularse a otro estudiante.');
  };
  const isStudent = mode === 'student';
  const isParent = mode === 'parent';
  const studentIsBound = Boolean(getBoundStudentUserId());

  return <div className={`qb-auth qb-auth--${isStudent ? 'student' : 'admin'} min-h-screen flex flex-col items-center justify-center p-5 transition-all duration-500`}>
    <div className="w-full max-w-sm relative z-10">
      <div className="qb-auth-brand text-center mb-7"><QuickBiteLogo className="mb-3 h-[4.5rem] w-[4.5rem] rounded-3xl"/><h1 className="text-3xl font-bold text-white tracking-tight">QuickBite</h1><p className={`text-sm mt-1 ${isStudent ? 'text-green-100' : 'text-blue-300'}`}>Supabase conectado</p></div>
      <div className={`qb-auth-switch flex rounded-2xl p-1 mb-5 ${isStudent ? 'bg-white/25' : 'bg-white/10'}`}>
        <button type="button" onClick={() => { setMode('student'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${isStudent ? 'bg-white text-green-700 shadow-md' : 'text-white/60 hover:text-white/90'}`}><GraduationCap className="w-4 h-4"/>Estudiante</button>
        <button type="button" onClick={() => { setMode('parent'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${isParent ? 'bg-white/20 text-white shadow-md border border-white/30' : 'text-white/60 hover:text-white/90'}`}><Users className="w-4 h-4"/>Padre de Familia</button>
        <button type="button" onClick={() => { setMode('admin'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${mode === 'admin' ? 'bg-white/20 text-white shadow-md border border-white/30' : 'text-white/60 hover:text-white/90'}`}><ShieldCheck className="w-4 h-4"/>Administrador</button>
      </div>
      <div className={`qb-auth-card rounded-3xl shadow-2xl p-7 ${isStudent ? 'bg-white' : 'bg-white/10 backdrop-blur-xl border border-white/20'}`}>
        <form onSubmit={handleLogin} autoComplete="on" className="space-y-4">
          <div><h2 className={`text-xl font-bold mb-1 ${isStudent ? 'text-gray-800' : 'text-white'}`}>{isStudent ? 'Hola, estudiante' : isParent ? 'Hola, familia' : 'Panel de control'}</h2><p className={`text-sm mb-5 ${isStudent ? 'text-gray-400' : 'text-blue-300'}`}>{isStudent ? 'Inicia sesión para ver el menú en tiempo real.' : isParent ? 'Inicia sesión para gestionar los estudiantes vinculados.' : 'Acceso solo para administradores.'}</p><Label htmlFor="login-email" className={`text-sm mb-1 block ${isStudent ? 'text-gray-700' : 'text-white/80'}`}>Correo electrónico</Label><div className="relative"><Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isStudent ? 'text-gray-400' : 'text-blue-300'}`}/><Input name="email" autoComplete="username" id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`pl-9 ${isStudent ? '' : 'bg-white/5 border-white/20 text-white'}`}/></div></div>
          <div><div className="flex items-center justify-between mb-1"><Label htmlFor="login-password" className={`text-sm ${isStudent ? 'text-gray-700' : 'text-white/80'}`}>Contraseña</Label><Link to="/forgot-password" className={`text-xs underline underline-offset-2 ${isStudent ? 'text-green-700' : 'text-blue-200'}`}>Recuperar</Link></div><div className="relative"><Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isStudent ? 'text-gray-400' : 'text-blue-300'}`}/><Input name="current-password" autoComplete="current-password" id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`pl-9 pr-10 ${isStudent ? '' : 'bg-white/5 border-white/20 text-white'}`}/><button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 ${isStudent ? 'text-gray-400' : 'text-blue-300'}`}>{showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button></div>{error && <p className={`text-xs mt-1 ${isStudent ? 'text-red-500' : 'text-red-300'}`}>{error}</p>}</div>
          <Button type="submit" disabled={loading} className={`w-full font-semibold py-6 rounded-xl text-white ${isStudent ? 'bg-green-600 hover:bg-green-700' : isParent ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gradient-to-r from-blue-500 to-blue-700'}`}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Entrando...</> : 'Iniciar sesión'}</Button>
          {isStudent && studentIsBound && <Button type="button" variant="ghost" onClick={() => void changeStudentOnDevice()} disabled={loading} className="w-full text-xs text-slate-500 hover:bg-slate-50 hover:text-green-700">Cambiar estudiante en este dispositivo</Button>}
          {isStudent && <Link to="/register-student"><Button type="button" variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-50 py-5 rounded-xl text-sm">Crear cuenta de estudiante</Button></Link>}
          {isParent && <Link to="/register-parent"><Button type="button" variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 py-5 rounded-xl text-sm">Crear cuenta de Padre de Familia</Button></Link>}
        </form>
      </div>
    </div>
  </div>;
}
