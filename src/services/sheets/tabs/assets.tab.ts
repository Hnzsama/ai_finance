import { getSheetsClient, ensureTabExists } from "../client.ts";
import { applySubTabStyling } from "../styling.ts";
import { executeSql } from "../../../prisma/db.ts";

/**
 * Sinkronisasi Tab Aset & Kekayaan
 */
export async function syncAssetsTab(
  spreadsheetId: string,
  userId?: string | null
): Promise<void> {
  const sheets = getSheetsClient();
  const tabName = "Aset_Kekayaan";
  const sheetId = await ensureTabExists(spreadsheetId, tabName, 300, 8, 7);

  const res = await executeSql(
    `SELECT * FROM public."Asset" 
     WHERE "userId" = $1 OR ($1 IS NULL AND "userId" IS NULL)
     ORDER BY "value" DESC`,
    [userId || null]
  );
  const assets = res.rows || [];

  const headerValues = [
    ["", "SMART FINANCE • INVENTARIS & PORTOFOLIO ASET", "", "", "", "", ""],
    ["", "Daftar Kepemilikan Aset Fisik, Kendaraan, Elektronik & Simpanan Investasi", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["", "● TOTAL ESTIMASI NILAI SELURUH ASET", "", "▲ JUMLAH ITEM ASET", "", "◆ KATEGORI PORTOFOLIO", ""],
    [
      "",
      `=SUM(D8:D)`,
      "",
      `=COUNTA(B8:B)`,
      "",
      `Portofolio Aset`,
      "",
    ],
    ["", "Valuasi Net Worth Harta Fisik & Investasi", "", "Total Barang / Unit Terdaftar", "", "Investasi & Operasional", ""],
    ["NO", "NAMA ASET", "KATEGORI", "ESTIMASI NILAI PASAR (RP)", "CATATAN / KONDISI", "TANGGAL INPUT", "TERAKHIR DIUPDATE"],
  ];

  const dataRows = assets.length > 0
    ? assets.map((a: any, idx: number) => {
        const created = a.createdAt ? new Date(a.createdAt).toLocaleDateString("id-ID") : "-";
        const updated = a.updatedAt ? new Date(a.updatedAt).toLocaleDateString("id-ID") : "-";
        return [
          idx + 1,
          a.name,
          a.category || "GENERAL",
          Number(a.value || 0),
          a.notes || "-",
          created,
          updated,
        ];
      })
    : [["-", "Belum ada aset terdaftar", "-", 0, "Catat motor, laptop, hp atau emas Anda", "-", "-"]];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A1:G300`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:G${7 + dataRows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [...headerValues, ...dataRows] },
  });

  if (sheetId !== undefined) {
    const colWidths = [
      { index: 0, width: 50 },  // NO
      { index: 1, width: 240 }, // NAMA ASET
      { index: 2, width: 140 }, // KATEGORI
      { index: 3, width: 180 }, // NILAI
      { index: 4, width: 280 }, // CATATAN
      { index: 5, width: 130 }, // TANGGAL INPUT
      { index: 6, width: 130 }, // TERAKHIR UPDATE
    ];
    await applySubTabStyling(spreadsheetId, sheetId, 7, dataRows.length, [3], colWidths);
  }
}
