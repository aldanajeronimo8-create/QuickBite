import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail, Lock, User, Users, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { requireSupabaseClient } from '../../lib/supabase';

export function ParentRegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', studentCode: '', relationship: 'Padre/Madre' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [verifiedStudent, setVerifiedStudent] = useState(false);
  const [error, setError] = useState('');
  const set = (field: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [field]: value })); setError(''); if (field === 'studentCode') setVerifiedStudent(false); };

  const verifyCode = async () => {
    const code = form.studentCode.trim().toUpperCase();
    if (!code) return setError('Ingresa el código que te proporcionó el estudiante.');
    setVerifyingCode(true);
    try {
      const client = requireSupabaseClient();
      const { data, error: rpcError } = await client.rpc('validate_student_link_code', { p_student_code: code });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.valid) throw new Error('El código no es válido, ya fue utilizado o expiró.');
      setVerifiedStudent(true);
      toast.success('Código válido. Puedes crear tu cuenta de Padre de Familia.');
    } catch (err) {
      setVerifiedStudent(false);
      setError(err instanceof Error ? err.message : 'No se pudo verificar el código.');
    } finally { setVerifyingCode(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!verifiedStudent) return setError('Primero debes verificar un código válido del estudiante.');
    if (form.name.trim().length < 3) return setError('Ingresa tu nombre completo.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Ingresa un correo válido.');
    if (form.password.length < 6) return setError('La contraseña debe tener mínimo 6 caracteres.');
    if (form.password !== form.confirmPassword) return setError('Las contraseñas no coinciden.');
    setCreating(true);
    try {
      const client = requireSupabaseClient();
      const email = form.email.trim().toLowerCase();
      const code = form.studentCode.trim().toUpperCase();
      const { data, error: signUpError } = await client.auth.signUp({
        email,
        password: form.password,
        options: { data: { full_name: form.name.trim(), role: 'parent', pending_student_code: code, pending_relationship: form.relationship.trim() || 'Padre/Madre' } },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Supabase no devolvió el usuario creado.');

      if (!data.session) {
        toast.success('Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión como Padre de Familia.', { duration: 10000 });
        navigate('/');
        return;
      }

      const { error: completeError } = await client.rpc('complete_pending_parent_registration');
      if (completeError) throw completeError;
      toast.success('¡Cuenta creada y estudiante vinculado correctamente!');
      navigate('/parent/family');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la cuenta.');
    } finally { setCreating(false); }
  };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,.16),_transparent_40%),#f5f8f7] p-5 text-slate-900 sm:p-8"><div className="mx-auto flex min-h-[90vh] max-w-lg items-center justify-center"><section className="w-full rounded-[2rem] bg-white/85 p-7 shadow-2xl backdrop-blur-2xl sm:p-9"><Link to="/register-student" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm"><ArrowLeft className="h-4 w-4"/>Tipo de cuenta</Link><div className="mt-6 text-center"><Users className="mx-auto h-10 w-10 text-blue-700"/><h1 className="mt-3 text-3xl font-black">Cuenta de Padre de Familia</h1><p className="mt-2 text-sm text-slate-600">Ingresa y verifica primero el código que te proporciona el estudiante.</p></div><form onSubmit={submit} className="mt-7 space-y-4"><div><Label className="mb-1 block text-sm">Código del estudiante</Label><div className="flex gap-2"><div className="relative flex-1"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input value={form.studentCode} onChange={(e) => set('studentCode', e.target.value.toUpperCase())} placeholder="QB-XXXXXXXX" className="pl-9" autoComplete="off" maxLength={32}/></div><Button type="button" variant="outline" onClick={() => void verifyCode()} disabled={verifyingCode || !form.studentCode.trim()}>{verifyingCode ? 'Verificando…' : 'Verificar'}</Button></div>{verifiedStudent && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">✓ Código válido</p>}</div><Field label="Nombre completo" value={form.name} onChange={(v) => set('name', v)} placeholder="Tu nombre completo" icon={<User className="h-4 w-4"/>}/><Field label="Correo electrónico" value={form.email} onChange={(v) => set('email', v)} placeholder="tu@correo.com" type="email" icon={<Mail className="h-4 w-4"/>}/><Field label="Relación con el estudiante" value={form.relationship} onChange={(v) => set('relationship', v)} placeholder="Padre/Madre" icon={<Users className="h-4 w-4"/>}/><PasswordField label="Contraseña" value={form.password} visible={showPassword} onToggle={() => setShowPassword(!showPassword)} onChange={(v) => set('password', v)}/><PasswordField label="Confirmar contraseña" value={form.confirmPassword} visible={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} onChange={(v) => set('confirmPassword', v)}/>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}<Button type="submit" disabled={creating || !verifiedStudent} className="w-full rounded-xl bg-blue-600 py-6 font-black text-white hover:bg-blue-700 disabled:opacity-50">{creating ? 'Creando cuenta…' : 'Crear cuenta de Padre de Familia'}</Button></form></section></div></div>;
}

function Field({ label, icon, value, onChange, placeholder, type = 'text' }: { label: string; icon?: React.ReactNode; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) { return <div><Label className="mb-1 block text-sm text-slate-700">{label}</Label><div className="relative">{icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}<Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={icon ? 'pl-9' : ''}/></div></div>; }
function PasswordField({ label, value, visible, onToggle, onChange }: { label: string; value: string; visible: boolean; onToggle: () => void; onChange: (value: string) => void }) { return <div><Label className="mb-1 block text-sm text-slate-700">{label}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/><Input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="pl-9 pr-9"/><button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400">{visible ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</button></div></div>; }
