import { useEffect, useMemo, useState } from 'react';
import { Clock3, Plus, RefreshCw, Power, CalendarDays, Settings2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type Section = { id: string; name: string };
type Schedule = { id: string; name: string; weekday: number; start_time: string; end_time: string; active: boolean; priority: number; notes: string | null; created_at?: string };
type Target = { id: string; recess_schedule_id: string; section_id: string | null; grade_id?: string | null; course_id?: string | null };
type ScheduleGroup = {
  key: string;
  name: 'Primer Descanso' | 'Segundo Descanso';
  sectionId: string;
  sectionName: string;
  startTime: string;
  endTime: string;
  active: boolean;
  ids: string[];
  days: number[];
};
const weekdays = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];
const recessNames = ['Primer Descanso', 'Segundo Descanso'] as const;
function cleanTime(value: string) { return value.slice(0, 5); }
function groupKey(sectionId: string, name: string, startTime: string, endTime: string, active: boolean) {
  return [sectionId, name, cleanTime(startTime), cleanTime(endTime), String(active)].join('|');
}

export function AdminRecessSchedules() {
  const client = requireSupabaseClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [name, setName] = useState<(typeof recessNames)[number]>('Primer Descanso');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:30');
  const [end, setEnd] = useState('09:50');
  const [preorderLimit, setPreorderLimit] = useState(2);
  const [saving, setSaving] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);

  const load = async () => {
    try {
      const [sectionsResult, schedulesResult, targetsResult, limitResult] = await Promise.all([
        client.from('academic_sections').select('id,name').eq('active', true).order('display_order'),
        client.from('recess_schedules').select('id,name,weekday,start_time,end_time,active,priority,notes,created_at').order('weekday').order('start_time'),
        client.from('recess_schedule_targets').select('id,recess_schedule_id,section_id,grade_id,course_id'),
        client.rpc('admin_get_recess_preorder_limit'),
      ]);
      if (sectionsResult.error) throw sectionsResult.error;
      if (schedulesResult.error) throw schedulesResult.error;
      if (targetsResult.error) throw targetsResult.error;
      if (limitResult.error) throw limitResult.error;
      setSections(sectionsResult.data ?? []);
      setSchedules(schedulesResult.data ?? []);
      setTargets(targetsResult.data ?? []);
      const parsedLimit = Number(limitResult.data ?? 2);
      setPreorderLimit(Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 2);
      setSelectedSection(current => sectionsResult.data?.some(section => section.id === current)
        ? current
        : sectionsResult.data?.[0]?.id ?? '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los horarios.');
    }
  };

  useEffect(() => { void load(); }, []);

  const groups = useMemo<ScheduleGroup[]>(() => {
    const map = new Map<string, ScheduleGroup>();
    for (const schedule of schedules) {
      if (schedule.name !== 'Primer Descanso' && schedule.name !== 'Segundo Descanso') continue;
      const scheduleTargets = targets.filter(target => target.recess_schedule_id === schedule.id && target.section_id && !target.grade_id && !target.course_id);
      for (const target of scheduleTargets) {
        const section = sections.find(item => item.id === target.section_id);
        const key = groupKey(target.section_id!, schedule.name, schedule.start_time, schedule.end_time, schedule.active);
        const existing = map.get(key);
        if (existing) {
          existing.ids.push(schedule.id);
          existing.days.push(Number(schedule.weekday));
        } else {
          map.set(key, {
            key,
            name: schedule.name,
            sectionId: target.section_id!,
            sectionName: section?.name ?? 'Sección no asignada',
            startTime: cleanTime(schedule.start_time),
            endTime: cleanTime(schedule.end_time),
            active: schedule.active,
            ids: [schedule.id],
            days: [Number(schedule.weekday)],
          });
        }
      }
    }
    return [...map.values()].map(group => ({ ...group, ids: [...new Set(group.ids)], days: [...new Set(group.days)].sort((a, b) => (a || 7) - (b || 7)) }))
      .sort((a, b) => a.sectionName.localeCompare(b.sectionName, 'es') || a.name.localeCompare(b.name, 'es') || a.startTime.localeCompare(b.startTime));
  }, [schedules, targets, sections]);

  const toggleDay = (day: number) => setSelectedDays(current =>
    current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort((a, b) => a - b)
  );

  const saveWeeklySchedule = async () => {
    if (!selectedSection) { toast.error('Selecciona una sección activa.'); return; }
    if (selectedDays.length === 0) { toast.error('Selecciona al menos un día de la semana.'); return; }
    if (start >= end) { toast.error('La hora de finalización debe ser posterior a la de inicio.'); return; }
    setSaving(true);
    try {
      const { data, error } = await client.rpc('admin_upsert_weekly_recess_schedule', {
        p_name: name,
        p_weekdays: [...selectedDays].sort((a, b) => a - b),
        p_start_time: start,
        p_end_time: end,
        p_section_id: selectedSection,
      });
      if (error) throw error;
      const ids = Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
      if (ids.length !== selectedDays.length) throw new Error('El horario se guardó, pero la verificación no coincide con los días seleccionados.');

      const { data: savedRows, error: verifyError } = await client
        .from('recess_schedules')
        .select('id,name,weekday,start_time,end_time,active')
        .in('id', ids);
      if (verifyError) throw verifyError;
      const targetResult = await client
        .from('recess_schedule_targets')
        .select('recess_schedule_id,section_id,grade_id,course_id')
        .in('recess_schedule_id', ids);
      if (targetResult.error) throw targetResult.error;
      const daysSaved = new Set((savedRows ?? []).map(row => Number(row.weekday)));
      const timesMatch = (savedRows ?? []).every(row =>
        row.name === name && cleanTime(row.start_time) === start && cleanTime(row.end_time) === end && row.active === true
      );
      const targetsMatch = (targetResult.data ?? []).length === ids.length && (targetResult.data ?? []).every(target =>
        target.section_id === selectedSection && target.grade_id === null && target.course_id === null
      );
      if (daysSaved.size !== selectedDays.length || !selectedDays.every(day => daysSaved.has(day)) || !timesMatch || !targetsMatch) {
        throw new Error('Los datos guardados no coinciden con la programación semanal solicitada.');
      }
      await load();
      toast.success(`${name} quedó programado para ${selectedDays.length} día(s) y se verificó en Supabase.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la programación semanal.');
    } finally {
      setSaving(false);
    }
  };

  const savePreorderLimit = async () => {
    if (!Number.isInteger(preorderLimit) || preorderLimit < 1 || preorderLimit > 2) {
      toast.error('El máximo debe estar entre 1 y 2 pedidos.');
      return;
    }
    setSavingLimit(true);
    try {
      const { data, error } = await client.rpc('admin_set_recess_preorder_limit', { p_max_preorders: preorderLimit });
      if (error) throw error;
      if (Number(data) !== preorderLimit) throw new Error('Supabase no confirmó el máximo solicitado.');
      toast.success(`Máximo actualizado: ${preorderLimit} pedidos anticipados por estudiante y descanso.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el límite.');
    } finally {
      setSavingLimit(false);
    }
  };

  const toggleGroup = async (group: ScheduleGroup) => {
    try {
      const active = !group.active;
      const { data, error } = await client.from('recess_schedules')
        .update({ active })
        .in('id', group.ids)
        .select('id,active');
      if (error) throw error;
      if ((data ?? []).length !== group.ids.length || (data ?? []).some(row => row.active !== active)) {
        throw new Error('Supabase no confirmó el cambio de estado de todos los días.');
      }
      await load();
      toast.success(active ? 'Programación semanal activada.' : 'Programación semanal desactivada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado del horario.');
    }
  };

  const deactivateGroup = async (group: ScheduleGroup) => {
    try {
      const { data, error } = await client.from('recess_schedules')
        .update({ active: false })
        .in('id', group.ids)
        .select('id,active');
      if (error) throw error;
      if ((data ?? []).length !== group.ids.length || (data ?? []).some(row => row.active)) {
        throw new Error('No se pudo confirmar la desactivación.');
      }
      await load();
      toast.success('Programación desactivada. El historial de pedidos se conserva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo desactivar la programación.');
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <Clock3 className="h-7 w-7 text-emerald-500" />
          <h1 className="text-2xl font-black">Horarios de recreo</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Configura cada descanso una sola vez para toda la semana y marca los días en que aplica. Se asigna a una sección completa.</p>
      </div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </div>

    <Card className="p-5">
      <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-500" /><h2 className="font-black">Programación semanal</h2></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div><Label>Nombre del descanso</Label><select value={name} onChange={event => setName(event.target.value as (typeof recessNames)[number])} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">{recessNames.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><Label>Hora de inicio</Label><Input className="mt-1" type="time" value={start} onChange={event => setStart(event.target.value)} /></div>
        <div><Label>Hora de finalización</Label><Input className="mt-1" type="time" value={end} onChange={event => setEnd(event.target.value)} /></div>
        <div><Label>Sección</Label><select value={selectedSection} onChange={event => setSelectedSection(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">{sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></div>
      </div>
      <fieldset className="mt-5">
        <legend className="text-sm font-bold">Días de la semana</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {weekdays.map(day => <label key={day.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${selectedDays.includes(day.value) ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground'}`}>
            <input type="checkbox" checked={selectedDays.includes(day.value)} onChange={() => toggleDay(day.value)} className="accent-emerald-600" />
            {day.label}
          </label>)}
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-muted-foreground">Los días desmarcados se desactivarán para esta combinación de sección y descanso; no se borrará el historial de pedidos.</p>
      <Button className="mt-4" onClick={() => void saveWeeklySchedule()} disabled={saving || sections.length === 0 || selectedDays.length === 0}>
        <Plus className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : 'Guardar semana'}
      </Button>
      {sections.length === 0 && <p className="mt-2 text-xs text-amber-600">No hay secciones activas para asignar.</p>}
    </Card>

    <Card className="p-5">
      <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-emerald-500" /><h2 className="font-black">Límite de pedidos anticipados</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Cantidad máxima de pedidos que cada estudiante puede anticipar para una misma fecha y descanso, antes de su hora de inicio.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full max-w-xs"><Label>Pedidos anticipados por estudiante</Label><Input className="mt-1" type="number" min={1} max={2} step={1} value={preorderLimit} onChange={event => setPreorderLimit(Number(event.target.value))} /></div>
        <Button onClick={() => void savePreorderLimit()} disabled={savingLimit}>{savingLimit ? 'Guardando...' : 'Guardar límite'}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Valor permitido: de 1 a 2 pedidos. El límite predeterminado es 2 y se valida en la base de datos.</p>
    </Card>

    <div className="space-y-3">
      <h2 className="font-black">Horarios configurados</h2>
      {groups.map(group => <Card key={group.key} className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${group.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{group.active ? 'Activo' : 'Inactivo'}</span>
              <h3 className="font-black">{group.name}</h3>
              <span className="text-sm text-muted-foreground">{group.startTime} – {group.endTime}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">{group.sectionName}</p>
            <div className="mt-2 flex flex-wrap gap-2">{group.days.map(dayValue => {
              const day = weekdays.find(item => item.value === dayValue);
              return <span key={dayValue} className="rounded-full bg-muted px-3 py-1 text-xs font-bold">{day?.label ?? dayValue}</span>;
            })}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void toggleGroup(group)}><Power className={`mr-2 h-4 w-4 ${group.active ? 'text-emerald-500' : 'text-slate-400'}`} />{group.active ? 'Desactivar' : 'Activar'}</Button>
            {group.active && <Button variant="outline" size="sm" onClick={() => void deactivateGroup(group)}>Desactivar semana</Button>}
          </div>
        </div>
      </Card>)}
      {groups.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Todavía no hay horarios configurados. Crea el Primer o Segundo Descanso y selecciona los días en los que aplica.</Card>}
    </div>
  </div>;
}
