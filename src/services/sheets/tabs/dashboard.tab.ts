import { getSheetsClient } from "../client.ts";
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS, PERIOD_OPTIONS } from "../constants.ts";

/**
 * Membangun tata letak UI Minimalis Modern di Google Sheets
 * Dilengkapi Dropdown filter periode (Hari Ini, Minggu Ini, Bulan Ini, Pilih Rentang Tanggal),
 * Input tanggal interaktif (C5 & E5), Search Box (I4), dan Rumus FILTER dinamis.
 */
export async function applyDashboardLayout(
  spreadsheetId: string,
  tabName: string,
  sheetId: number | undefined,
  yearStr: string,
  locale?: string | null
): Promise<void> {
  const sheets = getSheetsClient();
  const rawTabName = `Data_${yearStr}`;

  // Deteksi pemisah parameter fungsi formula (Indonesia/Eropa = ';', US = ',')
  const isSemicolonLocale = !locale || locale.startsWith("id") || !locale.startsWith("en");
  const s = isSemicolonLocale ? ";" : ",";

  // Helper kondisi filter tanggal fleksibel:
  // Mendukung: Hari Ini, Minggu Ini, Bulan Ini, Pilih Rentang Tanggal (C5 & E5), Semua Waktu, atau nama bulan spesifik (Januari - Desember)
  const dateCond = `(IF($C$4="Hari Ini"${s} (${rawTabName}!$K$2:$K = TODAY())${s} IF($C$4="Minggu Ini"${s} ((${rawTabName}!$K$2:$K >= (TODAY() - WEEKDAY(TODAY()${s} 2) + 1)) * (${rawTabName}!$K$2:$K <= TODAY()))${s} IF($C$4="Bulan Ini"${s} ((${rawTabName}!$K$2:$K >= DATE(YEAR(TODAY())${s} MONTH(TODAY())${s} 1)) * (${rawTabName}!$K$2:$K <= EOMONTH(TODAY()${s} 0)))${s} IF($C$4="Pilih Rentang Tanggal"${s} ((${rawTabName}!$K$2:$K >= IF($C$5=""${s} DATE(2000${s} 1${s} 1)${s} $C$5)) * (${rawTabName}!$K$2:$K <= IF($E$5=""${s} DATE(2099${s} 12${s} 31)${s} $E$5)))${s} IF($C$4="Semua Waktu"${s} 1${s} IF($C$4="Semua Bulan"${s} 1${s} (${rawTabName}!$C$2:$C = $C$4)))))))`;

  // 1. Data Nilai Sel (Row 1 - 15)
  const headerValues = [
    // Row 1: Title
    ["", "SMART FINANCE • REKAPITULASI ARUS KAS", "", "", "", "", "", "", "", ""],
    // Row 2: Subtitle
    ["", "Buku Kas Digital Pribadi • Sinkronisasi Otomatis WhatsApp Multi-Perangkat (HP & Laptop)", "", "", "", "", "", "", "", ""],
    // Row 3: Blank
    ["", "", "", "", "", "", "", "", "", ""],
    // Row 4: Controls Utama (Periode di C4, Kategori di E4, Dompet di G4, Search di I4)
    [
      "",
      "Filter Periode:",
      "Semua Waktu",
      "Filter Kategori:",
      "Semua Kategori",
      "Filter Dompet:",
      "Semua Dompet",
      "🔍 Cari:",
      "",
      `Tahun: ${yearStr}`,
    ],
    // Row 5: Controls Rentang Tanggal Khusus (Dari C5, Sampai E5, Status G5, Hint I5)
    [
      "",
      "📅 Dari Tgl:",
      `=DATE(YEAR(TODAY())${s} MONTH(TODAY())${s} 1)`,
      "📅 Sampai Tgl:",
      `=TODAY()`,
      "Status Periode:",
      `=IF($C$4="Pilih Rentang Tanggal"${s} "Rentang: " & TEXT($C$5${s} "dd/mm/yyyy") & " s/d " & TEXT($E$5${s} "dd/mm/yyyy")${s} IF($C$4="Hari Ini"${s} "Hari Ini (" & TEXT(TODAY()${s} "dd/mm/yyyy") & ")"${s} IF($C$4="Minggu Ini"${s} "Minggu Ini (Senin - Hari Ini)"${s} IF($C$4="Bulan Ini"${s} "Bulan Ini (" & TEXT(TODAY()${s} "MMMM") & ")"${s} "Periode: " & $C$4))))`,
      "Hint:",
      "(Ketik kata kunci untuk filter live)",
      "",
    ],
    // Row 6: KPI Card Titles
    [
      "",
      "● SALDO BERSIH",
      "",
      "▲ TOTAL PEMASUKAN",
      "",
      "▼ TOTAL PENGELUARAN",
      "",
      "◆ TOTAL TRANSAKSI",
      "",
      "",
    ],
    // Row 7: KPI Card Formulas (Dinamis merespons Periode, Tanggal, Kategori, & Dompet)
    [
      "",
      "=D7-F7",
      "",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$D$2:$D="INCOME") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)) * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)) * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      `=COUNT(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)) * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      "",
    ],
    // Row 8: KPI Card Subtitles
    [
      "",
      "Arus Kas Terkini",
      "",
      "Filter Dinamis",
      "",
      "Filter Dinamis",
      "",
      "Catatan Transaksi",
      "",
      "",
    ],
    // Row 9: Blank
    ["", "", "", "", "", "", "", "", "", ""],
    // Row 10: Section Header
    [
      "",
      "RINGKASAN PENGELUARAN KATEGORI",
      "",
      "",
      "RINGKASAN REKENING / DOMPET",
      "",
      "",
      "",
      "",
      "",
    ],
    // Row 11: Breakdown 1
    [
      "",
      "Makanan & Minuman",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$E$2:$E=B11) * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      "Cash",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$F$2:$F="Cash") * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)))${s} 0))`,
      "",
      "",
      "",
      "",
    ],
    // Row 12: Breakdown 2
    [
      "",
      "Operasional ShopeeFood & Bensin",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$E$2:$E=B12) * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      "ShopeePay",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$F$2:$F="ShopeePay") * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)))${s} 0))`,
      "",
      "",
      "",
      "",
    ],
    // Row 13: Breakdown 3
    [
      "",
      "Kosan & Tagihan Listrik",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$E$2:$E=B13) * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      "GoPay",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$F$2:$F="GoPay") * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)))${s} 0))`,
      "",
      "",
      "",
      "",
    ],
    // Row 14: Breakdown 4
    [
      "",
      "Belanja Pribadi & Harian",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$E$2:$E=B14) * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!$F$2:$F=$G$4)))${s} 0))`,
      "",
      "SeaBank",
      `=SUM(IFERROR(FILTER(${rawTabName}!$H$2:$H${s} (${rawTabName}!$A$2:$A<>"") * (${rawTabName}!$F$2:$F="SeaBank") * (${rawTabName}!$D$2:$D="EXPENSE") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!$E$2:$E=$E$4)))${s} 0))`,
      "",
      "",
      "",
      "",
    ],
    // Row 15: Table Header Transaksi
    ["NO", "TANGGAL & WAKTU", "BULAN", "TIPE", "KATEGORI", "DOMPET", "KETERANGAN", "NOMINAL (RP)", "PERANGKAT", "WHATSAPP SENDER"],
  ];

  // Clear validasi lama agar tidak ada konflik data validation
  if (sheetId !== undefined) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              setDataValidation: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 10 },
                rule: null as any,
              },
            },
          ],
        },
      });
    } catch {}
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:J15`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: headerValues },
  });

  // 2. Pasang Formula Filter Dinamis di Baris 16 Tab Dashboard
  const filterFormula = `=IFERROR(SORT(FILTER(${rawTabName}!A2:J${s} (${rawTabName}!A2:A<>"") * ${dateCond} * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!E2:E=$E$4)) * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!F2:F=$G$4)) * (IF($I$4=""${s} 1${s} (ISNUMBER(SEARCH($I$4${s} ${rawTabName}!G2:G)) + ISNUMBER(SEARCH($I$4${s} ${rawTabName}!E2:E)) + ISNUMBER(SEARCH($I$4${s} ${rawTabName}!F2:F)) + ISNUMBER(SEARCH($I$4${s} ${rawTabName}!B2:B))))))${s} 1${s} FALSE)${s} {"-"${s} "-"${s} "-"${s} "-"${s} "-"${s} "-"${s} "Tidak ada data transaksi yang cocok dengan filter / kata kunci"${s} 0${s} "-"${s} "-"})`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A16:J1000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A16`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[filterFormula]],
    },
  });

  // Formatting & Data Validation jika sheetId tersedia
  if (sheetId !== undefined) {
    try {
      // Lebar kolom ideal agar teks dan dropdown arrow tidak pernah terpotong
      const colWidths = [
        { index: 0, width: 60 },  // A: NO
        { index: 1, width: 175 }, // B: TANGGAL & WAKTU / Dari Tgl Label
        { index: 2, width: 145 }, // C: BULAN / Periode Dropdown / Dari Tgl Input
        { index: 3, width: 125 }, // D: TIPE / Sampai Tgl Label
        { index: 4, width: 220 }, // E: KATEGORI / Category Dropdown / Sampai Tgl Input
        { index: 5, width: 130 }, // F: DOMPET / Status Label
        { index: 6, width: 260 }, // G: KETERANGAN / Status Dinamis
        { index: 7, width: 130 }, // H: NOMINAL (RP) / Cari Label / Hint Label
        { index: 8, width: 210 }, // I: PERANGKAT / Search Input Box!
        { index: 9, width: 220 }, // J: WHATSAPP SENDER / Info
      ];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // 1. Atur Lebar Kolom Pixel
            ...colWidths.map((cw) => ({
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: "COLUMNS",
                  startIndex: cw.index,
                  endIndex: cw.index + 1,
                },
                properties: { pixelSize: cw.width },
                fields: "pixelSize",
              },
            })),

            // 2. Data Validation Dropdown pada Sel C4 (Filter Periode)
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 3,
                  endRowIndex: 4,
                  startColumnIndex: 2,
                  endColumnIndex: 3,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: PERIOD_OPTIONS.map((v) => ({ userEnteredValue: v })),
                  },
                  inputMessage: "Pilih periode waktu (Hari Ini, Minggu Ini, Bulan Ini, Rentang Tanggal, atau Nama Bulan).",
                  showCustomUi: true,
                  strict: true,
                },
              },
            },

            // 2b. Data Validation Tanggal pada Sel C5 (Dari Tanggal)
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 4,
                  endRowIndex: 5,
                  startColumnIndex: 2,
                  endColumnIndex: 3,
                },
                rule: {
                  condition: { type: "DATE_IS_VALID" },
                  inputMessage: "Klik 2x untuk kalender interaktif atau ketik tanggal awal (YYYY-MM-DD).",
                  showCustomUi: true,
                  strict: false,
                },
              },
            },

            // 2c. Data Validation Tanggal pada Sel E5 (Sampai Tanggal)
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 4,
                  endRowIndex: 5,
                  startColumnIndex: 4,
                  endColumnIndex: 5,
                },
                rule: {
                  condition: { type: "DATE_IS_VALID" },
                  inputMessage: "Klik 2x untuk kalender interaktif atau ketik tanggal akhir (YYYY-MM-DD).",
                  showCustomUi: true,
                  strict: false,
                },
              },
            },

            // 3. Data Validation Dropdown pada Sel E4 (Filter Kategori)
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 3,
                  endRowIndex: 4,
                  startColumnIndex: 4,
                  endColumnIndex: 5,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: DEFAULT_CATEGORIES.map((v) => ({ userEnteredValue: v })),
                  },
                  inputMessage: "Pilih kategori untuk memfilter pengeluaran.",
                  showCustomUi: true,
                  strict: true,
                },
              },
            },

            // 4. Data Validation Dropdown pada Sel G4 (Filter Dompet)
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: 3,
                  endRowIndex: 4,
                  startColumnIndex: 6,
                  endColumnIndex: 7,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: DEFAULT_WALLETS.map((v) => ({ userEnteredValue: v })),
                  },
                  inputMessage: "Pilih dompet/rekening untuk memfilter transaksi.",
                  showCustomUi: true,
                  strict: true,
                },
              },
            },

            // 5. Styling Header Banner (Row 1-2)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.05, green: 0.08, blue: 0.14 }, // Obsidian #0D1322
                    textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 }, // Slate #141C2E
                    textFormat: { fontSize: 9, foregroundColor: { red: 0.6, green: 0.65, blue: 0.75 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },

            // 6a. Styling Control Bar Utama (Row 4)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.95, green: 0.96, blue: 0.98 },
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 0.2, green: 0.25, blue: 0.35 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
            // Dropdown cells highlight (C4, E4, G4)
            ...[2, 4, 6].map((colIdx) => ({
              repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.12, blue: 0.22 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            })),

            // Search Box Highlight (Cell I4: colIdx 8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 8, endColumnIndex: 9 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1.0, green: 0.99, blue: 0.88 }, // Warm light gold/yellow #fef9c3
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.12, blue: 0.22 } },
                  },
                  note: "Ketik teks apa saja (misal: kopi, bensin, shopeefood, bca) untuk memfilter data transaksi secara instan!",
                },
                fields: "userEnteredFormat(backgroundColor,textFormat),note",
              },
            },

            // 6b. Styling Control Bar Rentang Tanggal (Row 5)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.96, green: 0.97, blue: 0.99 },
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 0.25, green: 0.3, blue: 0.4 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
            // Input cells tanggal C5 & E5
            ...[2, 4].map((colIdx) => ({
              repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.12, blue: 0.22 } },
                    horizontalAlignment: "CENTER",
                    numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" },
                  },
                  note: "Klik 2x untuk memilih tanggal dari kalender interaktif.",
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,numberFormat),note",
              },
            })),
            // Status Periode Dinamis di G5 (colIdx 6)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 7 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.92, green: 0.96, blue: 1.0 },
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 0.1, green: 0.35, blue: 0.65 } },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            // Hint pencarian (Cell I5: row index 4, col index 8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 9 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { italic: true, fontSize: 8, foregroundColor: { red: 0.4, green: 0.45, blue: 0.55 } },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(textFormat,horizontalAlignment)",
              },
            },

            // 7. Styling KPI Card Net Balance (Col B-C, Row 6-8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.94, green: 0.96, blue: 1.0 }, // Soft Indigo
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.18, green: 0.22, blue: 0.45 } },
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
              },
            },

            // 8. Styling KPI Card Total Income (Col D-E, Row 6-8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 3, endColumnIndex: 5 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.92, green: 0.99, blue: 0.95 }, // Emerald
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.02, green: 0.4, blue: 0.25 } },
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
              },
            },

            // 9. Styling KPI Card Total Expense (Col F-G, Row 6-8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 5, endColumnIndex: 7 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1.0, green: 0.94, blue: 0.95 }, // Soft Rose
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.65, green: 0.08, blue: 0.2 } },
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
              },
            },

            // 10. Styling KPI Card Transaction Count (Col H-I, Row 6-8)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 9 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.96, green: 0.97, blue: 0.98 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.15, green: 0.2, blue: 0.3 } },
                    numberFormat: { type: "NUMBER", pattern: "#,##0" },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
              },
            },

            // 11. Section Headers (Row 10)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.16, blue: 0.24 },
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 4, endColumnIndex: 7 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.16, blue: 0.24 },
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },

            // Breakdown currency formats
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 10, endRowIndex: 14, startColumnIndex: 2, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                    textFormat: { bold: true, fontSize: 9 },
                  },
                },
                fields: "userEnteredFormat(numberFormat,textFormat)",
              },
            },
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 10, endRowIndex: 14, startColumnIndex: 5, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                    textFormat: { bold: true, fontSize: 9 },
                  },
                },
                fields: "userEnteredFormat(numberFormat,textFormat)",
              },
            },

            // 12. Transaction Table Header (Row 15)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 }, // #141C2E
                    textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },

            // 13. Format Kolom Nominal Transaksi (Col H / index 7) ke Mata Uang IDR
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 15, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                    textFormat: { bold: true },
                    horizontalAlignment: "RIGHT",
                  },
                },
                fields: "userEnteredFormat(numberFormat,textFormat,horizontalAlignment)",
              },
            },

            // 14. Alignments
            ...[0, 1, 2, 3].map((colIdx) => ({
              repeatCell: {
                range: { sheetId, startRowIndex: 15, endRowIndex: 1000, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: { horizontalAlignment: "CENTER" },
                },
                fields: "userEnteredFormat(horizontalAlignment)",
              },
            })),

            // 15. Pasang Filter Otomatis (Basic Filter) pada Header Tabel Transaksi (Baris 15)
            {
              setBasicFilter: {
                filter: {
                  range: {
                    sheetId,
                    startRowIndex: 14,
                    endRowIndex: 1000,
                    startColumnIndex: 0,
                    endColumnIndex: 10,
                  },
                },
              },
            },
          ],
        },
      });
    } catch (err) {
      console.warn("[GoogleSheets] Notice during formatting:", err);
    }
  }
}
