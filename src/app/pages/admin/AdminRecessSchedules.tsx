import { useEffect, useMemo, useState } from 'react';
import { Clock3, Plus, Trash2, RefreshCw, Power, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type Section={id:string;name:string}; type Grade={id:string;section_id:string;name:string}; type Course={id:string;grade_id:string;name:string};
type Schedule={id:string;name:string;weekday:number;start_time:string;end_time:string;active:boolean;priority:number;notes:string|null};
type Target={id:string;recess_schedule_id:string;section_id:string|null;grade_id:string|null;course_id:string|null};
const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

export function AdminRecessSchedules(){
 const client=requireSupabaseClient(); const [sections,setSections]=useState<Section[]>([]); const [grades,setGrades]=useState<Grade[]>([]); const [courses,setCourses]=useState<Course[]>([]); const [schedules,setSchedules]=useState<Schedule[]>([]); const [targets,setTargets]=useState<Target[]>([]); const [selectedSection,setSelectedSection]=useState(''); const [selectedGrade,setSelectedGrade]=useState(''); const [selectedCourse,setSelectedCourse]=useState(''); const [name,setName]=useState(''); const [weekday,setWeekday]=useState('1'); const [start,setStart]=useState('09:30'); const [end,setEnd]=useState('09:50'); const [saving,setSaving]=useState(false); const [scope,setScope]=useState<'section'|'grade'|'course'>('section');
 const load=async()=>{try{const [a,b,c,d,e]=await Promise.all([client.from('academic_sections').select('id,name').order('display_order'),client.from('academic_grades').select('id,section_id,name').order('display_order'),client.from('academic_courses').select('id,grade_id,name').order('display_order'),client.from('recess_schedules').select('id,name,weekday,start_time,end_time,active,priority,notes').order('weekday').order('start_time'),client.from('recess_schedule_targets').select('id,recess_schedule_id,section_id,grade_id,course_id')]); if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;if(d.error)throw d.error;if(e.error)throw e.error;setSections(a.data??[]);setGrades(b.data??[]);setCourses(c.data??[]);setSchedules(d.data??[]);setTargets(e.data??[]);setSelectedSection(x=>x||a.data?.[0]?.id||'');}catch(error){toast.error(error instanceof Error?error.message:'No se pudieron cargar los horarios.');}};
 useEffect(()=>{void load();},[]);
 const availableGrades=useMemo(()=>grades.filter(g=>g.section_id===selectedSection),[grades,selectedSection]); const availableCourses=useMemo(()=>courses.filter(c=>c.grade_id===selectedGrade),[courses,selectedGrade]);
 useEffect(()=>{if(!availableGrades.some(g=>g.id===selectedGrade))setSelectedGrade(availableGrades[0]?.id||'');},[availableGrades,selectedGrade]); useEffect(()=>{if(!availableCourses.some(c=>c.id===selectedCourse))setSelectedCourse(availableCourses[0]?.id||'');},[availableCourses,selectedCourse]);
 const targetLabel=(t:Target)=>{if(t.course_id){const c=courses.find(x=>x.id===t.course_id);const g=c&&grades.find(x=>x.id===c.grade_id);const s=g&&sections.find(x=>x.id===g.section_id);return `${s?.name??''} · ${g?.name??''}${c?.name??''}`;}if(t.grade_id){const g=grades.find(x=>x.id===t.grade_id);const s=g&&sections.find(x=>x.id===g.section_id);return `${s?.name??''} · ${g?.name??''}`;}return sections.find(x=>x.id===t.section_id)?.name??'Sección';};
 const addSchedule=async()=>{
  if(!name.trim()||!selectedSection){toast.error('Completa el nombre y selecciona una sección.');return;}
  if(scope==='grade'&&!selectedGrade){toast.error('Selecciona un grado.');return;}
  if(scope==='course'&&!selectedCourse){toast.error('Selecciona un curso.');return;}
  setSaving(true);
  let committed=false;
  try{
   const {data:scheduleId,error}=await client.rpc('admin_create_recess_schedule_with_target',{
    p_name:name.trim(),p_weekday:Number(weekday),p_start_time:start,p_end_time:end,p_scope:scope,
    p_section_id:selectedSection,p_grade_id:scope==='section'?null:selectedGrade,
    p_course_id:scope==='course'?selectedCourse:null
   });
   if(error)throw error;
   if(typeof scheduleId!=='string'||!scheduleId)throw new Error('Supabase no devolvió el identificador del horario.');
   committed=true;
   const [scheduleResult,targetResult]=await Promise.all([
    client.from('recess_schedules').select('id,name,weekday,start_time,end_time,active').eq('id',scheduleId).maybeSingle(),
    client.from('recess_schedule_targets').select('id,recess_schedule_id,section_id,grade_id,course_id').eq('recess_schedule_id',scheduleId).maybeSingle()
   ]);
   if(scheduleResult.error)throw new Error('No se pudo verificar el horario guardado: '+scheduleResult.error.message);
   if(targetResult.error)throw new Error('No se pudo verificar el destino del horario: '+targetResult.error.message);
   const saved=scheduleResult.data;
   const target=targetResult.data;
   const expectedSection=scope==='section'?selectedSection:null;
   const expectedGrade=scope==='grade'?selectedGrade:null;
   const expectedCourse=scope==='course'?selectedCourse:null;
   if(!saved||saved.name!==name.trim()||Number(saved.weekday)!==Number(weekday)||String(saved.start_time).slice(0,5)!==start||String(saved.end_time).slice(0,5)!==end||saved.active!==true||
      !target||target.section_id!==expectedSection||target.grade_id!==expectedGrade||target.course_id!==expectedCourse){
    throw new Error('El horario o su destino guardado no coincide con los datos enviados.');
   }
   setName('');
   await load();
   toast.success('Horario y destino guardados y verificados en Supabase.');
  }catch(error){
   const message=error instanceof Error?error.message:'Error desconocido.';
   if(committed){toast.warning('El horario se guardó, pero no se pudo verificar completamente: '+message);setName('');void load();}
   else toast.error(message);
  }finally{setSaving(false);}
 };
 const toggle=async(s:Schedule)=>{
  try{
   const {data,error}=await client.from('recess_schedules').update({active:!s.active}).eq('id',s.id).select('id,active').single();
   if(error)throw error;
   if(!data||data.active===s.active)throw new Error('Supabase no confirmó el nuevo estado del horario.');
   await load();
   toast.success('Estado del horario actualizado y verificado.');
  }catch(error){toast.error(error instanceof Error?error.message:'No se pudo cambiar el horario.');}
 };
 const remove=async(id:string)=>{
  try{
   const {error}=await client.from('recess_schedules').delete().eq('id',id);
   if(error)throw error;
   const [scheduleResult,targetResult]=await Promise.all([
    client.from('recess_schedules').select('id').eq('id',id).maybeSingle(),
    client.from('recess_schedule_targets').select('id').eq('recess_schedule_id',id).limit(1)
   ]);
   if(scheduleResult.error)throw new Error('No se pudo verificar la ausencia del horario: '+scheduleResult.error.message);
   if(targetResult.error)throw new Error('No se pudo verificar la ausencia de sus destinos: '+targetResult.error.message);
   if(scheduleResult.data||(targetResult.data??[]).length>0)throw new Error('El horario o su destino todavía aparece en Supabase.');
   await load();
   toast.success('Receso eliminado y ausencia verificada en Supabase.');
  }catch(error){toast.error(error instanceof Error?error.message:'No se pudo confirmar la eliminación.');}
 };
 return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-3"><Clock3 className="h-7 w-7 text-emerald-500"/><h1 className="text-2xl font-black">Horarios de recreo</h1></div><p className="mt-1 text-sm text-muted-foreground">Define cuándo puede comprar cada sección, grado o curso.</p></div><Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button></div>
 <Card className="p-5"><h2 className="font-black">Nuevo horario</h2><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-6"><div className="lg:col-span-2"><Label>Nombre</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Receso 1"/></div><div><Label>Día</Label><select value={weekday} onChange={e=>setWeekday(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{weekdays.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></div><div><Label>Inicio</Label><Input type="time" value={start} onChange={e=>setStart(e.target.value)}/></div><div><Label>Fin</Label><Input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></div><div><Label>Aplicar a</Label><select value={scope} onChange={e=>setScope(e.target.value as typeof scope)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="section">Sección</option><option value="grade">Grado</option><option value="course">Curso</option></select></div></div><div className="mt-4 grid gap-4 md:grid-cols-3"><div><Label>Sección</Label><select value={selectedSection} onChange={e=>setSelectedSection(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><Label>Grado</Label><select disabled={scope==='section'} value={selectedGrade} onChange={e=>setSelectedGrade(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50">{availableGrades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div><div><Label>Curso</Label><select disabled={scope!=='course'} value={selectedCourse} onChange={e=>setSelectedCourse(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50">{availableCourses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div><Button className="mt-4" onClick={()=>void addSchedule()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>{saving?'Guardando...':'Agregar recreo'}</Button></Card>
 <div className="space-y-3">{schedules.map(s=>{const ts=targets.filter(t=>t.recess_schedule_id===s.id);return <Card key={s.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-500">{weekdays[s.weekday]}</span><h3 className="font-black">{s.name}</h3><span className="text-sm text-muted-foreground">{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</span></div><div className="mt-2 flex flex-wrap gap-2">{ts.map(t=><span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold">{targetLabel(t)}<ChevronRight className="h-3 w-3"/></span>)}</div></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={()=>void toggle(s)}><Power className={`mr-2 h-4 w-4 ${s.active?'text-emerald-500':'text-slate-400'}`}/>{s.active?'Activo':'Inactivo'}</Button><Button variant="outline" size="sm" className="text-red-500" onClick={()=>void remove(s.id)}><Trash2 className="h-4 w-4"/></Button></div></div></Card>})}</div></div>;
}
