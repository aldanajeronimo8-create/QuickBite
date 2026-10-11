import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { QuickBiteLogo } from '../components/brand/QuickBiteLogo';
import { requireSupabaseClient, setAuthContext } from '../../lib/supabase';
import { isProtectedAllAccount, requiresProtectedFirstAccessPasswordChange } from '../../lib/protectedFirstAccess';

export function ProtectedFirstAccessPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const client = requireSupabaseClient();
      void client.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active) return;
        const user = data.session?.user;
        if (sessionError || !user || !isProtectedAllAccount(user.email)) {
          navigate('/login', { replace: true });
          return;
        }
        if (!requiresProtectedFirstAccessPasswordChange(user)) {
          navigate('/login', { replace: true });
          return;
        }
        setAccountEmail(user.email ?? '');
        setChecking(false);
      }).catch(() => {
        if (active) navigate('/login', { replace: true });
      });
    } catch {
      navigate('/login', { replace: true });
    }
    return () => { active = false; };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 12) {
      setError('Usa al menos 12 caracteres para tu nueva contraseña.');
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Incluye mayúsculas, minúsculas, números y un símbolo.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      const client = requireSupabaseClient();
      const { data, error: functionError } = await client.functions.invoke(
        'server/api/protected-first-access/change-password',
        { body: { new_password: password } },
      );
      if (functionError) throw new Error(functionError.message || 'No se pudo verificar el cambio de contraseña.');
      if (data?.error) throw new Error(String(data.error));
      if (data?.changed !== true) throw new Error('QuickBite no confirmó el cambio de contraseña.');

      // The server clears the trusted app_metadata flag. Sign out so the next
      // session receives a fresh JWT with that flag removed.
      await client.auth.signOut({ scope: 'local' });
      setAuthContext('user');
      toast.success('Contraseña establecida. Inicia sesión con tu nueva contraseña.');
      navigate('/login', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="qb-auth min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-200/20 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 px-8 py-7 text-center text-white">
          <QuickBiteLogo className="mx-auto mb-4 h-14 w-14 rounded-2xl" />
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-300/10">
            <KeyRound className="h-6 w-6 text-cyan-200" aria-hidden="true" />
          </div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Protección de cuenta</p>
          <h1 className="mt-2 text-2xl font-black">Configura tu contraseña personal</h1>
          <p className="mt-2 text-sm text-slate-200">Este paso es obligatorio antes de usar cualquier espacio de QuickBite.</p>
        </div>

        <div className="p-7 sm:p-8">
          {checking ? (
            <div className="py-8 text-center text-slate-600">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" aria-hidden="true" />
              Comprobando la activación de la cuenta…
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-800" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">Primer acceso verificado</p>
                  <p className="mt-1 break-all text-sm text-slate-600">{accountEmail}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">La contraseña provisional dejará de servir cuando guardes la nueva. Tendrás que iniciar sesión otra vez.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="protected-new-password" className="mb-2 block">Nueva contraseña</Label>
                  <div className="relative">
                    <Input id="protected-new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" autoFocus value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Mínimo 12 caracteres" className="pr-12" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="protected-confirm-password" className="mb-2 block">Confirmar nueva contraseña</Label>
                  <div className="relative">
                    <Input id="protected-confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} placeholder="Vuelve a escribirla" className="pr-12" />
                    <button type="button" onClick={() => setShowConfirmation((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-label={showConfirmation ? 'Ocultar confirmación' : 'Mostrar confirmación'}>{showConfirmation ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>

                <p className="text-xs leading-5 text-slate-500">Usa al menos 12 caracteres, con mayúsculas, minúsculas, números y un símbolo. No la compartas con otras personas.</p>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <Button type="submit" disabled={saving} className="w-full bg-cyan-800 py-6 font-bold text-white hover:bg-cyan-900">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Guardar contraseña y activar cuenta</>}
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
