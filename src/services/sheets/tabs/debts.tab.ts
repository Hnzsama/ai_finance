import { getSheetsClient, ensureTabExists } from "../client.ts";
import { applySubTabStyling } from "../styling.ts";
import { executeSql } from "../../../prisma/db.ts";

/**
 * Sinkronisasi Tab Hutang & Piutang
 */
export async function syncDebtsTab(
  spreadsheetId: string,
  userId?: string | null,
  locale?: string | null
): Promise<void> {
  const sheets = getSheetsClient();
  const tabName = "Hutang_Piutang";
  const sheetId = await ensureTabExists(spreadsheetId, tabName, 300, 10, 7);

  const isSemicolon = !locale || locale.startsWith("id") || !locale.startsWith("en");
  const s = isSemicolon ? ";" : ",";

  const res = await executeSql(
    `SELECT * FROM public."Debt" 
     WHERE "userId" = $1 OR ($1 IS NULL AND "userId" IS NULL)
     ORDER BY "createdAt" DESC`,
    [userId || null]
  );
  const debts = res.rows || [];

  const headerValues = [
    ["", "SMART FINANCE • BUKU CATATAN HUTANG & PIUTANG", "", "", "", "", "", "", ""],
    ["", "Catatan Kewajiban Bayar (Hutang) & Hak Tagih (Piutang) Pribadi • Terkoneksi WhatsApp", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", ""],
    ["", "● TOTAL PIUTANG (HAK TAGIH)", "", "▲ TOTAL HUTANG (KEWAJIBAN)", "", "◆ POSISI BERSIH (NET)", "", "", ""],
    [
      "",
      `=SUMIF(C8:C${s} "RECEIVABLE"${s} E8:E)`,
      "",
      `=SUMIF(C8:C${s} "DEBT"${s} E8:E)`,
      "",
      `=B5-D5`,
      "",
      "",
      "",
    ],
    ["", "Uang di luar yang belum dibayar orang", "", "Uang yang harus kita bayar ke orang", "", "Piutang dikurangi Hutang", "", "", ""],
    ["NO", "NAMA ORANG / PIHAK", "TIPE", "NOMINAL AWAL (RP)", "SISA BELUM LUNAS (RP)", "STATUS", "KETERANGAN / JATUH TEMPO", "TANGGAL INPUT", "TERAKHIR DIUPDATE"],
  ];

  const dataRows = debts.length > 0
    ? debts.map((d: any, idx: number) => {
        const created = d.createdAt ? new Date(d.createdAt).toLocaleDateString("id-ID") : "-";
        const updated = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("id-ID") : "-";
        const tipeLabel = d.type === "RECEIVABLE" ? "RECEIVABLE" : "DEBT";
        return [
          idx + 1,
          d.personName || "-",
          tipeLabel,
          Number(d.amount || 0),
          Number(d.remainingAmount || 0),
          d.status || "UNPAID",
          d.description || "-",
          created,
          updated,
        ];
      })
    : [["-", "Belum ada catatan hutang atau piutang aktif", "-", 0, 0, "LUNAS", "Semua kewajiban & piutang bersih", "-", "-"]];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A1:I300`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:I${7 + dataRows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [...headerValues, ...dataRows] },
  });

  if (sheetId !== undefined) {
    const colWidths = [
      { index: 0, width: 50 },  // NO
      { index: 1, width: 200 }, // NAMA
      { index: 2, width: 130 }, // TIPE
      { index: 3, width: 160 }, // NOMINAL AWAL
      { index: 4, width: 160 }, // SISA
      { index: 5, width: 110 }, // STATUS
      { index: 6, width: 250 }, // KETERANGAN
      { index: 7, width: 130 }, // TANGGAL INPUT
      { index: 8, width: 130 }, // TERAKHIR UPDATE
    ];
    await applySubTabStyling(spreadsheetId, sheetId, 7, dataRows.length, [3, 4], colWidths);
  }
}
