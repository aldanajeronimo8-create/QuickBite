import { useEffect, useState } from 'react';
import { Clock3, Plus, Trash2, RefreshCw, Power, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type Section = { id: string; name: string };
type Schedule = { id: string; name: string; weekday: number; start_time: string; end_time: string; active: boolean; priority: number; notes: string | null };
type Target = { id: string; recess_schedule_id: string; section_id: string | null };
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function AdminRecessSchedules() {
  const client = requireSupabaseClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState('1');
  const [start, setStart] = useState('09:30');
  const [end, setEnd] = useState('09:50');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [sectionsResult, schedulesResult, targetsResult] = await Promise.all([
        client.from('academic_sections').select('id,name').eq('active', true).order('display_order'),
        client.from('recess_schedules').select('id,name,weekday,start_time,end_time,active,priority,notes').order('weekday').order('start_time'),
        client.from('recess_schedule_targets').select('id,recess_schedule_id,section_id'),
      ]);
      if (sectionsResult.error) throw sectionsResult.error;
      if (schedulesResult.error) throw schedulesResult.error;
      if (targetsResult.error) throw targetsResult.error;
      setSections(sectionsResult.data ?? []);
      setSchedules(schedulesResult.data ?? []);
      setTargets(targetsResult.data ?? []);
      setSelectedSection(current => sectionsResult.data?.some(section => section.id === current)
        ? current
        : sectionsResult.data?.[0]?.id ?? '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los horarios.');
    }
  };

  useEffect(() => { void load(); }, []);

  const targetLabel = (target: Target) =>
    sections.find(section => section.id === target.section_id)?.name ?? 'Sección no asignada';

  const addSchedule = async () => {
    if (name.trim().length < 2 || !selectedSection) {
      toast.error('Completa el nombre y selecciona una sección activa.');
      return;
    }
    if (start >= end) {
      toast.error('La hora de finalización debe ser posterior a la de inicio.');
      return;
    }

    setSaving(true);
    let committed = false;
    try {
      const { data: scheduleId, error } = await client.rpc('admin_create_recess_schedule_with_target', {
        p_name: name.trim(),
        p_weekday: Number(weekday),
        p_start_time: start,
        p_end_time: end,
        p_scope: 'section',
        p_section_id: selectedSection,
        p_grade_id: null,
        p_course_id: null,
      });
      if (error) throw error;
      if (typeof scheduleId !== 'string' || !scheduleId) {
        throw new Error('Supabase no devolvió el identificador del horario.');
      }
      committed = true;

      const [scheduleResult, targetResult] = await Promise.all([
        client.from('recess_schedules').select('id,name,weekday,start_time,end_time,active').eq('id', scheduleId).maybeSingle(),
        client.from('recess_schedule_targets').select('id,recess_schedule_id,section_id,grade_id,course_id').eq('recess_schedule_id', scheduleId).maybeSingle(),
      ]);
      if (scheduleResult.error) throw new Error('No se pudo verificar el horario guardado: ' + scheduleResult.error.message);
      if (targetResult.error) throw new Error('No se pudo verificar la sección guardada: ' + targetResult.error.message);
      const saved = scheduleResult.data;
      const target = targetResult.data;
      if (!saved || saved.name !== name.trim() || Number(saved.weekday) !== Number(weekday)
        || String(saved.start_time).slice(0, 5) !== start || String(saved.end_time).slice(0, 5) !== end
        || saved.active !== true || !target || target.section_id !== selectedSection
        || target.grade_id !== null || target.course_id !== null) {
        throw new Error('El horario o su sección no coincide con los datos enviados.');
      }

      setName('');
      await load();
      toast.success('Horario de recreo guardado para toda la sección y verificado en Supabase.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.';
      if (committed) {
        toast.warning('El horario se guardó, pero no se pudo verificar completamente: ' + message);
        setName('');
        void load();
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (schedule: Schedule) => {
    try {
      const { data, error } = await client.from('recess_schedules')
        .update({ active: !schedule.active }).eq('id', schedule.id).select('id,active').single();
      if (error) throw error;
      if (!data || data.active === schedule.active) {
        throw new Error('Supabase no confirmó el nuevo estado del horario.');
      }
      await load();
      toast.success('Estado del horario actualizado y verificado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el horario.');
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await client.from('recess_schedules').delete().eq('id', id);
      if (error) throw error;
      const [scheduleResult, targetResult] = await Promise.all([
        client.from('recess_schedules').select('id').eq('id', id).maybeSingle(),
        client.from('recess_schedule_targets').select('id').eq('recess_schedule_id', id).limit(1),
      ]);
      if (scheduleResult.error) throw new Error('No se pudo verificar la ausencia del horario: ' + scheduleResult.error.message);
      if (targetResult.error) throw new Error('No se pudo verificar la ausencia de sus destinos: ' + targetResult.error.message);
      if (scheduleResult.data || (targetResult.data ?? []).length > 0) {
        throw new Error('El horario o su destino todavía aparece en Supabase.');
      }
      await load();
      toast.success('Recreo eliminado y ausencia verificada en Supabase.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo confirmar la eliminación.');
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <Clock3 className="h-7 w-7 text-emerald-500" />
          <h1 className="text-2xl font-black">Horarios de recreo</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Cada horario se asigna a una sección y aplica a todos sus grados y cursos.</p>
      </div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </div>

    <Card className="p-5">
      <h2 className="font-black">Nuevo horario por sección</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2"><Label>Nombre</Label><Input value={name} onChange={event => setName(event.target.value)} placeholder="Recreo de la mañana" /></div>
        <div><Label>Día</Label><select value={weekday} onChange={event => setWeekday(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>
        <div><Label>Inicio</Label><Input type="time" value={start} onChange={event => setStart(event.target.value)} /></div>
        <div><Label>Fin</Label><Input type="time" value={end} onChange={event => setEnd(event.target.value)} /></div>
      </div>
      <div className="mt-4 max-w-md">
        <Label>Sección</Label>
        <select value={selectedSection} onChange={event => setSelectedSection(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select>
        {sections.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No hay secciones activas para asignar.</p>}
      </div>
      <Button className="mt-4" onClick={() => void addSchedule()} disabled={saving || sections.length === 0}>
        <Plus className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Agregar recreo'}
      </Button>
    </Card>

    <div className="space-y-3">
      {schedules.map(schedule => {
        const scheduleTargets = targets.filter(target => target.recess_schedule_id === schedule.id);
        return <Card key={schedule.id} className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-500">{weekdays[schedule.weekday]}</span>
                <h3 className="font-black">{schedule.name}</h3>
                <span className="text-sm text-muted-foreground">{schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {scheduleTargets.map(target => <span key={target.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold">{targetLabel(target)}<ChevronRight className="h-3 w-3" /></span>)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void toggle(schedule)}><Power className={`mr-2 h-4 w-4 ${schedule.active ? 'text-emerald-500' : 'text-slate-400'}`} />{schedule.active ? 'Activo' : 'Inactivo'}</Button>
              <Button variant="outline" size="sm" className="text-red-500" onClick={() => void remove(schedule.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>;
      })}
      {schedules.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Todavía no hay horarios configurados. Crea uno y asígnalo a una sección.</Card>}
    </div>
  </div>;
}
