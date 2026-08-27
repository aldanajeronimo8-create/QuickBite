/**
 * Servicio de compatibilidad para las versiones anteriores de QuickBite.
 *
 * Antes este archivo generaba archivos Excel.
 * Ahora las ventas se cierran mediante Google Sheets.
 *
 * IMPORTANTE:
 * - No genera archivos .xls
 * - No genera archivos .xlsx
 * - No contiene JSX
 * - No reinicia las ventas directamente
 *
 * La lógica real está en:
 * ./googleSheetsExportService
 */

export {
  exportActiveSalesToGoogleSheets as exportOrdersToExcel,
  exportActiveSalesToGoogleSheets as exportWeeklyOrdersToExcel,
} from './googleSheetsExportService';
