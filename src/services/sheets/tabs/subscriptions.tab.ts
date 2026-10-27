import { getSheetsClient, ensureTabExists } from "../client.ts";
import { applySubTabStyling } from "../styling.ts";
import { executeSql } from "../../../prisma/db.ts";

/**
 * Sinkronisasi Tab Langganan & Subscriptions
 */
export async function syncSubscriptionsTab(
  spreadsheetId: string,
  userId?: string | null,
  locale?: string | null
): Promise<void> {
  const sheets = getSheetsClient();
  const tabName = "Langganan_Sub";
  const sheetId = await ensureTabExists(spreadsheetId, tabName, 300, 9, 7);

  const isSemicolon = !locale || locale.startsWith("id") || !locale.startsWith("en");
  const s = isSemicolon ? ";" : ",";

  const res = await executeSql(
    `SELECT s.*, w.name as wallet_name 
     FROM public."Subscription" s
     LEFT JOIN public."Wallet" w ON s."walletId" = w.id
     WHERE s."userId" = $1 OR ($1 IS NULL AND s."userId" IS NULL)
     ORDER BY s.amount DESC`,
    [userId || null]
  );
  const subs = res.rows || [];

  const headerValues = [
    ["", "SMART FINANCE • DAFTAR LANGGANAN & BIAYA RUTIN (SUBSCRIPTIONS)", "", "", "", "", "", ""],
    ["", "Pelacak Komitmen Pengeluaran Berulang Bulanan / Tahunan Pribadi", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "● TOTAL BIAYA RUTIN BULANAN", "", "▲ JUMLAH SUBSCRIPTION AKTIF", "", "◆ METODE PEMBAYARAN", "", ""],
    [
      "",
      `=SUMIF(F8:F${s} "ACTIVE"${s} C8:C)`,
      "",
      `=COUNTIF(F8:F${s} "ACTIVE")`,
      "",
      `Auto Debit / E-Wallet`,
      "",
      "",
    ],
    ["", "Komitmen Pengeluaran Tetap / Bulan", "", "Layanan Langganan Aktif", "", "Sumber Saldo Terpotong", "", ""],
    ["NO", "NAMA LAYANAN / SUBSCRIPTION", "BIAYA (RP)", "SIKLUS", "TANGGAL TAGIHAN (TGL)", "STATUS", "DOMPET PEMBAYARAN", "CATATAN"],
  ];

  const dataRows = subs.length > 0
    ? subs.map((s: any, idx: number) => {
        return [
          idx + 1,
          s.name,
          Number(s.amount || 0),
          s.billingCycle || "MONTHLY",
          s.billingDay ? `Tgl ${s.billingDay}` : "-",
          s.status || "ACTIVE",
          s.wallet_name || "ShopeePay",
          s.notes || "-",
        ];
      })
    : [["-", "Belum ada langganan terdaftar", 0, "MONTHLY", "-", "ACTIVE", "-", "Ketik 'tambah langganan spotify 28k'"]];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A1:H300`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:H${7 + dataRows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [...headerValues, ...dataRows] },
  });

  if (sheetId !== undefined) {
    const colWidths = [
      { index: 0, width: 50 },  // NO
      { index: 1, width: 230 }, // NAMA
      { index: 2, width: 150 }, // BIAYA
      { index: 3, width: 110 }, // SIKLUS
      { index: 4, width: 130 }, // TGL TAGIHAN
      { index: 5, width: 100 }, // STATUS
      { index: 6, width: 160 }, // DOMPET
      { index: 7, width: 220 }, // CATATAN
    ];
    await applySubTabStyling(spreadsheetId, sheetId, 7, dataRows.length, [2], colWidths);
  }
}
