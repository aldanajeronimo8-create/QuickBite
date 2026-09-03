from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# 1) Admin orders: make the operational explanation explicit.
p = ROOT / 'src/app/pages/admin/AdminOrders.tsx'
s = p.read_text()
s = s.replace('Solo los pedidos aceptados o rechazados aparecen aquí. Los pendientes se revisan en Pagos.', 'Aquí aparecen todos los pedidos con pago confirmado o rechazado. Los pagos pendientes se revisan en Pagos; los pedidos con pago confirmado pasan a esta cola operativa.')
p.write_text(s)

# 2) Routes: use the actual Student experience for linked parents instead of a duplicate menu.
p = ROOT / 'src/app/routes.tsx'
s = p.read_text()
s = s.replace("import { ParentStudentMenuPage } from './pages/student/ParentStudentMenuPage';\n", '')
s = s.replace("import { useStudentContextStore } from '../store/studentContextStore';\n", '')
s = re.sub(r"function StudentMenuRoute\(\) \{.*?\n\}\nexport const router", "export const router", s, flags=re.S)
s = s.replace('{ path: \'/menu\', element: <RoleProtectedRoute role="student"><StudentMenuRoute /></RoleProtectedRoute> }', '{ path: \'/menu\', element: <RoleProtectedRoute role="student"><StudentExperienceLayout /></RoleProtectedRoute> }')
p.write_text(s)

# 3) Student menu: use active linked student in parent mode while preserving the complete Student UI.
p = ROOT / 'src/app/pages/student/StudentMenuPage.tsx'
s = p.read_text()
if "useStudentContextStore" not in s:
    s = s.replace("import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';", "import { QuickBiteLogo } from '../../components/brand/QuickBiteLogo';\nimport { useStudentContextStore } from '../../../store/studentContextStore';")
pattern = r"  useEffect\(\(\) => \{\n    let active = true;\n    async function initializeStudentSession\(\) \{.*?    initializeStudentSession\(\);\n    return \(\) => \{ active = false; \};\n  \}, \[loadData, navigate\]\);"
replacement = '''  const activeStudent = useStudentContextStore((state) => state.activeStudent);\n  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);\n\n  useEffect(() => {\n    let active = true;\n    async function initializeStudentSession() {\n      try {\n        const client = requireSupabaseClient();\n        const { data: sessionData, error: sessionError } = await client.auth.getSession();\n        if (sessionError) throw sessionError;\n        const authUser = sessionData.session?.user;\n        if (!authUser) { navigate('/'); return; }\n\n        const effectiveStudentId = activeStudent?.id ?? authUser.id;\n        const { data: profile, error } = await client\n          .from('profiles')\n          .select('id,email,full_name,role,ti')\n          .eq('id', effectiveStudentId)\n          .maybeSingle();\n        if (error) throw error;\n        if (!profile || (!activeStudent && !canAccessStudent(profile.role))) {\n          if (!activeStudent) await client.auth.signOut();\n          navigate('/');\n          return;\n        }\n\n        const { data: wallet, error: walletError } = await client\n          .from('wallet_accounts')\n          .select('balance')\n          .eq('user_id', effectiveStudentId)\n          .maybeSingle();\n        if (walletError) throw walletError;\n        if (active) {\n          setStudent({ id: profile.id, name: profile.full_name, grade: profile.ti ?? '', email: profile.email });\n          setWalletBalance(Number(wallet?.balance ?? 0));\n        }\n        await loadData();\n      } catch (error) {\n        toast.error(error instanceof Error ? error.message : 'No se pudo cargar tu sesión');\n        navigate('/setup');\n      }\n    }\n    void initializeStudentSession();\n    return () => { active = false; };\n  }, [activeStudent, loadData, navigate]);'''
s, n = re.subn(pattern, replacement, s, flags=re.S)
if n != 1:
    raise SystemExit('StudentMenuPage initialization block not found')
old = "  const handleLogout = async () => { await requireSupabaseClient().auth.signOut(); navigate('/'); };"
new = '''  const handleLogout = async () => {\n    if (activeStudent) {\n      try {\n        const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');\n        if (error) throw error;\n        clearActiveStudent();\n        navigate('/parent/family');\n      } catch (error) {\n        toast.error(error instanceof Error ? error.message : 'No se pudo volver al panel de padre.');\n      }\n      return;\n    }\n    await requireSupabaseClient().auth.signOut();\n    navigate('/');\n  };'''
if old not in s:
    raise SystemExit('StudentMenuPage logout handler not found')
s = s.replace(old, new, 1)
needle = '<div className="min-h-screen bg-slate-50 pb-24 text-slate-900">'
banner = '''<div className="min-h-screen bg-slate-50 pb-24 text-slate-900">\n    {activeStudent && <div className="sticky top-0 z-50 border-b border-blue-200 bg-blue-50/95 px-5 py-3 text-blue-950 shadow-sm backdrop-blur-xl lg:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold">Estás viendo la experiencia real de {activeStudent.full_name}. Los pedidos, saldo, historial y cambios pertenecen a este estudiante.</p></div><button type="button" onClick={() => void handleLogout()} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100">Volver a Padre</button></div></div>'''
if needle not in s:
    raise SystemExit('StudentMenuPage root not found')
s = s.replace(needle, banner, 1)
p.write_text(s)

# 4) Wallet: scope reads and requests to the selected student in parent mode.
p = ROOT / 'src/app/pages/student/StudentWalletPage.tsx'
s = p.read_text()
if "useStudentContextStore" not in s:
    s = s.replace("import { requireSupabaseClient } from '../../../lib/supabase';", "import { requireSupabaseClient } from '../../../lib/supabase';\nimport { useStudentContextStore } from '../../../store/studentContextStore';")
s = s.replace("export function StudentWalletPage() {\n  const [wallet", "export function StudentWalletPage() {\n  const activeStudent = useStudentContextStore((state) => state.activeStudent);\n  const clearActiveStudent = useStudentContextStore((state) => state.clearActiveStudent);\n  const [wallet")
s = s.replace("    const userId = session.session?.user.id;\n    if (!userId) throw new Error('Sesión no disponible.');", "    const userId = activeStudent?.id ?? session.session?.user.id;\n    if (!userId) throw new Error('Sesión no disponible.');")
s = s.replace("  }, []);", "  }, [activeStudent]);", 1)
s = s.replace("    const userId = session.session?.user.id;\n    if (!userId) {", "    const userId = activeStudent?.id ?? session.session?.user.id;\n    if (!userId) {", 1)
needle = '<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.10),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">'
insert = '''<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.10),_transparent_32%),#f5f8f7] p-5 text-slate-900 sm:p-8">\n    {activeStudent && <div className="mx-auto mb-5 flex max-w-5xl items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50/95 p-4 shadow-sm"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="truncate text-sm font-bold text-blue-950">Saldos y recargas de {activeStudent.full_name}.</p></div><button type="button" onClick={() => void (async () => { const { error } = await requireSupabaseClient().rpc('clear_parent_active_student'); if (error) { toast.error(error.message); return; } clearActiveStudent(); window.location.assign('/parent/family'); })()} className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-blue-800 shadow-sm ring-1 ring-blue-200">Volver a Padre</button></div>'''
if needle not in s:
    raise SystemExit('StudentWalletPage root not found')
s = s.replace(needle, insert, 1)
p.write_text(s)

# 5) History: scope order/cancellation state to the selected student.
p = ROOT / 'src/app/pages/student/StudentHistoryPage.tsx'
s = p.read_text()
if "useStudentContextStore" not in s:
    s = s.replace("import { useDataStore } from '../../../store/dataStore';", "import { useDataStore } from '../../../store/dataStore';\nimport { useStudentContextStore } from '../../../store/studentContextStore';")
s = s.replace("  const { orders, loadData } = useDataStore();", "  const { orders, loadData } = useDataStore();\n  const activeStudent = useStudentContextStore((state) => state.activeStudent);")
s = s.replace("      const id = data.session?.user.id;", "      const id = activeStudent?.id ?? data.session?.user.id;")
s = s.replace("  }, [navigate, refresh]);", "  }, [activeStudent, navigate, refresh]);")
needle = '<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,106,.14),_transparent_38%),#f5f8f7] p-5 sm:p-8 text-slate-900">'
insert = needle + '\n    {activeStudent && <div className="mx-auto mb-5 max-w-3xl rounded-3xl border border-blue-200 bg-blue-50/95 p-4 text-blue-950 shadow-sm"><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Modo padre</p><p className="text-sm font-bold">Historial de {activeStudent.full_name}.</p></div>}'
if needle not in s:
    raise SystemExit('StudentHistoryPage root not found')
s = s.replace(needle, insert, 1)
p.write_text(s)

# 6) Admin wallet: map common review errors to actionable messages.
p = ROOT / 'src/app/pages/admin/AdminWalletTopups.tsx'
s = p.read_text()
old = "      toast.error(e instanceof Error ? e.message : 'No se pudo aprobar la recarga.');"
new = "      toast.error(e instanceof Error ? (/unauthorized|not_authorized/i.test(e.message) ? 'Tu sesión administrativa no tiene permisos para aprobar recargas.' : /request_not_found|already_reviewed/i.test(e.message) ? 'La solicitud ya fue procesada. Actualiza la lista.' : e.message) : 'No se pudo aprobar la recarga.');"
if old in s: s = s.replace(old, new, 1)
p.write_text(s)

print('Repair complete')
