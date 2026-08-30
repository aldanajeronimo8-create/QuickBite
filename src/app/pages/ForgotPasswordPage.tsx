import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { requireSupabaseClient } from '../../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

function getRecoveryMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate limit|too many requests/i.test(message)) return 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.';
  if (/captcha/i.test(message)) return 'No se pudo validar la solicitud. Inténtalo de nuevo.';
  return message || 'No se pudo enviar el enlace de recuperación.';
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      const message = getRecoveryMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qb-auth qb-auth--admin flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="qb-auth-brand mb-8 text-center">
          <QuickBiteLogo className="mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="mb-2 text-4xl font-bold text-white">QuickBite</h1>
          <p className="text-blue-200">Recuperar contraseña de estudiante</p>
        </div>

        <div className="qb-auth-card rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          {sent ? (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-300" />
              <div>
                <h2 className="mb-2 text-2xl font-bold text-white">Revisa tu correo</h2>
                <p className="text-sm text-blue-200">
                  Si la cuenta existe, recibirás un enlace para cambiar la contraseña. El enlace es temporal y solo permite recuperar cuentas de estudiante.
                </p>
              </div>
              <Button type="button" onClick={() => setSent(false)} className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700">
                Enviar otro enlace
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="mb-1 text-2xl font-bold text-white">Restablece tu contraseña</h2>
                <p className="mb-6 text-sm text-blue-200">Te enviaremos un enlace seguro por correo. Ya no usamos códigos fijos de recuperación.</p>
                <Label htmlFor="fp-email" className="mb-2 block text-white/90">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-300" />
                  <Input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setError(''); }}
                    className="border-white/20 bg-white/5 pl-11 text-white placeholder:text-white/40 focus:border-blue-400"
                    placeholder="tu@correo.com"
                    autoFocus
                  />
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Enviar enlace seguro
              </Button>
            </form>
          )}

          <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-blue-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
