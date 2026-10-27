/**
 * Google Sheets Service (Modularized Entry Point)
 * 
 * Modul dipecah ke dalam src/services/sheets/:
 * - client.ts: Inisialisasi API Google Sheets, OAuth JWT, & Utilitas Akses
 * - constants.ts: Dropdown pilihan bulan, kategori default, & dompet default
 * - styling.ts: Utilitas formatting visual & header/KPI sub-tab
 * - tabs/dashboard.tab.ts: Tata letak interaktif, KPI cards, filter periode dinamis & live search
 * - tabs/debts.tab.ts: Sinkronisasi tab buku hutang & piutang
 * - tabs/assets.tab.ts: Sinkronisasi tab inventaris aset & valuasi harta
 * - tabs/budgets.tab.ts: Sinkronisasi tab monitoring target anggaran bulanan
 * - tabs/subscriptions.tab.ts: Sinkronisasi tab daftar langganan rutin
 * - index.ts: Kelas utama GoogleSheetsService
 */

export * from "./sheets/index.ts";
export * from "./sheets/constants.ts";
export * from "./sheets/client.ts";
export * from "./sheets/styling.ts";
export { googleSheetsService, GoogleSheetsService } from "./sheets/index.ts";
