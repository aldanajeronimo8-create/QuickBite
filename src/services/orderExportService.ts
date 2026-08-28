import { appConfig } from '../config/appConfig';
import { requireSupabaseClient } from '../lib/supabase';

export interface ActiveSalesExportResult { count: number; batchId: string; }
export interface WeeklyOrderExportResult extends ActiveSalesExportResult { fileName: string; weekStartIso: string; }

function exportEndpoint() {
  const baseUrl = appConfig.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('La exportación a Google Sheets no está configurada.');
  return `${baseUrl}/api/export-google-sheets`;
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return 'No tienes autorización para realizar esta operación.';
  if (status >= 500) return 'No fue posible conectar con el servicio de Google Sheets. Las ventas no fueron reiniciadas.';
  return 'No fue posible enviar las ventas a Google Sheets. Las ventas no fueron reiniciadas.';
}

export async function exportActiveSalesToGoogleSheets(): Promise<ActiveSalesExportResult> {
  const { data, error } = await requireSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('No tienes autorización para realizar esta operación.');
  let response: Response;
  try {
    response = await fetch(exportEndpoint(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    throw new Error('No fue posible conectar con el servicio de Google Sheets. Las ventas no fueron reiniciadas.');
  }
  let payload: { count?: unknown; batchId?: unknown } | null = null;
  try { payload = (await response.json()) as { count?: unknown; batchId?: unknown }; } catch { /* invalid response */ }
  if (!response.ok) throw new Error(errorForStatus(response.status));
  const count = Number(payload?.count);
  const batchId = typeof payload?.batchId === 'string' ? payload.batchId : '';
  if (!Number.isInteger(count) || count < 0 || !batchId) {
    throw new Error('No fue posible enviar las ventas a Google Sheets. Las ventas no fueron reiniciadas.');
  }
  return { count, batchId };
}

/** @deprecated Kept for compatibility; it now exports active sales to Google Sheets. */
export async function exportWeeklyOrdersToExcel(): Promise<WeeklyOrderExportResult> {
  const result = await exportActiveSalesToGoogleSheets();
  return { ...result, fileName: '', weekStartIso: new Date().toISOString() };
}

/** @deprecated Kept for compatibility; no local Excel file is generated. */
export const exportOrdersToExcel = exportWeeklyOrdersToExcel;