import { create } from 'zustand';
import { requireSupabaseClient, signInWithPasswordWithRetry, type Profile } from '../lib/supabase';
import { writeAuditLog } from '../lib/auditLog';
import { getProfile } from '../repositories/quickbiteRepository';
import { canAccessAdmin } from '../lib/access';

const ACTIVE_STUDENT_STORAGE_KEY = 'quickbite.parent.activeStudent';

function clearDelegatedStudentContext() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY);
}

interface AuthState {
  user: Profile | null;
  session: { token: string } | null;
  loading: boolean;
  setUser: (user: Profile | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string, inviteCode: string) => Promise<void>;
  checkSession: () => Promise<void>;
  authEpoch: number;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  authEpoch: 0,
  setUser: (user) => set((state) => ({ user, loading: false, authEpoch: state.authEpoch + 1 })),

  signIn: async (email, password) => {
    clearDelegatedStudentContext();
    const supabase = requireSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await signInWithPasswordWithRetry(supabase, { email: normalizedEmail, password });
    if (error || !data.user) {
      writeAuditLog({ action: 'auth.error', actorEmail: normalizedEmail, metadata: { reason: error?.message } });
      throw new Error('Correo o contraseña incorrectos.');
    }
    const profile = await getProfile(data.user.id);
    if (!profile || !canAccessAdmin(profile.role)) {
      await supabase.auth.signOut();
      writeAuditLog({ action: 'auth.error', actorEmail: normalizedEmail, metadata: { reason: 'not_admin' } });
      throw new Error('No tienes permisos de administrador.');
    }
    writeAuditLog({ action: 'auth.login', actorId: profile.id, actorEmail: profile.email });
    set((state) => ({ user: profile, session: { token: data.session?.access_token ?? '' }, loading: false, authEpoch: state.authEpoch + 1 }));
  },

  signUp: async (email, password, fullName, inviteCode) => {
    clearDelegatedStudentContext();
    const supabase = requireSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { full_name: fullName.trim(), role: 'admin' } } });
    if (error) {
      writeAuditLog({ action: 'auth.error', actorEmail: normalizedEmail, metadata: { reason: error.message } });
      throw new Error(error.message);
    }
    const userId = data.user?.id;
    if (!userId) throw new Error('No se pudo obtener el ID del usuario.');
    const { error: rpcError } = await supabase.rpc('create_admin_profile', { p_user_id: userId, p_email: normalizedEmail, p_full_name: fullName.trim(), p_invite_code: inviteCode });
    if (rpcError) {
      writeAuditLog({ action: 'auth.error', actorEmail: normalizedEmail, metadata: { reason: rpcError.message } });
      throw new Error('Error al crear el perfil: ' + rpcError.message);
    }
    if (!data.session) {
      writeAuditLog({ action: 'auth.signup', actorId: userId, actorEmail: normalizedEmail, metadata: { role: 'admin', pending_confirmation: true } });
      throw new Error('CONFIRM_EMAIL');
    }
    const profile = await getProfile(userId);
    writeAuditLog({ action: 'auth.signup', actorId: userId, actorEmail: normalizedEmail, metadata: { role: 'admin' } });
    set((state) => ({ user: profile, session: profile ? { token: data.session?.access_token ?? '' } : null, loading: false, authEpoch: state.authEpoch + 1 }));
  },

  signOut: async () => {
    clearDelegatedStudentContext();
    const supabase = requireSupabaseClient();
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        try {
          const profile = await getProfile(data.user.id);
          if (profile) {
            await writeAuditLog({ action: 'auth.logout', actorId: profile.id, actorEmail: profile.email });
          }
        } catch {
          // Audit/profile lookup must never prevent the actual logout.
        }
      }
    } catch {
      // Local auth state is still cleared even if the remote session cannot be read.
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        set((state) => ({ user: null, session: null, loading: false, authEpoch: state.authEpoch + 1 }));
      }
    }
  },

  checkSession: async () => {
    const bootstrapEpoch = get().authEpoch;
    try {
      const supabase = requireSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (get().authEpoch !== bootstrapEpoch) return;
      const userId = data.session?.user.id;
      if (!userId) {
        set({ loading: false, user: null, session: null });
        return;
      }
      const profile = await getProfile(userId);
      if (get().authEpoch !== bootstrapEpoch) return;
      set({ user: profile, session: profile ? { token: data.session?.access_token ?? '' } : null, loading: false });
    } catch {
      if (get().authEpoch !== bootstrapEpoch) return;
      set({ loading: false, user: null, session: null });
    }
  },
}));
