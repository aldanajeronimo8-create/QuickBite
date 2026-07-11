import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Coffee, Lock, Eye, EyeOff, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
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
      return;
    }

    // Supabase fires PASSWORD_RECOVERY when the user arrives via the reset email link.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        readyRef.current = true;
        setReady(true);
      }
    });

    // Give Supabase up to 6 seconds to detect the token in the URL hash.
    const timer = setTimeout(() => {
      if (!readyRef.current) setExpired(true);
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) {
        toast.error('No se pudo actualizar la contraseña: ' + error.message);
        return;
      }
      await supabase!.auth.signOut();
      toast.success('¡Contraseña actualizada! Inicia sesión con tu nueva contraseña.');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-400 to-blue-500 rounded-2xl mb-4 shadow-lg shadow-green-500/50">
            <Coffee className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">QuickBite</h1>
          <p className="text-blue-200">Cambiar contraseña</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Waiting for recovery token */}
          {!ready && !expired && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
              <p className="text-white/70 text-sm">Verificando enlace de recuperación…</p>
            </div>
          )}

          {/* Link expired or invalid */}
          {expired && (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Enlace inválido o expirado</h2>
              <p className="text-blue-200 text-sm mb-6">
                El enlace de recuperación ya no es válido. Solicita uno nuevo desde la página de
                inicio.
              </p>
              <Button
                onClick={() => navigate('/forgot-password')}
                className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white font-medium py-6 rounded-xl"
              >
                Solicitar nuevo enlace
              </Button>
            </div>
          )}

          {/* Ready — show password form */}
          {ready && (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Nueva contraseña</h2>
                <p className="text-blue-200 text-sm mb-6">
                  Elige una contraseña segura para tu cuenta.
                </p>
              </div>

              <div>
                <Label htmlFor="rp-new" className="text-white/90 mb-2 block">
                  Nueva contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                  <Input
                    id="rp-new"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    className={`pl-11 pr-11 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-blue-400 ${passwordError ? 'border-red-400' : ''}`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-200 transition"
                  >
                    {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="rp-confirm" className="text-white/90 mb-2 block">
                  Confirmar contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                  <Input
                    id="rp-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordError('');
                    }}
                    className={`pl-11 pr-11 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-blue-400 ${passwordError ? 'border-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-200 transition"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {password && confirmPassword && password === confirmPassword && (
                  <p className="text-green-300 text-sm mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Las contraseñas coinciden
                  </p>
                )}
                {passwordError && <p className="text-red-300 text-sm mt-1">{passwordError}</p>}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white font-medium py-6 rounded-xl shadow-lg shadow-green-500/30 transition-all duration-300"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Actualizando…
                  </>
                ) : (
                  'Guardar nueva contraseña'
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-white/50 text-sm mt-6">
          © 2025 QuickBite · Colegio Bilingüe Maximino Poitiers
        </p>
      </div>
    </div>
  );
}
