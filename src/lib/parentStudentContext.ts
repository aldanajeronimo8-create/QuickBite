export interface ParentStudentContext {
  parentUserId: string;
  studentUserId: string;
  studentName: string;
  studentEmail: string;
  studentGrade?: string | null;
  studentTi?: string | null;
}

const STORAGE_KEY = 'quickbite.parent.activeStudent';

export function getParentStudentContext(): ParentStudentContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParentStudentContext>;
    if (!parsed.parentUserId || !parsed.studentUserId || !parsed.studentName || !parsed.studentEmail) return null;
    return parsed as ParentStudentContext;
  } catch {
    return null;
  }
}

export function setParentStudentContext(context: ParentStudentContext) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  window.dispatchEvent(new Event('quickbite-parent-student-context'));
}

export function clearParentStudentContext() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('quickbite-parent-student-context'));
}

export async function clearParentStudentContextServer() {
  const { requireSupabaseClient } = await import('./supabase');
  try {
    const { error } = await requireSupabaseClient().rpc('clear_parent_active_student');
    if (error) throw error;
  } finally {
    clearParentStudentContext();
  }
}
