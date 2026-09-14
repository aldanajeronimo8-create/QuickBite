import { useDataStore } from '../store/dataStore';
import { downloadActiveSalesExcel } from './orderExportService';

/**
 * @deprecated QuickBite now exports sales as Excel (.xlsx), not Google Sheets.
 * Kept temporarily as a compatibility wrapper for any legacy import.
 */
export type ExcelSalesExportResult = {
  exportId: string;
  exportedCount: number;
  total: number;
};

export async function exportActiveSalesToGoogleSheets(): Promise<ExcelSalesExportResult> {
  const orders = useDataStore.getState().orders;
  const result = downloadActiveSalesExcel(orders);
  return {
    exportId: crypto.randomUUID(),
    exportedCount: result.count,
    total: result.count,
  };
}
