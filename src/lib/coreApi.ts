export type CoreRole = 'student' | 'parent' | 'staff' | 'admin';

export type CoreUser = {
  id: string;
  email: string;
  role: CoreRole;
  fullName: string;
};

export type CoreSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CoreUser;
};

export type CoreOrder = {
  id: string;
  user_id: string;
  beneficiary_user_id?: string | null;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string;
  pickup_code: string;
  created_at: string;
};

const CORE_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const SESSION_KEY = 'quickbite.core.staff.session';

function requireBaseUrl() {
  if (!CORE_API_BASE_URL) throw new Error('VITE_API_BASE_URL no está configurada.');
  return CORE_API_BASE_URL;
}

export function getStaffCoreSession(): CoreSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CoreSession) : null;
  } catch {
    return null;
  }
}

export function saveStaffCoreSession(session: CoreSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStaffCoreSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getStaffCoreSession();
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (session?.accessToken) headers.set('authorization', `Bearer ${session.accessToken}`);

  const response = await fetch(`${requireBaseUrl()}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Core API respondió ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status as the fallback message.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loginStaff(email: string, password: string) {
  const session = await request<CoreSession>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (session.user.role !== 'staff') {
    throw new Error('Esta cuenta no tiene rol de Staff.');
  }
  saveStaffCoreSession(session);
  return session;
}

export async function loadStaffOrders() {
  const response = await request<{ items: CoreOrder[] }>('/v1/orders');
  return response.items;
}

export async function updateStaffOrderStatus(orderId: string, status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled') {
  const response = await request<{ order: CoreOrder }>(`/v1/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return response.order;
}

export async function loadStaffCapabilities() {
  return request<{ role: CoreRole; operations: boolean; orders: boolean }>('/v1/capabilities');
}
