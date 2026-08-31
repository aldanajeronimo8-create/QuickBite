import { Bell, ClipboardList, Heart, History, Link2, ShoppingCart, Star, UtensilsCrossed, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

export function StudentFeatureCenter() {
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.12),_transparent_34%),#f5f8f7] p-5 text-slate-900 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-2xl">
        <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">QuickBite Student</p>
        <h1 className="text-3xl font-black">Centro de funciones</h1>
        <p className="mt-1 text-sm text-slate-600">Compra, favoritos, pedidos, recompensas y herramientas de tu cuenta.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/menu?tab=menu" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><UtensilsCrossed className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Menú</h2><p className="mt-1 text-sm text-slate-600">Comprar y consultar disponibilidad.</p></Link>
        <Link to="/student/favorites" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Heart className="h-5 w-5 text-rose-600"/><h2 className="mt-3 font-black">Favoritos</h2><p className="mt-1 text-sm text-slate-600">Marca cualquier producto con el corazón y vuelve a pedirlo cuando quieras.</p></Link>
        <Link to="/student/account" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Wallet className="h-5 w-5 text-emerald-700"/><h2 className="mt-3 font-black">Mi cuenta</h2><p className="mt-1 text-sm text-slate-600">Mis datos, saldo y preferencias alimentarias.</p></Link>
        <Link to="/student/history" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><History className="h-5 w-5 text-blue-700"/><h2 className="mt-3 font-black">Pedidos de la semana</h2><p className="mt-1 text-sm text-slate-600">Consulta los pedidos realizados durante la semana actual.</p></Link>
        <Link to="/student/rewards" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Star className="h-5 w-5 text-amber-500"/><h2 className="mt-3 font-black">Puntos y premios</h2><p className="mt-1 text-sm text-slate-600">Consulta y canjea tus recompensas disponibles.</p></Link>
        <Link to="/student/notifications" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl"><Bell className="h-5 w-5 text-violet-600"/><h2 className="mt-3 font-black">Notificaciones</h2><p className="mt-1 text-sm text-slate-600">Revisa avisos y cambios de tus pedidos.</p></Link>
        <Link to="/student/link-code" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl sm:col-span-2 lg:col-span-3"><div className="flex items-start gap-3"><Link2 className="h-5 w-5 text-blue-700"/><div><h2 className="font-black">Código para vincular a mi familia</h2><p className="mt-1 text-sm text-slate-600">Genera o consulta tu código. Un padre, madre o acudiente usa este código desde su cuenta para solicitar el vínculo con tu perfil.</p></div></div></Link>
        <Link to="/student/account" className="rounded-3xl border border-white/60 bg-white/65 p-5 shadow-sm backdrop-blur-xl sm:col-span-2 lg:col-span-3"><div className="flex items-center gap-3"><ClipboardList className="h-5 w-5 text-emerald-700"/><ShoppingCart className="h-5 w-5 text-emerald-700"/><div><h2 className="font-black">Mi cuenta</h2><p className="mt-1 text-sm text-slate-600">Consulta tus datos, administra tu billetera y tus preferencias alimentarias desde un solo lugar.</p></div></div></Link>
      </div>
    </div>
  </div>;
}
