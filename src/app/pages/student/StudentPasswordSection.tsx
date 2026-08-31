import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

export function StudentPasswordSection({ userId }: { userId: string }) {
  const [verified, setVerified] = useState(false);
  const [ti, setTi] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const verifyTi = async () => {
    const normalizedTi = ti.trim();
    if (!normalizedTi) {
      toast.error('Ingresa tu tarjeta de identidad.');
      return;
    }
    setVerifying(true);
    try {
      const client = requireSupabaseClient();
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (userData.user?.id !== userId) throw new Error('La sesión no corresponde al estudiante actual.');

      const { data, error } = await client.rpc('verify_student_identity', {
        p_user_id: userId,
        p_ti: normalizedTi,
      });
      if (error) throw error;
      if (data !== true) {
        toast.error('La tarjeta de identidad no coincide con la registrada en esta cuenta.');
        return;
      }

      setVerified(true);
      toast.success('Identidad verificada. Ahora puedes cambiar tu contraseña.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo verificar la tarjeta de identidad.');
    } finally {
      setVerifying(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!verified) {
      toast.error('Primero verifica tu tarjeta de identidad.');
      return;
    }
    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      const client = requireSupabaseClient();
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      toast.success('Contraseña actualizada correctamente.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.';
      if (/reauth|recent login|nonce/i.test(message)) {
        toast.error('Supabase requiere una reautenticación reciente. Usa “Reestablecer contraseña” para recibir un enlace seguro por correo.');
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-blue-700" />
        <div>
          <h2 className="font-black">Contraseña</h2>
          <p className="text-sm text-slate-600">Esta sección está oculta hasta verificar la T.I. vinculada a tu cuenta.</p>
        </div>
      </div>

      {!verified ? (
        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            Verificación de identidad requerida
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Ingresa exactamente la tarjeta de identidad registrada en tu cuenta. La contraseña actual nunca se muestra.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="student-ti-password">Tarjeta de identidad</Label>
              <Input id="student-ti-password" value={ti} onChange={(event) => setTi(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Número de T.I." />
            </div>
            <Button type="button" onClick={() => void verifyTi()} disabled={verifying} className="self-end bg-blue-700 text-white hover:bg-blue-800">
              {verifying ? 'Verificando…' : 'Verificar T.I.'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Contraseña actual</p>
              <p className="mt-1 font-black tracking-[0.25em] text-slate-700">••••••••</p>
            </div>
            <KeyRound className="h-5 w-5 text-blue-700" />
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <Label htmlFor="student-new-password">Nueva contraseña</Label>
              <div className="relative mt-1">
                <Input id="student-new-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" className="pr-11" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="student-confirm-password">Confirmar nueva contraseña</Label>
              <div className="relative mt-1">
                <Input id="student-confirm-password" type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repite la contraseña" className="pr-11" />
                <button type="button" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={saving} className="bg-blue-700 text-white hover:bg-blue-800">
              {saving ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
