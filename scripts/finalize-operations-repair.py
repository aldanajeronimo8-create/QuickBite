from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# Student menu already gets the authoritative parent banner from StudentExperienceLayout.
p = ROOT / 'src/app/pages/student/StudentMenuPage.tsx'
s = p.read_text()
banner = '{activeStudent && <div className="sticky top-0 z-50 border-b border-blue-200 bg-blue-50/95 px-5 py-3 text-blue-950 shadow-sm backdrop-blur-xl lg:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold">Estás viendo la experiencia real de {activeStudent.full_name}. Los pedidos, saldo, historial y cambios pertenecen a este estudiante.</p></div><button type="button" onClick={() => void handleLogout()} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100">Volver a Padre</button></div></div>'
s = s.replace('    ' + banner + '\n', '')
p.write_text(s)

# Rebuild the Wallet root section with valid JSX and keep parent context visible.
p = ROOT / 'src/app/pages/student/StudentWalletPage.tsx'
s = p.read_text()
root = '<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.10),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">'
start = s.find(root)
content_start = start + len(root)
marker = '    <div className="mx-auto max-w-5xl space-y-6">'
marker_pos = s.find(marker, content_start)
if start < 0 or marker_pos < 0:
    raise SystemExit('StudentWalletPage JSX root could not be normalized')
prefix = s[:start] + root + '\n'
banner = '    {activeStudent && <div className="mx-auto mb-5 flex max-w-5xl items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50/95 p-4 shadow-sm"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold text-blue-950">Saldos y recargas de {activeStudent.full_name}.</p></div><button type="button" onClick={() => void (async () => { const { error } = await requireSupabaseClient().rpc(\'clear_parent_active_student\'); if (error) { toast.error(error.message); return; } clearActiveStudent(); window.location.assign(\'/parent/family\'); })()} className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200">Volver a Padre</button></div>}\n'
s = prefix + banner + s[marker_pos:]
p.write_text(s)

# Admin uses the result-returning transactional RPC so the UI can confirm balance changes.
p = ROOT / 'src/app/pages/admin/AdminWalletTopups.tsx'
s = p.read_text()
s = s.replace("requireSupabaseClient().rpc('approve_wallet_topup', { p_request_id: id })", "requireSupabaseClient().rpc('admin_approve_wallet_topup', { p_request_id: id })")
p.write_text(s)

print('Finalization complete')
