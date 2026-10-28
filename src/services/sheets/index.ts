import { executeSql } from "../../prisma/db.ts";
import { getSheetsClient, getClientEmail, extractSpreadsheetId, verifyAccess, ensureTabExists } from "./client.ts";
import { MONTH_NAMES } from "./constants.ts";
import { applyDashboardLayout } from "./tabs/dashboard.tab.ts";
import { syncDebtsTab } from "./tabs/debts.tab.ts";
import { syncAssetsTab } from "./tabs/assets.tab.ts";
import { syncBudgetsTab } from "./tabs/budgets.tab.ts";
import { syncSubscriptionsTab } from "./tabs/subscriptions.tab.ts";

export class GoogleSheetsService {
  public getClientEmail(): string {
    return getClientEmail();
  }

  public extractSpreadsheetId(urlOrId: string): string | null {
    return extractSpreadsheetId(urlOrId);
  }

  public async verifyAccess(spreadsheetId: string) {
    return verifyAccess(spreadsheetId);
  }

  public getMonthLabel(date: Date): string {
    const monthIdx = date.getMonth(); // 0 - 11
    return MONTH_NAMES[monthIdx] || MONTH_NAMES[0];
  }

  public async ensureTabExists(
    spreadsheetId: string,
    tabName: string,
    rowCount: number = 300,
    columnCount: number = 10,
    frozenRowCount: number = 7
  ): Promise<number | undefined> {
    return ensureTabExists(spreadsheetId, tabName, rowCount, columnCount, frozenRowCount);
  }

  /**
   * Inisialisasi sheet/tab tahunan dengan Dashboard Minimalis & Dropdown Filter Periode/Bulan
   */
  public async ensureYearTab(spreadsheetId: string, year: number | string): Promise<string> {
    const sheets = getSheetsClient();
    const tabName = String(year);
    const rawTabName = `Data_${year}`;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });

    // 1. Pastikan tab master transaksi mentah (Data_{year}) ada
    const rawExisting = meta.data.sheets?.find((s) => s.properties?.title === rawTabName);
    if (!rawExisting) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: rawTabName,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 11,
                  },
                },
              },
            },
          ],
        },
      });

      // Tulis header master tabel mentah (termasuk kolom K untuk TANGGAL_ISO)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${rawTabName}'!A1:K1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["NO", "TANGGAL & WAKTU", "BULAN", "TIPE", "KATEGORI", "DOMPET", "KETERANGAN", "NOMINAL (RP)", "PERANGKAT", "WHATSAPP SENDER", "TANGGAL_ISO"]],
        },
      });
    }

    // 2. Pastikan tab Dashboard Interaktif ({year}) ada
    const existing = meta.data.sheets?.find((s) => s.properties?.title === tabName);
    let sheetId: number | undefined;

    if (!existing) {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tabName,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 12,
                    frozenRowCount: 15,
                  },
                },
              },
            },
          ],
        },
      });
      sheetId = addRes.data.replies?.[0].addSheet?.properties?.sheetId ?? undefined;
    } else {
      sheetId = existing.properties?.sheetId ?? undefined;
    }

    // 3. Hapus tab bawaan kosong (seperti Sheet1 / Lembar1) jika ada dan jumlah sheet > 1
    const defaultSheet = meta.data.sheets?.find((s) => {
      const t = (s.properties?.title || "").toLowerCase().trim();
      return (t.startsWith("sheet") || t.startsWith("lembar")) && s.properties?.title !== tabName && s.properties?.title !== rawTabName;
    });

    if (defaultSheet && (meta.data.sheets?.length || 0) > 1 && defaultSheet.properties?.sheetId !== undefined) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId: defaultSheet.properties.sheetId,
                },
              },
            ],
          },
        });
        console.log(`[GoogleSheets] Berhasil menghapus tab bawaan: ${defaultSheet.properties.title}`);
      } catch (delErr) {
        console.warn("[GoogleSheets] Gagal menghapus tab bawaan:", delErr);
      }
    }

    // 4. Terapkan Layout Minimalis & Rumus Dashboard Dinamis + Dynamic Table FILTER
    await applyDashboardLayout(spreadsheetId, tabName, sheetId, tabName, meta.data.properties?.locale);

    return tabName;
  }

  /**
   * Menambahkan baris transaksi baru ke sheet tahun bersangkutan
   */
  public async appendTransaction(
    spreadsheetId: string,
    tx: {
      type: "INCOME" | "EXPENSE";
      amount: bigint | number;
      description: string;
      category: string;
      wallet: string;
      createdAt?: Date | string;
      deviceType?: string;
      jid?: string;
    }
  ): Promise<void> {
    const sheets = getSheetsClient();
    const date = tx.createdAt ? new Date(tx.createdAt) : new Date();
    const year = date.getFullYear();
    const rawTabName = `Data_${year}`;
    await this.ensureYearTab(spreadsheetId, year);

    // Ambil jumlah baris transaksi saat ini di Data_{year} untuk menghitung nomor urut
    const rangeData = `'${rawTabName}'!A2:A`;
    let nextIndex = 1;
    try {
      const existingRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: rangeData,
      });
      if (existingRows.data.values) {
        nextIndex = existingRows.data.values.length + 1;
      }
    } catch {}

    const formattedDate = date.toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const monthLabel = this.getMonthLabel(date);
    const amountVal = typeof tx.amount === "bigint" ? Number(tx.amount) : tx.amount;
    const deviceIcon = tx.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱 (@s.whatsapp.net)";

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const isoDate = `${y}-${m}-${d}`;

    const row = [
      nextIndex,
      formattedDate,
      monthLabel,
      tx.type,
      tx.category,
      tx.wallet,
      tx.description,
      amountVal,
      deviceIcon,
      tx.jid || "-",
      isoDate,
    ];

    // Simpan ke tab master transaksi mentah Data_{year} (kolom A sampai K)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${rawTabName}'!A2:K`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });
  }

  public async syncDebtsTab(spreadsheetId: string, userId?: string | null, locale?: string | null): Promise<void> {
    return syncDebtsTab(spreadsheetId, userId, locale);
  }

  public async syncAssetsTab(spreadsheetId: string, userId?: string | null): Promise<void> {
    return syncAssetsTab(spreadsheetId, userId);
  }

  public async syncBudgetsTab(
    spreadsheetId: string,
    userId?: string | null,
    yearStr: string = "2026",
    locale?: string | null
  ): Promise<void> {
    return syncBudgetsTab(spreadsheetId, userId, yearStr, locale);
  }

  public async syncSubscriptionsTab(spreadsheetId: string, userId?: string | null, locale?: string | null): Promise<void> {
    return syncSubscriptionsTab(spreadsheetId, userId, locale);
  }

  /**
   * Sinkronisasi seluruh transaksi personal user yang ada di DB ke Google Sheets
   * Sekaligus menyinkronkan seluruh tab modular (Hutang, Aset, Budget, Subscriptions)
   */
  public async syncAllUserTransactions(
    userId: string,
    spreadsheetId: string
  ): Promise<{ syncedCount: number; error?: string }> {
    try {
      const sheets = getSheetsClient();
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const locale = meta.data.properties?.locale;
      const currentYear = new Date().getFullYear();

      // Selalu sinkronkan seluruh tab modular (Hutang, Aset, Budget, Subscriptions)
      await this.syncDebtsTab(spreadsheetId, userId, locale);
      await this.syncAssetsTab(spreadsheetId, userId);
      await this.syncBudgetsTab(spreadsheetId, userId, String(currentYear), locale);
      await this.syncSubscriptionsTab(spreadsheetId, userId, locale);

      // Ambil transaksi user yang bersangkutan beserta nama wallet dan kategorinya
      const res = await executeSql(
        `SELECT t.*, w.name as wallet_name, c.name as category_name 
         FROM public."Transaction" t
         LEFT JOIN public."Wallet" w ON t."walletId" = w.id
         LEFT JOIN public."Category" c ON t."categoryId" = c.id
         WHERE (t."userId" = $1 OR t."userId" IS NULL)
         ORDER BY t."createdAt" ASC`,
        [userId]
      );

      const rows = res.rows || [];

      // Kelompokkan transaksi berdasarkan tahun
      const byYear = new Map<number, any[]>();
      for (const row of rows) {
        const d = new Date(row.createdAt);
        const y = d.getFullYear();
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(row);
      }

      // Pastikan tahun berjalan terdaftar agar ter-clear jika kosong
      const allYearsToProcess = new Set<number>([currentYear, ...byYear.keys()]);

      // Cari semua tab Data_{year} yang ada di spreadsheet untuk dibersihkan jika tidak ada datanya lagi
      const rawSheets = meta.data.sheets?.filter((s) => s.properties?.title?.startsWith("Data_")) || [];
      for (const s of rawSheets) {
        const title = s.properties?.title;
        if (title) {
          const m = title.match(/^Data_(\d{4})$/);
          if (m) allYearsToProcess.add(parseInt(m[1], 10));
        }
      }

      let totalSynced = 0;
      for (const year of allYearsToProcess) {
        const tabName = await this.ensureYearTab(spreadsheetId, year);
        const rawTabName = `Data_${year}`;
        const txList = byYear.get(year) || [];

        // Bersihkan dulu area transaksi mentah lama di Data_{year} (kolom A - K)
        try {
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${rawTabName}'!A2:K`,
          });
        } catch {}

        if (txList.length > 0) {
          const dataRows = txList.map((t, idx) => {
            const date = new Date(t.createdAt);
            const formattedDate = date.toLocaleString("id-ID", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const monthLabel = this.getMonthLabel(date);
            const dev = t.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱 (@s.whatsapp.net)";
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const d = String(date.getDate()).padStart(2, "0");
            const isoDate = `${y}-${m}-${d}`;

            return [
              idx + 1,
              formattedDate,
              monthLabel,
              t.type,
              t.category_name || "Lainnya",
              t.wallet_name || "Cash",
              t.description,
              Number(t.amount),
              dev,
              t.jid || "-",
              isoDate,
            ];
          });

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${rawTabName}'!A2:K${1 + dataRows.length}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: dataRows },
          });

          totalSynced += dataRows.length;
        }

        // Pastikan formula filter dinamis di tab tahun berjalan tetap ada dan bersih
        await applyDashboardLayout(spreadsheetId, tabName, undefined, String(year), locale);
      }

      return { syncedCount: totalSynced };

      // Update flag isSyncedToSheet di DB
      await executeSql(
        `UPDATE public."Transaction" SET "isSyncedToSheet" = true WHERE "userId" = $1`,
        [userId]
      );

      return { syncedCount: totalSynced };
    } catch (err: any) {
      console.error("[GoogleSheets] Gagal sinkronisasi data:", err);
      return { syncedCount: 0, error: err.message };
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
