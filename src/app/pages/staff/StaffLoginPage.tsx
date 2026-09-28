import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { loginStaff } from '../../../lib/coreApi';

export function StaffLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginStaff(email.trim(), password);
      navigate('/staff', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-300">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">QuickBite</p>
            <h1 className="text-2xl font-black">Centro de Operaciones</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-300">Acceso exclusivo para cuentas con rol Staff mediante QuickBite Core.</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-bold">
            Correo
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none ring-blue-400 transition focus:ring-2" />
          </label>
          <label className="block text-sm font-bold">
            Contraseña
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none ring-blue-400 transition focus:ring-2" />
          </label>
          {error && <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p>}
          <button disabled={loading} type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Ingresando...' : 'Entrar a Staff'}
          </button>
        </form>
      </section>
    </main>
  );
}
