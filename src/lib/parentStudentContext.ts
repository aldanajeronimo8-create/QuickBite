export interface ParentStudentContext {
  parentUserId: string;
  studentUserId: string;
  studentName: string;
  studentEmail: string;
  studentGrade?: string | null;
}

const STORAGE_KEY = 'quickbite_parent_student_context';

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
  window.dispatchEvent(new CustomEvent('quickbite-parent-student-context', { detail: context }));
}

export function clearParentStudentContext() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('quickbite-parent-student-context'));
}
