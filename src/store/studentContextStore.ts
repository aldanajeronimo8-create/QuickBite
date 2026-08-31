import { create } from 'zustand';

export interface ActingStudent {
  id: string;
  full_name: string;
  email: string;
  grade: string | null;
  ti: string | null;
}

interface StudentContextState {
  activeStudent: ActingStudent | null;
  setActiveStudent: (student: ActingStudent) => void;
  clearActiveStudent: () => void;
}

const STORAGE_KEY = 'quickbite.parent.activeStudent';

function readStoredStudent(): ActingStudent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActingStudent) : null;
  } catch {
    return null;
  }
}

export const useStudentContextStore = create<StudentContextState>((set) => ({
  activeStudent: readStoredStudent(),
  setActiveStudent: (student) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
    set({ activeStudent: student });
  },
  clearActiveStudent: () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    set({ activeStudent: null });
  },
}));
