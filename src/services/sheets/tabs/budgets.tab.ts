import { getSheetsClient, ensureTabExists } from "../client.ts";
import { applySubTabStyling } from "../styling.ts";
import { executeSql } from "../../../prisma/db.ts";

/**
 * Sinkronisasi Tab Budget & Monitoring Anggaran
 */
export async function syncBudgetsTab(
  spreadsheetId: string,
  userId?: string | null,
  yearStr: string = "2026",
  locale?: string | null
): Promise<void> {
  const sheets = getSheetsClient();
  const tabName = "Budget_Anggaran";
  const rawTabName = `Data_${yearStr}`;
  const sheetId = await ensureTabExists(spreadsheetId, tabName, 300, 9, 7);

  const isSemicolon = !locale || locale.startsWith("id") || !locale.startsWith("en");
  const s = isSemicolon ? ";" : ",";

  const res = await executeSql(
    `SELECT b.*, c.name as category_name 
     FROM public."Budget" b
     LEFT JOIN public."Category" c ON b."categoryId" = c.id
     WHERE b."userId" = $1 OR ($1 IS NULL AND b."userId" IS NULL)
     ORDER BY b.amount DESC`,
    [userId || null]
  );
  const budgets = res.rows || [];

  const headerValues = [
    ["", "SMART FINANCE • MONITORING & TARGET ANGGARAN BULANAN", "", "", "", "", "", ""],
    ["", "Batas Maksimal Pengeluaran per Kategori untuk Mencegah Boncos • Real-Time", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "● TOTAL TARGET ANGGARAN", "", "▲ TOTAL TERPAKAI BULAN INI", "", "▼ SISA ANGGARAN TERSEDIA", "", ""],
    [
      "",
      `=SUM(D8:D)`,
      "",
      `=SUM(E8:E)`,
      "",
      `=B5-D5`,
      "",
      "",
    ],
    ["", "Alokasi Maksimal Per Bulan", "", "Realisasi Pengeluaran Berjalan", "", "Sisa Kuota Belanja Aman", "", ""],
    ["NO", "KATEGORI", "PERIODE", "TARGET ANGGARAN (RP)", "REALISASI TERPAKAI (RP)", "SISA ANGGARAN (RP)", "STATUS (%)", "EVALUASI"],
  ];

  const dataRows = budgets.length > 0
    ? budgets.map((b: any, idx: number) => {
        const rowNum = 8 + idx;
        const catName = b.category_name || "Lainnya";
        const terpakaiFormula = `=IFERROR(SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$E$2:$E${s} B${rowNum}${s} ${rawTabName}!$D$2:$D${s} "EXPENSE")${s} 0)`;
        const sisaFormula = `=D${rowNum}-E${rowNum}`;
        const statusFormula = `=IF(D${rowNum}>0${s} TEXT(E${rowNum}/D${rowNum}${s} "0.0%")${s} "0%")`;
        const evaluasiFormula = `=IF(E${rowNum}>D${rowNum}${s} "⚠️ OVERBUDGET"${s} IF(E${rowNum}>0.8*D${rowNum}${s} "⚡ MENDEKATI BATAS"${s} "✅ AMAN"))`;

        return [
          idx + 1,
          catName,
          b.period || "MONTHLY",
          Number(b.amount || 0),
          terpakaiFormula,
          sisaFormula,
          statusFormula,
          evaluasiFormula,
        ];
      })
    : [["-", "Belum ada budget yang diatur", "MONTHLY", 0, 0, 0, "0%", "Ketik 'set budget makan 500rb'"]];

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
      { index: 1, width: 220 }, // KATEGORI
      { index: 2, width: 100 }, // PERIODE
      { index: 3, width: 170 }, // TARGET
      { index: 4, width: 170 }, // TERPAKAI
      { index: 5, width: 170 }, // SISA
      { index: 6, width: 100 }, // STATUS %
      { index: 7, width: 160 }, // EVALUASI
    ];
    await applySubTabStyling(spreadsheetId, sheetId, 7, dataRows.length, [3, 4, 5], colWidths);
  }
}
