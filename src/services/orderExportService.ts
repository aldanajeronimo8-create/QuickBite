/**
 * Compatibility entry point for integrations that used the former export
 * service. It deliberately produces no file: sales are now closed through the
 * secured Google Sheets flow.
 */
export { exportActiveSalesToGoogleSheets as exportOrdersToExcel } from './googleSheetsExportService';
export { exportActiveSalesToGoogleSheets as exportWeeklyOrdersToExcel } from './googleSheetsExportService';
