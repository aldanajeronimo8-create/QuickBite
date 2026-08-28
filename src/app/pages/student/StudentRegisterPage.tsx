import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, ArrowLeft, Mail, Lock, Eye, EyeOff, CreditCard, ShieldCheck, FileText } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  ti: string;
  created_at: string;
}

const PRIVACY_VERSION = '2026-08-28';
const DATA_PURPOSE = 'Gestionar la cuenta estudiantil, pedidos y pagos de la cafetería, inventario asociado a pedidos, historial de compras, puntos y recompensas, notificaciones operativas y atención de solicitudes de habeas data.';

export function StudentRegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', ti: '', guardianName: '', guardianRelationship: '', guardianEmail: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [studentAcknowledged, setStudentAcknowledged] = useState(false);
  const [guardianAuthorized, setGuardianAuthorized] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 3) errs.name = 'Mínimo 3 caracteres';
    if (!form.email || !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Correo electrónico inválido';
    if (!form.password || form.password.length < 6) errs.password = 'Mínimo 6 caracteres';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
    if (!/^\d{1,11}$/.test(form.ti.trim())) errs.ti = 'Ingresa una T.I. válida de hasta 11 dígitos';
    if (!form.guardianName.trim()) errs.guardianName = 'Ingresa el nombre del representante legal o tutor';
    if (!form.guardianRelationship.trim()) errs.guardianRelationship = 'Indica el parentesco o relación';
    if (!form.guardianEmail || !/^\S+@\S+\.\S+$/.test(form.guardianEmail)) errs.guardianEmail = 'Correo del representante inválido';
    if (!studentAcknowledged) errs.studentAcknowledged = 'Debes confirmar que leíste y comprendes el aviso';
    if (!guardianAuthorized) errs.guardianAuthorized = 'Se requiere autorización del representante legal o tutor';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const email = form.email.trim().toLowerCase();
    const metadata = {
      full_name: form.name.trim(), role: 'student', data_consent_version: PRIVACY_VERSION,
      student_acknowledged: 'true', guardian_authorized: 'true', guardian_name: form.guardianName.trim(),
      guardian_relationship: form.guardianRelationship.trim(), guardian_email: form.guardianEmail.trim().toLowerCase(),
      data_consent_at: new Date().toISOString(),
    };

    try {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password: form.password, options: { data: metadata } });
      let userId = data.user?.id;

      if (error && /already registered|already exists/i.test(error.message)) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (loginError || !loginData.user) { setErrors({ email: 'Este correo ya tiene una cuenta. Usa la contraseña correspondiente o recupera el acceso.' }); return; }
        userId = loginData.user.id;
        const { error: metadataError } = await supabase.auth.updateUser({ data: metadata });
        if (metadataError) throw metadataError;
      } else if (error) {
        throw error;
      }

      if (!userId) throw new Error('No fue posible crear la cuenta. Supabase no devolvió el usuario creado.');

      const { error: rpcError } = await supabase.rpc('create_student_profile_with_consent', {
        p_user_id: userId, p_email: email, p_full_name: form.name.trim(), p_ti: form.ti.trim(),
        p_guardian_name: form.guardianName.trim(), p_guardian_relationship: form.guardianRelationship.trim(),
        p_guardian_email: form.guardianEmail.trim().toLowerCase(), p_student_acknowledged: true,
        p_guardian_authorized: true, p_purpose: DATA_PURPOSE,
      });

      if (rpcError) {
        if (/ti_already_registered|duplicate/i.test(rpcError.message) && /ti/i.test(rpcError.message)) setErrors({ ti: 'Esta T.I. ya está registrada.' });
        else if (/consent|authorization|guardian/i.test(rpcError.message)) setErrors({ guardianAuthorized: `No se pudo registrar la autorización: ${rpcError.message}` });
        else throw new Error(`No se pudo guardar el perfil del estudiante: ${rpcError.message}`);
        return;
      }

      if (!data.session) {
        toast.success('Cuenta creada. Revisa el correo de confirmación. La autorización de datos quedó registrada.', { duration: 9000 });
        navigate('/');
      } else {
        toast.success(`¡Bienvenido, ${form.name.trim()}!`);
        navigate('/menu');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'No fue posible crear la cuenta.');
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 flex flex-col items-center justify-center p-5">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute -top-32 -right-32 w-72 h-72 bg-yellow-300/30 rounded-full blur-3xl" /><div className="absolute -bottom-32 -left-32 w-72 h-72 bg-red-400/20 rounded-full blur-3xl" /></div>
      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-6"><QuickBiteLogo className="mx-auto mb-3 h-16 w-16 rounded-3xl" /><h1 className="text-3xl font-bold text-white tracking-tight">QuickBite</h1><p className="text-green-100 text-sm mt-1">Crear cuenta de estudiante</p></div>
        <div className="bg-white rounded-3xl shadow-2xl p-7 space-y-5">
          <div><h2 className="text-xl font-bold text-gray-800">Registro y autorización de datos</h2><p className="text-gray-500 text-sm mt-1">Completa tus datos y registra la autorización de tu representante legal o tutor.</p></div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <section className="space-y-3 rounded-2xl border border-slate-200 p-4"><h3 className="font-black text-slate-800">1. Datos del estudiante</h3>
              <Field label="Nombre completo" icon={<User className="h-4 w-4" />} value={form.name} error={errors.name} onChange={(v) => set('name', v)} placeholder="Tu nombre completo" />
              <Field label="Correo electrónico" icon={<Mail className="h-4 w-4" />} value={form.email} error={errors.email} onChange={(v) => set('email', v)} placeholder="tu@correo.com" type="email" />
              <div className="grid gap-3 sm:grid-cols-2"><PasswordField label="Contraseña" value={form.password} error={errors.password} visible={showPwd} onToggle={() => setShowPwd(!showPwd)} onChange={(v) => set('password', v)} /><PasswordField label="Confirmar contraseña" value={form.confirmPassword} error={errors.confirmPassword} visible={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} onChange={(v) => set('confirmPassword', v)} /></div>
              <Field label="T.I. (Tarjeta de identidad)" icon={<CreditCard className="h-4 w-4" />} value={form.ti} error={errors.ti} onChange={(v) => set('ti', v.replace(/\D/g, '').slice(0, 11))} placeholder="Hasta 11 dígitos" inputMode="numeric" />
            </section>
            <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><h3 className="font-black text-slate-800">2. Representante legal o tutor</h3><p className="text-xs text-slate-600">Para estudiantes menores de edad, la autorización del representante legal/tutor es un requisito del tratamiento de datos personales.</p>
              <Field label="Nombre completo del representante" icon={<User className="h-4 w-4" />} value={form.guardianName} error={errors.guardianName} onChange={(v) => set('guardianName', v)} placeholder="Nombre del padre, madre o tutor" />
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Parentesco / relación" value={form.guardianRelationship} error={errors.guardianRelationship} onChange={(v) => set('guardianRelationship', v)} placeholder="Padre, madre, tutor..." /><Field label="Correo del representante" icon={<Mail className="h-4 w-4" />} value={form.guardianEmail} error={errors.guardianEmail} onChange={(v) => set('guardianEmail', v)} placeholder="correo@ejemplo.com" type="email" /></div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" /><div><p className="font-black text-slate-800">3. Hábeas data y autorización</p><p className="mt-1 text-xs leading-5 text-slate-600">QuickBite solicita autorización previa, expresa e informada para tratar los datos necesarios para la cuenta, pedidos, pagos, historial, puntos, recompensas y atención de solicitudes sobre datos personales.</p></div></div>
              <button type="button" onClick={() => setShowPrivacy(!showPrivacy)} className="flex items-center gap-2 text-sm font-bold text-green-700"><FileText className="h-4 w-4" />{showPrivacy ? 'Ocultar política resumida' : 'Ver política resumida de tratamiento'}</button>
              {showPrivacy && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600"><p><b>Finalidad:</b> {DATA_PURPOSE}</p><p className="mt-2"><b>Datos tratados:</b> nombre, correo, T.I., grado/curso, pedidos/compras, pagos, puntos y recompensas y comunicaciones operativas.</p><p className="mt-2"><b>Derechos:</b> conocer, actualizar, rectificar y acceder a los datos; solicitar información sobre su uso; y ejercer los mecanismos de consulta, reclamo, revocatoria o supresión cuando legalmente proceda.</p><p className="mt-2"><b>Versión:</b> {PRIVACY_VERSION}. Esta pantalla registra la autorización del prototipo; el Colegio/Responsable debe publicar su política integral y canales oficiales de atención.</p></div>}
              <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={studentAcknowledged} onChange={(e) => setStudentAcknowledged(e.target.checked)} className="mt-1 h-4 w-4 accent-green-600" /><span>He leído el aviso de privacidad y comprendo para qué se tratarán mis datos. <b>Este consentimiento queda registrado.</b></span></label>{errors.studentAcknowledged && <p className="text-xs text-red-500">{errors.studentAcknowledged}</p>}
              <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={guardianAuthorized} onChange={(e) => setGuardianAuthorized(e.target.checked)} className="mt-1 h-4 w-4 accent-green-600" /><span>Declaro que el representante legal o tutor identificado arriba autoriza el tratamiento de los datos del estudiante para las finalidades informadas y ha podido conocer esta autorización.</span></label>{errors.guardianAuthorized && <p className="text-xs text-red-500">{errors.guardianAuthorized}</p>}
              <p className="text-[11px] leading-4 text-slate-500">La normativa colombiana exige especial protección para los datos de niños, niñas y adolescentes. En un despliegue institucional real debe verificarse la identidad y facultad del representante y mantenerse disponible la política integral y el procedimiento de consultas/reclamos.</p>
            </section>
            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-6 rounded-xl shadow-lg shadow-green-950/20">Crear cuenta y registrar autorización →</Button>
          </form>
          <div className="border-t border-gray-100 pt-3"><Link to="/"><Button variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-50 py-5 rounded-xl text-sm"><ArrowLeft className="w-4 h-4 mr-2" />Volver al inicio</Button></Link></div>
        </div>
        <p className="text-center text-white/50 text-xs mt-5">© 2026 QuickBite · Colegio Bilingüe Maximino Poitiers</p>
      </div>
    </div>
  );
}

function Field({ label, icon, value, error, onChange, placeholder, type = 'text', inputMode }: { label: string; icon?: React.ReactNode; value: string; error?: string; onChange: (value: string) => void; placeholder: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) {
  return <div><Label className="text-gray-700 text-sm mb-1 block">{label}</Label><div className="relative">{icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}<Input type={type} inputMode={inputMode} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={icon ? `pl-9 ${error ? 'border-red-400' : ''}` : error ? 'border-red-400' : ''} /></div>{error && <p className="text-red-500 text-xs mt-1">{error}</p>}</div>;
}

function PasswordField({ label, value, error, visible, onToggle, onChange }: { label: string; value: string; error?: string; visible: boolean; onToggle: () => void; onChange: (value: string) => void }) {
  return <div><Label className="text-gray-700 text-sm mb-1 block">{label}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className={`pl-9 pr-9 ${error ? 'border-red-400' : ''}`} /><button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{error && <p className="text-red-500 text-xs mt-1">{error}</p>}</div>;
}