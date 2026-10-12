import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Plus, Save, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';

type Section = { id: string; name: string; active: boolean; display_order: number };
type Grade = { id: string; section_id: string; name: string; active: boolean; display_order: number };
type Course = { id: string; grade_id: string; name: string; active: boolean; display_order: number };

export function AdminAcademicStructure() {
  const supabase = requireSupabaseClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [newSection, setNewSection] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s, error: se }, { data: g, error: ge }, { data: c, error: ce }] = await Promise.all([
        supabase.from('academic_sections').select('id,name,active,display_order').order('display_order'),
        supabase.from('academic_grades').select('id,section_id,name,active,display_order').order('display_order'),
        supabase.from('academic_courses').select('id,grade_id,name,active,display_order').order('display_order'),
      ]);
      if (se) throw se; if (ge) throw ge; if (ce) throw ce;
      setSections(s ?? []); setGrades(g ?? []); setCourses(c ?? []);
      setSelectedSection((current) => current || s?.[0]?.id || '');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo cargar la estructura académica.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const sectionGrades = useMemo(() => grades.filter((g) => g.section_id === selectedSection), [grades, selectedSection]);
  const gradeCourses = useMemo(() => courses.filter((c) => c.grade_id === selectedGrade), [courses, selectedGrade]);

  useEffect(() => { if (!sectionGrades.some((g) => g.id === selectedGrade)) setSelectedGrade(sectionGrades[0]?.id || ''); }, [sectionGrades, selectedGrade]);

  const writeError = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido al escribir en Supabase.';
  const addSection = async () => {
    const name = newSection.trim();
    if (!name) return;
    let createdId: string | null = null;
    try {
      const { data: created, error } = await supabase.from('academic_sections')
        .insert({ name, display_order: sections.length + 1 }).select('id,name').single();
      if (error) throw error;
      createdId = created.id;
      const { data: saved, error: verifyError } = await supabase.from('academic_sections')
        .select('id,name').eq('id', created.id).maybeSingle();
      if (verifyError) throw new Error(`La sección se creó, pero no se pudo comprobar su lectura: ${verifyError.message}`);
      if (!saved || saved.name !== name) throw new Error('La sección creada no coincide con los datos enviados.');
      setNewSection('');
      await load();
      toast.success('Sección creada y verificada en Supabase.');
    } catch (error) {
      if (createdId) toast.warning(`La sección se creó, pero falta verificarla: ${writeError(error)}`);
      else toast.error(`No se pudo crear la sección: ${writeError(error)}`);
    }
  };

  const addGrade = async () => {
    const name = newGrade.trim();
    if (!name || !selectedSection) return;
    let createdId: string | null = null;
    try {
      const { data: created, error } = await supabase.from('academic_grades')
        .insert({ section_id: selectedSection, name, display_order: sectionGrades.length + 1 }).select('id,name,section_id').single();
      if (error) throw error;
      createdId = created.id;
      const { data: saved, error: verifyError } = await supabase.from('academic_grades')
        .select('id,name,section_id').eq('id', created.id).maybeSingle();
      if (verifyError) throw new Error(`El grado se creó, pero no se pudo comprobar su lectura: ${verifyError.message}`);
      if (!saved || saved.name !== name || saved.section_id !== selectedSection) throw new Error('El grado creado no coincide con los datos enviados.');
      setNewGrade('');
      await load();
      toast.success('Grado creado y verificado en Supabase.');
    } catch (error) {
      if (createdId) toast.warning(`El grado se creó, pero falta verificarlo: ${writeError(error)}`);
      else toast.error(`No se pudo crear el grado: ${writeError(error)}`);
    }
  };

  const addCourse = async () => {
    const name = newCourse.trim().toUpperCase();
    if (!name || !selectedGrade) return;
    let createdId: string | null = null;
    try {
      const { data: created, error } = await supabase.from('academic_courses')
        .insert({ grade_id: selectedGrade, name, display_order: gradeCourses.length + 1 }).select('id,name,grade_id').single();
      if (error) throw error;
      createdId = created.id;
      const { data: saved, error: verifyError } = await supabase.from('academic_courses')
        .select('id,name,grade_id').eq('id', created.id).maybeSingle();
      if (verifyError) throw new Error(`El curso se creó, pero no se pudo comprobar su lectura: ${verifyError.message}`);
      if (!saved || saved.name !== name || saved.grade_id !== selectedGrade) throw new Error('El curso creado no coincide con los datos enviados.');
      setNewCourse('');
      await load();
      toast.success('Curso creado y verificado en Supabase.');
    } catch (error) {
      if (createdId) toast.warning(`El curso se creó, pero falta verificarlo: ${writeError(error)}`);
      else toast.error(`No se pudo crear el curso: ${writeError(error)}`);
    }
  };

  const toggle = async (table: string, id: string, active: boolean) => {
    try {
      const { data, error } = await supabase.from(table).update({ active: !active }).eq('id', id).select('id,active').single();
      if (error) throw error;
      if (!data || data.active !== !active) throw new Error('Supabase no devolvió el nuevo estado de forma consistente.');
      await load();
      toast.success('Estado actualizado y verificado en Supabase.');
    } catch (error) {
      toast.error(`No se pudo confirmar el cambio de estado: ${writeError(error)}`);
    }
  };

  const remove = async (table: string, id: string) => {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      const { data: remaining, error: verifyError } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
      if (verifyError) throw new Error(`La eliminación se envió, pero no se pudo comprobar la ausencia: ${verifyError.message}`);
      if (remaining) throw new Error('El registro todavía existe en Supabase; no se confirmó la eliminación.');
      await load();
      toast.success('Elemento eliminado y ausencia verificada en Supabase.');
    } catch (error) {
      toast.error(`No se pudo confirmar la eliminación: ${writeError(error)}`);
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-3"><GraduationCap className="h-7 w-7 text-emerald-500" /><h1 className="text-2xl font-black">Estructura académica</h1></div><p className="mt-1 text-sm text-muted-foreground">Configura secciones, grados y cursos sin tocar el código.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </div>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-5"><h2 className="mb-4 font-black">Secciones</h2><div className="space-y-2">{sections.map((s) => <div key={s.id} className={`flex items-center gap-2 rounded-xl border p-3 ${selectedSection === s.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-border'}`}><button className="flex-1 text-left font-bold" onClick={() => setSelectedSection(s.id)}>{s.name}</button><Switch checked={s.active} onCheckedChange={() => void toggle('academic_sections', s.id, s.active)} /><button aria-label={`Eliminar ${s.name}`} onClick={() => void remove('academic_sections', s.id)} className="p-1 text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}</div><div className="mt-4 space-y-2"><Label>Nueva sección</Label><div className="flex gap-2"><Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Sección 5" /><Button onClick={() => void addSection()}><Plus className="h-4 w-4" /></Button></div></div></Card>

      <Card className="p-5"><h2 className="mb-4 font-black">Grados</h2><div className="mb-4 rounded-xl bg-muted p-3 text-sm">{sections.find((s) => s.id === selectedSection)?.name || 'Selecciona una sección'}</div><div className="space-y-2">{sectionGrades.map((g) => <div key={g.id} className={`flex items-center gap-2 rounded-xl border p-3 ${selectedGrade === g.id ? 'border-blue-500 bg-blue-500/10' : 'border-border'}`}><button className="flex-1 text-left font-bold" onClick={() => setSelectedGrade(g.id)}>{g.name}</button><Switch checked={g.active} onCheckedChange={() => void toggle('academic_grades', g.id, g.active)} /><button aria-label={`Eliminar ${g.name}`} onClick={() => void remove('academic_grades', g.id)} className="p-1 text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}</div><div className="mt-4 space-y-2"><Label>Nuevo grado</Label><div className="flex gap-2"><Input value={newGrade} onChange={(e) => setNewGrade(e.target.value)} placeholder="12°" disabled={!selectedSection} /><Button onClick={() => void addGrade()} disabled={!selectedSection}><Plus className="h-4 w-4" /></Button></div></div></Card>

      <Card className="p-5"><h2 className="mb-4 font-black">Cursos</h2><div className="mb-4 rounded-xl bg-muted p-3 text-sm">{sectionGrades.find((g) => g.id === selectedGrade)?.name || 'Selecciona un grado'}</div><div className="space-y-2">{gradeCourses.map((c) => <div key={c.id} className="flex items-center gap-2 rounded-xl border border-border p-3"><span className="flex-1 font-bold">{c.name}</span><Switch checked={c.active} onCheckedChange={() => void toggle('academic_courses', c.id, c.active)} /><button aria-label={`Eliminar ${c.name}`} onClick={() => void remove('academic_courses', c.id)} className="p-1 text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}</div><div className="mt-4 space-y-2"><Label>Nuevo curso</Label><div className="flex gap-2"><Input value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="D" disabled={!selectedGrade} /><Button onClick={() => void addCourse()} disabled={!selectedGrade}><Save className="h-4 w-4" /></Button></div></div></Card>
    </div>
  </div>;
}
