import { ArrowLeft, Bell, Clock3, CreditCard, Heart, History, Info, Link2, Star, UtensilsCrossed, Wallet, MessageSquare } from 'lucide-react';
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
        <Link reloadDocument to="/student/reviews" className={`${studentCardClass} border-amber-200 bg-amber-50/70 dark:border-amber-300/25 dark:bg-amber-400/10`}><MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-300"/><h2 className="qb-text mt-3 font-black">Reseñas y calificaciones</h2><p className="qb-text-secondary mt-1 text-sm">Califica productos que ya recibiste y consulta tus opiniones.</p></Link>
        <Link reloadDocument to="/student/wallet" className={`${studentCardClass} border-emerald-200 bg-emerald-50/70 dark:border-emerald-300/25 dark:bg-emerald-500/10`}><CreditCard className="h-5 w-5 text-emerald-700 dark:text-emerald-300"/><h2 className="qb-text mt-3 font-black">Saldos y recargas</h2><p className="qb-text-secondary mt-1 text-sm">Saldo disponible, recargas, estados, rechazos, horas y movimientos detallados.</p></Link>
        <Link reloadDocument to="/student/order-windows" className={`${studentCardClass} border-blue-200 bg-blue-50/70 dark:border-blue-300/25 dark:bg-blue-500/10`}><Clock3 className="h-5 w-5 text-blue-700 dark:text-blue-300"/><h2 className="qb-text mt-3 font-black">Ventanas de pedidos</h2><p className="qb-text-secondary mt-1 text-sm">Consulta horarios, cupos disponibles y cuándo puedes realizar tu próximo pedido.</p></Link>
        <Link reloadDocument to="/student/favorites" className={studentCardClass}><Heart className="h-5 w-5 text-rose-600 dark:text-rose-300"/><h2 className="qb-text mt-3 font-black">Mis favoritos</h2><p className="qb-text-secondary mt-1 text-sm">Tus alimentos guardados para volver a pedirlos.</p></Link>
        <Link reloadDocument to="/student/account" className={studentCardClass}><Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300"/><h2 className="qb-text mt-3 font-black">Mi cuenta</h2><p className="qb-text-secondary mt-1 text-sm">Mis datos, contraseña y preferencias alimentarias.</p></Link>
        <Link reloadDocument to="/student/history" className={studentCardClass}><History className="h-5 w-5 text-blue-700 dark:text-blue-300"/><h2 className="qb-text mt-3 font-black">Pedidos de la semana</h2><p className="qb-text-secondary mt-1 text-sm">Consulta los pedidos realizados durante la semana actual.</p></Link>
        {loyaltyEnabled && <Link reloadDocument to="/student/rewards" className={studentCardClass}><Star className="h-5 w-5 text-amber-500"/><h2 className="qb-text mt-3 font-black">Puntos y premios</h2><p className="qb-text-secondary mt-1 text-sm">Consulta y canjea tus recompensas disponibles.</p></Link>}
        <Link reloadDocument to="/student/notifications" className={studentCardClass}><Bell className="h-5 w-5 text-violet-600 dark:text-violet-300"/><h2 className="qb-text mt-3 font-black">Notificaciones</h2><p className="qb-text-secondary mt-1 text-sm">Revisa avisos y cambios de tus pedidos y recargas.</p></Link>
        <Link reloadDocument to="/student/link-code" className={`${studentCardClass} sm:col-span-2 lg:col-span-3`}><div className="flex items-start gap-3"><Link2 className="h-5 w-5 text-blue-700 dark:text-blue-300"/><div><h2 className="qb-text font-black">Código para vincular a mi familia</h2><p className="qb-text-secondary mt-1 text-sm">Genera o consulta tu código. Un padre, madre o acudiente usa este código desde su cuenta para solicitar el vínculo con tu perfil.</p></div></div></Link>
        <details className="group sm:col-span-2 lg:col-span-3 overflow-hidden rounded-3xl border border-emerald-200/70 bg-emerald-50/70 shadow-sm dark:border-emerald-300/20 dark:bg-emerald-500/5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Info className="h-5 w-5"/></div><div><h2 className="qb-text font-black">Más sobre QuickBite</h2><p className="qb-text-secondary mt-1 text-sm">Conoce el propósito, funcionamiento y beneficios del proyecto.</p></div></div><span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-700 transition-transform group-open:rotate-180 dark:border-emerald-300/20 dark:bg-slate-900/40 dark:text-emerald-300" aria-hidden="true">⌄</span>
          </summary>
          <div className="border-t border-emerald-200/60 px-5 pb-5 pt-4 dark:border-emerald-300/15">
            <p className="qb-text-secondary leading-7">QuickBite CBMP es una plataforma web creada para optimizar el proceso de compra en la cafetería escolar del Colegio Bilingüe Maximino Poitiers. Busca facilitar el acceso a los alimentos durante los descansos mediante un flujo más rápido, organizado y claro para estudiantes y personal de cafetería.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="qb-surface rounded-2xl border qb-border p-4"><h3 className="qb-text font-black">¿Qué problema resuelve?</h3><p className="qb-text-secondary mt-1 text-sm leading-6">Ayuda a reducir filas y tiempos de atención centralizando el menú y los pedidos en una experiencia digital.</p></div>
              <div className="qb-surface rounded-2xl border qb-border p-4"><h3 className="qb-text font-black">¿Cómo funciona?</h3><p className="qb-text-secondary mt-1 text-sm leading-6">El estudiante consulta el menú, selecciona productos, confirma su pedido y recibe la información necesaria para recogerlo.</p></div>
              <div className="qb-surface rounded-2xl border qb-border p-4"><h3 className="qb-text font-black">Beneficios</h3><p className="qb-text-secondary mt-1 text-sm leading-6">Mejora la organización de la atención y permite aprovechar mejor el tiempo de descanso.</p></div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>;
}
