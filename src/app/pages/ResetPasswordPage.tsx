import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Lock, Eye, EyeOff, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [administratorRecoveryBlocked, setAdministratorRecoveryBlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setExpired(true);
      return undefined;
    }
    const client = supabase;

    const verifyRecoveryAccount = async (userId: string) => {
      const { data: profile, error } = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setPasswordError(error.message);
        setExpired(true);
        return;
      }
      // Administrative accounts (admin/both) may never use email recovery.
      // Only student/parent accounts can complete this self-service flow.
      if (!profile || !['student', 'parent'].includes(profile.role)) {
        await client.auth.signOut();
        setAdministratorRecoveryBlocked(true);
        return;
      }

      readyRef.current = true;
      setReady(true);
    };

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        void verifyRecoveryAccount(session.user.id);
      }
    });

    void client.auth.getSession().then(({ data }) => {
      const url = new URL(window.location.href);
      const hasRecoveryMarker = url.hash.includes('type=recovery') || url.searchParams.has('code');
      if (data.session?.user && hasRecoveryMarker) {
        void verifyRecoveryAccount(data.session.user.id);
      }
    }).catch(() => undefined);

    const timer = window.setTimeout(() => {
      if (!readyRef.current) setExpired(true);
    }, 10000);

    return () => {
      authListener.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    if (password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const client = supabase;
      if (!client || !ready) throw new Error('El enlace de recuperación no está activo. Solicita uno nuevo.');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      await client.auth.signOut();
      toast.success('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qb-auth qb-auth--admin min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md relative z-10">
        <div className="qb-auth-brand text-center mb-8">
          <QuickBiteLogo className="mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-4xl font-bold text-white mb-2">QuickBite</h1>
          <p className="text-blue-200">Cambiar contraseña</p>
        </div>

        <div className="qb-auth-card bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          {!ready && !expired && !administratorRecoveryBlocked && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
              <p className="text-white/70 text-sm">Verificando enlace de recuperación…</p>
            </div>
          )}

          {administratorRecoveryBlocked && (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Cambio administrado</h2>
              <p className="text-blue-200 text-sm mb-6">Las cuentas administrativas no pueden restablecer ni cambiar su contraseña mediante recuperación por correo. Otro administrador autorizado debe cambiarla desde el panel de Usuarios.</p>
              <Button onClick={() => navigate('/')} className="w-full rounded-xl bg-blue-600 py-6 font-medium text-white hover:bg-blue-700">Volver al inicio</Button>
            </div>
          )}

          {expired && !administratorRecoveryBlocked && (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Enlace inválido o expirado</h2>
              <p className="text-blue-200 text-sm mb-6">El enlace de recuperación no pudo validarse. Solicita uno nuevo desde “Olvidé mi contraseña”.</p>
              <Button onClick={() => navigate('/forgot-password')} className="w-full rounded-xl bg-blue-600 py-6 font-medium text-white hover:bg-blue-700">Solicitar nuevo enlace</Button>
            </div>
          )}

          {ready && !administratorRecoveryBlocked && !expired && (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Nueva contraseña</h2>
                <p className="text-blue-200 text-sm mb-6">Elige una contraseña segura para tu cuenta.</p>
              </div>

              <div>
                <Label htmlFor="rp-new" className="text-white/90 mb-2 block">Nueva contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                  <Input id="rp-new" type={showPwd ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(''); }} className="pl-11 pr-11 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-blue-400" autoFocus autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPwd((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-200" aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
              </div>

              <div>
                <Label htmlFor="rp-confirm" className="text-white/90 mb-2 block">Confirmar contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                  <Input id="rp-confirm" type={showConfirm ? 'text' : 'password'} placeholder="Repite tu contraseña" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(''); }} className="pl-11 pr-11 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-blue-400" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-200" aria-label={showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}>{showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 w-5" />}</button>
                </div>
                {password && confirmPassword && password === confirmPassword && <p className="text-green-300 text-sm mt-1 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Las contraseñas coinciden</p>}
                {passwordError && <p className="text-red-300 text-sm mt-1">{passwordError}</p>}
              </div>

              <Button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 py-6 font-medium text-white shadow-lg shadow-blue-950/20 transition-all duration-300 hover:bg-blue-700">
                {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Actualizando…</> : 'Guardar nueva contraseña'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-white/50 text-sm mt-6">© 2025 QuickBite · Colegio Bilingüe Maximino Poitiers</p>
      </div>
    </div>
  );
}
