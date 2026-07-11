import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Coffee, Loader2, Mail } from 'lucide-react';
import { appConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

type Step = 'email' | 'sent' | 'code' | 'reset';

function getPasswordRecoveryMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/email_not_found/i.test(message)) return 'No existe una cuenta con ese correo.';
  if (/invalid_reset_code/i.test(message)) return 'Codigo incorrecto.';
  if (/password_too_short/i.test(message)) return 'La contrasena debe tener al menos 6 caracteres.';
  if (/function.*does not exist|could not find the function|schema cache/i.test(message)) {
    return 'Falta aplicar la migracion de recuperacion de contrasena en Supabase.';
  }
  return message || 'No se pudo completar la recuperacion';
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const emailMode = appConfig.passwordResetMode === 'email';
  const totalSteps = emailMode ? 2 : 3;
  const stepNum = emailMode
    ? step === 'email'
      ? 1
      : 2
    : step === 'email'
      ? 1
      : step === 'code'
        ? 2
        : 3;

  const handleFindAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Ingresa un correo electronico valido');
      return;
    }

    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const { data: exists, error: existsError } = await client.rpc('email_exists', {
        p_email: normalizedEmail,
      });
      if (existsError) throw existsError;
      if (!exists) {
        setError('No existe una cuenta con ese correo.');
        return;
      }

      if (emailMode) {
        const resetUrl = `${window.location.origin}/reset-password`;
        const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: resetUrl,
        });
        if (resetError) throw resetError;
        setStep('sent');
      } else {
        setStep('code');
      }
    } catch (err) {
      toast.error(getPasswordRecoveryMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) {
      setError('Ingresa el codigo de recuperacion');
      return;
    }
    setStep('reset');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const { error: resetError } = await client.rpc('reset_user_password', {
        p_email: email.trim().toLowerCase(),
        p_reset_code: code.trim(),
        p_new_password: password,
      });

      if (resetError) {
        if (/invalid_reset_code/i.test(resetError.message)) {
          setStep('code');
          setError('Codigo incorrecto');
          return;
        }
        setError(getPasswordRecoveryMessage(resetError));
        return;
      }

      await client.auth.signOut();
      toast.success('Contrasena actualizada en Supabase. Inicia sesion.');
      navigate('/');
    } catch (err) {
      toast.error(getPasswordRecoveryMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-blue-500 shadow-lg shadow-green-500/50">
            <Coffee className="h-8 w-8 text-white" />
          </div>
          <h1 className="mb-2 text-4xl font-bold text-white">QuickBite</h1>
          <p className="text-blue-200">Recuperar contrasena</p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex items-center gap-2">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n, i) => (
              <div key={n} className="contents">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${stepNum >= n ? 'bg-blue-500 text-white' : 'bg-white/20 text-white/50'}`}
                >
                  {stepNum > n ? <CheckCircle2 className="h-5 w-5" /> : n}
                </div>
                {i < totalSteps - 1 && (
                  <div className={`h-0.5 flex-1 ${stepNum > n ? 'bg-green-500' : 'bg-white/20'}`} />
                )}
              </div>
            ))}
          </div>

          {step === 'email' && (
            <form onSubmit={handleFindAccount} className="space-y-5">
              <div>
                <h2 className="mb-1 text-2xl font-bold text-white">Ingresa tu correo</h2>
                <p className="mb-6 text-sm text-blue-200">
                  {emailMode
                    ? 'Te enviaremos un enlace seguro.'
                    : 'Validaremos tu cuenta y luego podras ingresar el codigo de recuperacion.'}
                </p>
                <Label htmlFor="fp-email" className="mb-2 block text-white/90">
                  Correo electronico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-300" />
                  <Input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    className="border-white/20 bg-white/5 pl-11 text-white placeholder:text-white/40 focus:border-blue-400"
                    placeholder="tu@correo.com"
                    autoFocus
                  />
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700"
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}Continuar
              </Button>
            </form>
          )}

          {step === 'sent' && (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-green-400" />
              <h2 className="text-2xl font-bold text-white">Correo enviado</h2>
              <p className="text-sm text-blue-200">
                Revisa tu bandeja y sigue el enlace seguro para cambiar la contrasena.
              </p>
            </div>
          )}

          {step === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <h2 className="text-2xl font-bold text-white">Codigo de recuperacion</h2>
              <Input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError('');
                }}
                className="border-white/20 bg-white/5 text-center text-xl font-bold tracking-[0.3em] text-white"
                placeholder="Codigo"
                autoFocus
              />
              {error && <p className="text-sm text-red-300">{error}</p>}
              <Button
                type="submit"
                className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700"
              >
                Verificar
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-5">
              <h2 className="text-2xl font-bold text-white">Nueva contrasena</h2>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="border-white/20 bg-white/5 text-white"
                placeholder="Nueva contrasena"
                autoFocus
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                className="border-white/20 bg-white/5 text-white"
                placeholder="Confirmar contrasena"
              />
              {error && <p className="text-sm text-red-300">{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 py-6 text-white hover:bg-green-700"
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}Actualizar
              </Button>
            </form>
          )}

          <Link
            to="/"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-blue-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
