import { ArrowLeft, Bell, Clock3, Heart, History, Link2, Star, UtensilsCrossed, Wallet, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudentContextStore } from '../../../store/studentContextStore';
import { useLoyaltyProgram } from '../../hooks/useLoyaltyProgram';

export function StudentFeatureCenter() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const { enabled: loyaltyEnabled } = useLoyaltyProgram();
  const returnToParent = () => { clearActiveStudent(); navigate('/parent/family'); };

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.12),_transparent_34%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      {activeStudent && <div className="flex items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50/90 p-4 shadow-sm"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold text-blue-950">Gestionando el entorno de {activeStudent.full_name}</p></div><button type="button" onClick={returnToParent} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200"><ArrowLeft className="h-4 w-4"/>Volver a Padre</button></div>}
      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite Student</p><h1 className="text-3xl font-black">Centro de funciones</h1><p className="mt-1 text-sm text-slate-600">Compra, saldo, favoritos, pedidos y herramientas de tu cuenta.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link reloadDocument to="/menu?tab=menu" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><UtensilsCrossed className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Menú</h2><p className="mt-1 text-sm text-slate-600">Comprar y consultar disponibilidad.</p></Link>
        <Link reloadDocument to="/student/wallet" className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm backdrop-blur-xl ring-1 ring-emerald-100"><CreditCard className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Saldos y recargas</h2><p className="mt-1 text-sm text-slate-600">Saldo disponible, recargas, estados, rechazos, horas y movimientos detallados.</p></Link>
        <Link reloadDocument to="/student/order-windows" className="rounded-3xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm backdrop-blur-xl ring-1 ring-blue-100"><Clock3 className="h-5 w-5 text-blue-700"/><h2 className="mt-3 font-black">Ventanas de pedidos</h2><p className="mt-1 text-sm text-slate-600">Consulta horarios, cupos disponibles y cuándo puedes realizar tu próximo pedido.</p></Link>
        <Link reloadDocument to="/student/favorites" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Heart className="h-5 w-5 text-rose-600"/><h2 className="mt-3 font-black">Mis favoritos</h2><p className="mt-1 text-sm text-slate-600">Tus alimentos guardados para volver a pedirlos.</p></Link>
        <Link reloadDocument to="/student/account" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Wallet className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Mi cuenta</h2><p className="mt-1 text-sm text-slate-600">Mis datos, contraseña y preferencias alimentarias.</p></Link>
        <Link reloadDocument to="/student/history" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><History className="h-5 w-5 text-blue-700"/><h2 className="mt-3 font-black">Pedidos de la semana</h2><p className="mt-1 text-sm text-slate-600">Consulta los pedidos realizados durante la semana actual.</p></Link>
        {loyaltyEnabled && <Link reloadDocument to="/student/rewards" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Star className="h-5 w-5 text-amber-500"/><h2 className="mt-3 font-black">Puntos y premios</h2><p className="mt-1 text-sm text-slate-600">Consulta y canjea tus recompensas disponibles.</p></Link>}
        <Link reloadDocument to="/student/notifications" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Bell className="h-5 w-5 text-violet-600"/><h2 className="mt-3 font-black">Notificaciones</h2><p className="mt-1 text-sm text-slate-600">Revisa avisos y cambios de tus pedidos y recargas.</p></Link>
        <Link reloadDocument to="/student/link-code" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl sm:col-span-2 lg:col-span-3"><div className="flex items-start gap-3"><Link2 className="h-5 w-5 text-blue-700"/><div><h2 className="font-black">Código para vincular a mi familia</h2><p className="mt-1 text-sm text-slate-600">Genera o consulta tu código. Un padre, madre o acudiente usa este código desde su cuenta para solicitar el vínculo con tu perfil.</p></div></div></Link>
      </div>
    </div>
  </div>;
}
