import { create } from 'zustand';
import { requireSupabaseClient, type Profile } from '../lib/supabase';
import { writeAuditLog } from '../lib/auditLog';
import { getProfile } from '../repositories/quickbiteRepository';

interface AuthState {
  user: Profile | null;
  session: { token: string } | null;
  loading: boolean;
  setUser: (user: Profile | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string, inviteCode: string) => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  setUser: (user) => set({ user }),

  signIn: async (email, password) => {
    const supabase = requireSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      writeAuditLog({
        action: 'auth.error',
        actorEmail: normalizedEmail,
        metadata: { reason: error?.message },
      });
      throw new Error('Correo o contrasena incorrectos.');
    }

    const profile = await getProfile(data.user.id);
    if (!profile || !['admin', 'both'].includes(profile.role)) {
      await supabase.auth.signOut();
      writeAuditLog({
        action: 'auth.error',
        actorEmail: normalizedEmail,
        metadata: { reason: 'not_admin' },
      });
      throw new Error('No tienes permisos de administrador.');
    }

    writeAuditLog({ action: 'auth.login', actorId: profile.id, actorEmail: profile.email });
    set({ user: profile, session: { token: data.session?.access_token ?? '' }, loading: false });
  },

  signUp: async (email, password, fullName, inviteCode) => {
    const supabase = requireSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: fullName.trim(), role: 'admin' } },
    });

    if (error) {
      writeAuditLog({
        action: 'auth.error',
        actorEmail: normalizedEmail,
        metadata: { reason: error.message },
      });
      throw new Error(error.message);
    }

    const userId = data.user?.id;
    if (!userId) throw new Error('No se pudo obtener el ID del usuario.');

    const { error: rpcError } = await supabase.rpc('create_admin_profile', {
      p_user_id: userId,
      p_email: normalizedEmail,
      p_full_name: fullName.trim(),
      p_invite_code: inviteCode,
    });

    if (rpcError) {
      writeAuditLog({
        action: 'auth.error',
        actorEmail: normalizedEmail,
        metadata: { reason: rpcError.message },
      });
      throw new Error('Error al crear el perfil: ' + rpcError.message);
    }

    if (!data.session) {
      writeAuditLog({
        action: 'auth.signup',
        actorId: userId,
        actorEmail: normalizedEmail,
        metadata: { role: 'admin', pending_confirmation: true },
      });
      throw new Error('CONFIRM_EMAIL');
    }

    const profile = await getProfile(userId);
    writeAuditLog({
      action: 'auth.signup',
      actorId: userId,
      actorEmail: normalizedEmail,
      metadata: { role: 'admin' },
    });
    set({
      user: profile,
      session: profile ? { token: data.session.access_token } : null,
      loading: false,
    });
  },

  signOut: async () => {
    const supabase = requireSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const profile = data.user ? await getProfile(data.user.id) : null;
    if (profile) {
      writeAuditLog({ action: 'auth.logout', actorId: profile.id, actorEmail: profile.email });
    }
    await supabase.auth.signOut();
    set({ user: null, session: null, loading: false });
  },

  checkSession: async () => {
    try {
      const supabase = requireSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        set({ loading: false, user: null, session: null });
        return;
      }

      const profile = await getProfile(userId);
      set({
        user: profile,
        session: profile ? { token: data.session?.access_token ?? '' } : null,
        loading: false,
      });
    } catch {
      set({ loading: false, user: null, session: null });
    }
  },
}));
