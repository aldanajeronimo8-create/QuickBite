import { appConfig } from '../config/appConfig';
import { requireSupabaseClient } from '../lib/supabase';

export type GoogleSheetsExportResult = { exportId: string; exportedCount: number; total: number };

export async function exportActiveSalesToGoogleSheets(): Promise<GoogleSheetsExportResult> {
  if (!appConfig.apiBaseUrl) {
    throw new Error('La exportación a Google Sheets no está configurada. Define VITE_API_BASE_URL.');
  }
  const { data } = await requireSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

  const response = await fetch(`${appConfig.apiBaseUrl}/api/export-google-sheets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = (await response.json().catch(() => ({}))) as Partial<GoogleSheetsExportResult> & {
    error?: string;
  };
  if (!response.ok || !body.exportId || typeof body.exportedCount !== 'number') {
    throw new Error(body.error || 'No se pudo conectar con Google Sheets. Las ventas permanecen intactas.');
  }
  return { exportId: body.exportId, exportedCount: body.exportedCount, total: Number(body.total ?? 0) };
}
