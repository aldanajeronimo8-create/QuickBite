import { ArrowLeft, Bell, Clock3, Heart, History, Link2, Star, UtensilsCrossed, Wallet, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudentContextStore } from '../../../store/studentContextStore';
import { useLoyaltyProgram } from '../../hooks/useLoyaltyProgram';

const studentCardClass = 'rounded-3xl border qb-border qb-surface p-5 shadow-sm transition-colors hover:shadow-md';

export function StudentFeatureCenter() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);
  const { enabled: loyaltyEnabled } = useLoyaltyProgram();
  const returnToParent = () => { clearActiveStudent(); navigate('/parent/family'); };

  return <div className="qb-page min-h-screen p-5 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      {activeStudent && <div className="flex items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50/90 p-4 shadow-sm dark:border-blue-300/30 dark:bg-blue-500/10"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700 dark:text-blue-200">Modo padre</p><p className="truncate text-sm font-bold text-blue-950 dark:text-blue-50">Gestionando el entorno de {activeStudent.full_name}</p></div><button type="button" onClick={returnToParent} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm dark:border-blue-300/30 dark:bg-slate-800 dark:text-blue-100"><ArrowLeft className="h-4 w-4"/>Volver a Padre</button></div>}
      <div className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg backdrop-blur-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">QuickBite Student</p><h1 className="qb-text text-3xl font-black">Centro de funciones</h1><p className="qb-text-secondary mt-1 text-sm">Compra, saldo, favoritos, pedidos y herramientas de tu cuenta.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link reloadDocument to="/menu?tab=menu" className={studentCardClass}><UtensilsCrossed className="h-5 w-5 text-emerald-700 dark:text-emerald-300"/><h2 className="qb-text mt-3 font-black">Menú</h2><p className="qb-text-secondary mt-1 text-sm">Comprar y consultar disponibilidad.</p></Link>
        <Link reloadDocument to="/student/wallet" className={`${studentCardClass} border-emerald-200 bg-emerald-50/70 dark:border-emerald-300/25 dark:bg-emerald-500/10`}><CreditCard className="h-5 w-5 text-emerald-700 dark:text-emerald-300"/><h2 className="qb-text mt-3 font-black">Saldos y recargas</h2><p className="qb-text-secondary mt-1 text-sm">Saldo disponible, recargas, estados, rechazos, horas y movimientos detallados.</p></Link>
        <Link reloadDocument to="/student/order-windows" className={`${studentCardClass} border-blue-200 bg-blue-50/70 dark:border-blue-300/25 dark:bg-blue-500/10`}><Clock3 className="h-5 w-5 text-blue-700 dark:text-blue-300"/><h2 className="qb-text mt-3 font-black">Ventanas de pedidos</h2><p className="qb-text-secondary mt-1 text-sm">Consulta horarios, cupos disponibles y cuándo puedes realizar tu próximo pedido.</p></Link>
        <Link reloadDocument to="/student/favorites" className={studentCardClass}><Heart className="h-5 w-5 text-rose-600 dark:text-rose-300"/><h2 className="qb-text mt-3 font-black">Mis favoritos</h2><p className="qb-text-secondary mt-1 text-sm">Tus alimentos guardados para volver a pedirlos.</p></Link>
        <Link reloadDocument to="/student/account" className={studentCardClass}><Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300"/><h2 className="qb-text mt-3 font-black">Mi cuenta</h2><p className="qb-text-secondary mt-1 text-sm">Mis datos, contraseña y preferencias alimentarias.</p></Link>
        <Link reloadDocument to="/student/history" className={studentCardClass}><History className="h-5 w-5 text-blue-700 dark:text-blue-300"/><h2 className="qb-text mt-3 font-black">Pedidos de la semana</h2><p className="qb-text-secondary mt-1 text-sm">Consulta los pedidos realizados durante la semana actual.</p></Link>
        {loyaltyEnabled && <Link reloadDocument to="/student/rewards" className={studentCardClass}><Star className="h-5 w-5 text-amber-500"/><h2 className="qb-text mt-3 font-black">Puntos y premios</h2><p className="qb-text-secondary mt-1 text-sm">Consulta y canjea tus recompensas disponibles.</p></Link>}
        <Link reloadDocument to="/student/notifications" className={studentCardClass}><Bell className="h-5 w-5 text-violet-600 dark:text-violet-300"/><h2 className="qb-text mt-3 font-black">Notificaciones</h2><p className="qb-text-secondary mt-1 text-sm">Revisa avisos y cambios de tus pedidos y recargas.</p></Link>
        <Link reloadDocument to="/student/link-code" className={`${studentCardClass} sm:col-span-2 lg:col-span-3`}><div className="flex items-start gap-3"><Link2 className="h-5 w-5 text-blue-700 dark:text-blue-300"/><div><h2 className="qb-text font-black">Código para vincular a mi familia</h2><p className="qb-text-secondary mt-1 text-sm">Genera o consulta tu código. Un padre, madre o acudiente usa este código desde su cuenta para solicitar el vínculo con tu perfil.</p></div></div></Link>
      </div>
    </div>
  </div>;
}
