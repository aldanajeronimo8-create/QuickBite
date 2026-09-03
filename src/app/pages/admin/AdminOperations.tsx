import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Boxes, CheckCircle2, Clock3, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { useAuthStore } from '../../../store/authStore';

type Slot = { slot_id:string; slot_name:string; starts_at:string; ends_at:string; enabled:boolean; max_orders:number|null; orders_count:number; accepting_orders:boolean };
type Ranking = { product_id:string; name:string; units_sold:number; revenue:number; order_count:number };
type Inventory = { id:string; name:string; price:number; available_stock:number; reserved_stock:number; total_stock:number; available:boolean };
const money=(n:number)=>Number(n).toLocaleString('es-CO');

export function AdminOperations() {
 const authLoading=useAuthStore((state)=>state.loading);
 const currentUser=useAuthStore((state)=>state.user);
 const [slots,setSlots]=useState<Slot[]>([]); const [rankings,setRankings]=useState<Ranking[]>([]); const [inventory,setInventory]=useState<Inventory[]>([]);
 const [windowsEnabled,setWindowsEnabled]=useState(true);
 const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [saving,setSaving]=useState(false); const [togglingFeature,setTogglingFeature]=useState(false);
 const [editingSlot,setEditingSlot]=useState<Slot|null>(null);
 const [form,setForm]=useState({name:'Receso',starts:'09:30',ends:'10:00',max:'30'});
 const load=useCallback(async()=>{
  if(authLoading||!currentUser)return;
  setLoading(true); setError(null);
  const c=requireSupabaseClient();
  const results=await Promise.allSettled([
   c.rpc('get_order_window_status'),
   c.rpc('get_order_windows_enabled'),
   c.from('product_sales_rankings').select('*').order('units_sold',{ascending:false}).limit(20),
   c.from('product_inventory_status').select('*').order('reserved_stock',{ascending:false}).limit(50),
  ]);
  const problems:string[]=[];
  const [slotResult,featureResult,rankingResult,inventoryResult]=results;
  if(slotResult.status==='fulfilled') { const {data,error:e}=slotResult.value; if(e) problems.push(`Ventanas: ${e.message}`); else setSlots((data??[]) as Slot[]); }
  else problems.push(`Ventanas: ${slotResult.reason instanceof Error?slotResult.reason.message:'fallo desconocido'}`);
  if(featureResult.status==='fulfilled') { const {data,error:e}=featureResult.value; if(e) problems.push(`Configuración: ${e.message}`); else setWindowsEnabled(data === true); }
  else problems.push(`Configuración: ${featureResult.reason instanceof Error?featureResult.reason.message:'fallo desconocido'}`);
  if(rankingResult.status==='fulfilled') { const {data,error:e}=rankingResult.value; if(e) problems.push(`Ranking: ${e.message}`); else setRankings((data??[]) as Ranking[]); }
  else problems.push(`Ranking: ${rankingResult.reason instanceof Error?rankingResult.reason.message:'fallo desconocido'}`);
  if(inventoryResult.status==='fulfilled') { const {data,error:e}=inventoryResult.value; if(e) problems.push(`Inventario: ${e.message}`); else setInventory((data??[]) as Inventory[]); }
  else problems.push(`Inventario: ${inventoryResult.reason instanceof Error?inventoryResult.reason.message:'fallo desconocido'}`);
  setError(problems.length?problems.join(' · '):null); setLoading(false);
 },[authLoading,currentUser]);
 useEffect(()=>{if(!authLoading&&currentUser)void load()},[authLoading,currentUser,load]);
 const resetForm=()=>{setEditingSlot(null);setForm({name:'Receso',starts:'09:30',ends:'10:00',max:'30'});};
 const openEditSlot=(s:Slot)=>{setEditingSlot(s);setForm({name:s.slot_name,starts:s.starts_at.slice(0,5),ends:s.ends_at.slice(0,5),max:s.max_orders===null?'':String(s.max_orders)});};
 const saveSlot=async()=>{
  if(!currentUser)return;
  const name=form.name.trim();
  const start=form.starts.trim();
  const end=form.ends.trim();
  if(!name){toast.error('El nombre de la ventana es obligatorio.');return;}
  if(!/^\\d{2}:\\d{2}$/.test(start)||!/^\\d{2}:\\d{2}$/.test(end)){toast.error('Selecciona una hora de inicio y una hora de fin válidas.');return;}
  const [sh,sm]=start.split(':').map(Number); const [eh,em]=end.split(':').map(Number); const startMinutes=sh*60+sm; const endMinutes=eh*60+em;
  if(startMinutes>=endMinutes){toast.error('La hora de inicio debe ser anterior a la hora de fin.');return;}
  const max=form.max.trim()===''?null:Number(form.max);
  if(max!==null&&(!Number.isInteger(max)||max<=0)){toast.error('El límite debe ser un número entero mayor que 0.');return;}
  setSaving(true);
  try{
   const {error}=await requireSupabaseClient().rpc('admin_upsert_pickup_slot',{p_id:editingSlot?.slot_id??null,p_name:name,p_starts_at:`${start}:00`,p_ends_at:`${end}:00`,p_enabled:editingSlot?.enabled??true,p_max_orders:max});
   if(error)throw error;
   toast.success(editingSlot?'Ventana de pedidos actualizada.':'Ventana de pedidos creada.'); resetForm(); await load();
  }catch(e){toast.error(e instanceof Error?e.message:'No se pudo guardar la ventana.')}finally{setSaving(false)}
 };
 const toggleSlot=async(s:Slot)=>{if(!currentUser)return;try{const {error}=await requireSupabaseClient().rpc('admin_upsert_pickup_slot',{p_id:s.slot_id,p_name:s.slot_name,p_starts_at:`${s.starts_at.slice(0,5)}:00`,p_ends_at:`${s.ends_at.slice(0,5)}:00`,p_enabled:!s.enabled,p_max_orders:s.max_orders});if(error)throw error;toast.success(s.enabled?'Ventana desactivada.':'Ventana activada.');await load()}catch(e){toast.error(e instanceof Error?e.message:'No se pudo actualizar la ventana.')}};
 const toggleFeature=async()=>{if(!currentUser||togglingFeature)return; const next=!windowsEnabled; setTogglingFeature(true); try{const {data,error}=await requireSupabaseClient().rpc('admin_set_order_windows_enabled',{p_enabled:next}); if(error)throw error; setWindowsEnabled(data===true); toast.success(next?'Ventanas de pedidos habilitadas.':'Ventanas de pedidos deshabilitadas.'); await load()}catch(e){toast.error(e instanceof Error?e.message:'No se pudo cambiar la configuración de ventanas.')}finally{setTogglingFeature(false)}};
 return <div className="space-y-7"><header className="rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-6 shadow-xl sm:p-8"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">Operación avanzada</p><h1 className="mt-2 text-3xl font-black text-slate-950">Control operativo</h1><p className="mt-2 text-sm text-slate-600">Ventanas de pedido, capacidad, inventario reservado y ranking real de productos.</p></div><button onClick={()=>void load()} disabled={loading||authLoading||!currentUser} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Actualizar</button></div></header>
 {error&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">Algunas fuentes no estuvieron disponibles: {error}</div>}
 <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-blue-700"/><div><h2 className="text-xl font-black">Ventanas de pedidos</h2><p className="text-sm text-slate-500">Controla la función completa y, por separado, cada horario y su capacidad.</p></div></div><button type="button" onClick={()=>void toggleFeature()} disabled={togglingFeature||authLoading||!currentUser} className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-black shadow-sm transition disabled:opacity-50 ${windowsEnabled?'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200':'bg-slate-200 text-slate-700 ring-1 ring-slate-300'}`}><CheckCircle2 className="h-4 w-4"/>{togglingFeature?'Guardando…':windowsEnabled?'Función habilitada':'Función deshabilitada'}</button></div><div className={`mt-3 rounded-2xl border p-4 text-sm ${windowsEnabled?'border-emerald-100 bg-emerald-50/70 text-emerald-900':'border-amber-100 bg-amber-50 text-amber-900'}`}><b>{windowsEnabled?'Activa':'Desactivada'}:</b> {windowsEnabled?'los pedidos deben respetar una ventana habilitada y su cupo.':'los pedidos vuelven a funcionar sin la restricción de horario; los horarios se conservan para cuando reactives la función.'}</div><div className="mt-4 grid gap-2 md:grid-cols-5"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre" className="rounded-xl border p-3 text-sm"/><input type="time" value={form.starts} onChange={e=>setForm({...form,starts:e.target.value})} className="rounded-xl border p-3 text-sm"/><input type="time" value={form.ends} onChange={e=>setForm({...form,ends:e.target.value})} className="rounded-xl border p-3 text-sm"/><input type="number" min="1" value={form.max} onChange={e=>setForm({...form,max:e.target.value})} placeholder="Máximo" className="rounded-xl border p-3 text-sm"/><button disabled={saving||authLoading||!currentUser} onClick={()=>void saveSlot()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{editingSlot?<Pencil className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{editingSlot?'Guardar cambios':'Crear'}</button></div>{editingSlot&&<div className="mt-2 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span>Editando: <b>{editingSlot.slot_name}</b>. Al guardar se conserva su estado de activación.</span><button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-black hover:bg-white"><X className="h-3.5 w-3.5"/>Cancelar</button></div>}<div className="mt-4 space-y-2">{slots.map(s=><div key={s.slot_id} className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{s.slot_name} · {s.starts_at.slice(0,5)}–{s.ends_at.slice(0,5)}</p><p className="text-xs text-slate-500">{s.orders_count} pedidos hoy · límite {s.max_orders??'sin límite'} · {s.accepting_orders?'Aceptando ahora':'Cerrada ahora'}</p></div><div className="flex items-center gap-2"><button onClick={()=>openEditSlot(s)} disabled={authLoading||!currentUser||saving} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5"/>Editar</button><button onClick={()=>void toggleSlot(s)} disabled={authLoading||!currentUser||saving} className={`rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${s.enabled?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-600'}`}>{s.enabled?'Activa':'Desactivada'}</button></div></div>)}{!loading&&slots.length===0&&<p className="rounded-2xl border border-dashed p-5 text-sm text-slate-500">No hay ventanas configuradas.</p>}</div></section>
 <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><Boxes className="h-5 w-5 text-emerald-700"/><div><h2 className="text-xl font-black">Inventario reservado</h2><p className="text-sm text-slate-500">Disponible, reservado por pedidos activos y total comprometido.</p></div></div><div className="mt-4 space-y-2">{inventory.slice(0,12).map(i=><div key={i.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{i.name}</span><span>Disp. <b>{i.available_stock}</b> · Res. <b>{i.reserved_stock}</b> · Total <b>{i.total_stock}</b></span></div>)}{!loading&&inventory.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Sin datos de inventario para mostrar.</p>}</div></div><div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-violet-700"/><div><h2 className="text-xl font-black">Ranking de productos</h2><p className="text-sm text-slate-500">Ventas confirmadas y entregadas.</p></div></div><div className="mt-4 space-y-2">{rankings.slice(0,12).map((r,idx)=><div key={r.product_id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span><b>#{idx+1}</b> {r.name}</span><span className="font-bold">{r.units_sold} uds · ${money(Number(r.revenue))}</span></div>)}{!loading&&rankings.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Sin ventas confirmadas para mostrar.</p>}</div></div></section>
 </div>;
}
