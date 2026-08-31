import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { requireSupabaseClient } from '../../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';

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
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo de recuperación.');
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
          <p className="text-blue-200">Restablecer contraseña</p>
        </div>

        <div className="qb-auth-card rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          {sent ? (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-300" />
              <h2 className="text-2xl font-bold text-white">Revisa tu correo</h2>
              <p className="text-sm leading-6 text-blue-100">
                Si existe una cuenta asociada a ese correo, Supabase enviará un enlace para restablecer la contraseña. Abre el enlace en este mismo dispositivo.
              </p>
              <Button onClick={() => { setSent(false); setEmail(''); }} className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700">Usar otro correo</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="mb-1 text-2xl font-bold text-white">¿Olvidaste tu contraseña?</h2>
                <p className="mb-6 text-sm text-blue-200">Escribe el correo de tu cuenta. Recibirás un enlace seguro para crear una nueva contraseña.</p>
                <Label htmlFor="fp-email" className="mb-2 block text-white/90">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-300" />
                  <Input id="fp-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} className="border-white/20 bg-white/5 pl-11 text-white placeholder:text-white/40 focus:border-blue-400" placeholder="tu@correo.com" autoComplete="email" autoFocus />
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-600 py-6 text-white hover:bg-blue-700">
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
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
