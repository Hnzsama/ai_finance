import { google, sheets_v4 } from "googleapis";
import { executeSql } from "../prisma/db.ts";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;

  public getClientEmail(): string {
    return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "my-bendahara@manminmun.iam.gserviceaccount.com";
  }

  private getSheetsClient(): sheets_v4.Sheets {
    if (this.sheetsClient) return this.sheetsClient;

    const clientEmail = this.getClientEmail();
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheetsClient = google.sheets({ version: "v4", auth });
    return this.sheetsClient;
  }

  /**
   * Ekstraksi Spreadsheet ID dari berbagai macam format URL Google Sheets
   */
  public extractSpreadsheetId(urlOrId: string): string | null {
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9-_]{30,60}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Cek validitas dan akses izin edit Service Account terhadap Spreadsheet
   */
  public async verifyAccess(spreadsheetId: string): Promise<{
    valid: boolean;
    title?: string;
    sheets?: string[];
    error?: string;
  }> {
    try {
      const sheets = this.getSheetsClient();
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const title = meta.data.properties?.title || "Spreadsheet Finansial";
      const sheetTitles = (meta.data.sheets || []).map((s) => s.properties?.title || "");
      return { valid: true, title, sheets: sheetTitles };
    } catch (err: any) {
      const msg = err.message || "Akses ditolak";
      return { valid: false, error: msg };
    }
  }

  /**
   * Format nama bulan untuk transaksi: "10 - Oktober"
   */
  public getMonthLabel(date: Date): string {
    const monthIdx = date.getMonth(); // 0 - 11
    return MONTH_NAMES[monthIdx] || MONTH_NAMES[0];
  }

  /**
   * Inisialisasi sheet/tab tahunan dengan Dashboard Minimalis & Dropdown Filter Bulan
   */
  public async ensureYearTab(spreadsheetId: string, year: number | string): Promise<string> {
    const sheets = this.getSheetsClient();
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
                    columnCount: 10,
                  },
                },
              },
            },
          ],
        },
      });

      // Tulis header master tabel mentah
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${rawTabName}'!A1:J1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["NO", "TANGGAL & WAKTU", "BULAN", "TIPE", "KATEGORI", "DOMPET", "KETERANGAN", "NOMINAL (RP)", "PERANGKAT", "WHATSAPP SENDER"]],
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
                    frozenRowCount: 15, // Kunci baris dashboard di atas agar tetap terlihat saat scroll
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
    await this.applyDashboardLayout(spreadsheetId, tabName, sheetId, tabName, meta.data.properties?.locale);

    return tabName;
  }

  /**
   * Membangun tata letak UI Stylish Minimalis di Google Sheets
   * Dilengkapi Dropdown filter bulan & Rumus SUMIFS dinamis
   */
  private async applyDashboardLayout(
    spreadsheetId: string,
    tabName: string,
    sheetId: number | undefined,
    yearStr: string,
    locale?: string | null
  ): Promise<void> {
    const sheets = this.getSheetsClient();
    const rawTabName = `Data_${yearStr}`;

    // Deteksi pemisah parameter fungsi formula (Indonesia/Eropa = ';', US = ',')
    const isSemicolonLocale = !locale || locale.startsWith("id") || !locale.startsWith("en");
    const s = isSemicolonLocale ? ";" : ",";

    // 1. Data Nilai Sel (Row 1 - 15)
    const headerValues = [
      // Row 1: Title
      ["", "SMART FINANCE • REKAPITULASI ARUS KAS", "", "", "", "", "", "", "", ""],
      // Row 2: Subtitle
      ["", "Buku Kas Digital Pribadi • Sinkronisasi Otomatis WhatsApp Multi-Perangkat (HP & Laptop)", "", "", "", "", "", "", "", ""],
      // Row 3: Blank
      ["", "", "", "", "", "", "", "", "", ""],
      // Row 4: Controls (Bulan di C4, Kategori di E4, Dompet di G4)
      [
        "",
        "Filter Bulan:",
        "Semua Bulan",
        "Filter Kategori:",
        "Semua Kategori",
        "Filter Dompet:",
        "Semua Dompet",
        `Tahun: ${yearStr}`,
        "Sync: Multi-Device",
        this.getClientEmail(),
      ],
      // Row 5: Blank
      ["", "", "", "", "", "", "", "", "", ""],
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
      // Row 7: KPI Card Formulas (Merujuk langsung ke master data mentah Data_{year})
      [
        "",
        "=D7-F7",
        "",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$D$2:$D${s} "INCOME"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        `=COUNTIFS(${rawTabName}!$D$2:$D${s} "<>"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
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
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$E$2:$E${s} B11${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        "Cash",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$F$2:$F${s} "Cash"${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
        "",
        "",
        "",
        "",
      ],
      // Row 12: Breakdown 2
      [
        "",
        "Transportasi & Bensin",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$E$2:$E${s} B12${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        "BCA",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$F$2:$F${s} "BCA"${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
        "",
        "",
        "",
        "",
      ],
      // Row 13: Breakdown 3
      [
        "",
        "Rokok & Tembakau",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$E$2:$E${s} B13${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        "Mandiri",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$F$2:$F${s} "Mandiri"${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
        "",
        "",
        "",
        "",
      ],
      // Row 14: Breakdown 4
      [
        "",
        "Tagihan & Utilitas",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$E$2:$E${s} B14${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$F$2:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
        "",
        "GoPay",
        `=SUMIFS(${rawTabName}!$H$2:$H${s} ${rawTabName}!$F$2:$F${s} "GoPay"${s} ${rawTabName}!$D$2:$D${s} "EXPENSE"${s} ${rawTabName}!$C$2:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} ${rawTabName}!$E$2:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
        "",
        "",
        "",
        "",
      ],
      // Row 15: Table Header Transaksi
      ["NO", "TANGGAL & WAKTU", "BULAN", "TIPE", "KATEGORI", "DOMPET", "KETERANGAN", "NOMINAL (RP)", "PERANGKAT", "WHATSAPP SENDER"],
    ];

    // Clear any previous strict validations first so updating text labels won't be rejected
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
    // Formula ini yang membuat seluruh baris tabel transaksi di bawahnya otomatis merespon dropdown C4, E4, dan G4
    // Dilengkapi SORT descending (1; FALSE) agar transaksi terbaru selalu berada di paling atas!
    const filterFormula = `=IFERROR(SORT(FILTER(${rawTabName}!A2:J; (${rawTabName}!A2:A<>"") * (IF($C$4="Semua Bulan"${s} 1${s} ${rawTabName}!C2:C=$C$4)) * (IF($E$4="Semua Kategori"${s} 1${s} ${rawTabName}!E2:E=$E$4)) * (IF($G$4="Semua Dompet"${s} 1${s} ${rawTabName}!F2:F=$G$4)))${s} 1${s} FALSE)${s} {"-"${s} "-"${s} "-"${s} "-"${s} "-"${s} "-"${s} "Tidak ada data transaksi yang cocok dengan filter"${s} 0${s} "-"${s} "-"})`;

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
        const monthDropdown = ["Semua Bulan", ...MONTH_NAMES];
        const categoryDropdown = [
          "Semua Kategori",
          "Makanan & Minuman",
          "Rokok & Tembakau",
          "Transportasi & Bensin",
          "Gaji & Pendapatan",
          "Belanja & Kebutuhan",
          "Tagihan & Utilitas",
          "Hiburan & Langganan",
          "Saldo Awal & Penyesuaian",
          "Lainnya",
        ];
        const walletDropdown = [
          "Semua Dompet",
          "Cash",
          "BCA",
          "Mandiri",
          "BRI",
          "BNI",
          "Jago",
          "GoPay",
          "OVO",
          "DANA",
          "ShopeePay",
        ];

        // Lebar kolom ideal agar teks dan dropdown arrow tidak pernah terpotong
        const colWidths = [
          { index: 0, width: 60 },  // A: NO
          { index: 1, width: 175 }, // B: TANGGAL & WAKTU / Category Label
          { index: 2, width: 145 }, // C: BULAN / Month Dropdown / Category Amount
          { index: 3, width: 115 }, // D: TIPE / Category Label
          { index: 4, width: 210 }, // E: KATEGORI / Category Dropdown / Wallet Label
          { index: 5, width: 130 }, // F: DOMPET / Wallet Label / Wallet Amount
          { index: 6, width: 270 }, // G: KETERANGAN / Wallet Dropdown
          { index: 7, width: 160 }, // H: NOMINAL (RP) / Total Transaksi
          { index: 8, width: 175 }, // I: PERANGKAT
          { index: 9, width: 230 }, // J: WHATSAPP SENDER
        ];

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              // 1. Atur Lebar Kolom Pixel agar seluruh teks muat sempurna & tidak terpotong
              ...colWidths.map((cw) => ({
                updateDimensionProperties: {
                  range: {
                    sheetId,
                    dimension: "COLUMNS",
                    startIndex: cw.index,
                    endIndex: cw.index + 1,
                  },
                  properties: {
                    pixelSize: cw.width,
                  },
                  fields: "pixelSize",
                },
              })),

              // 2. Data Validation Dropdown pada Sel C4 (Filter Bulan)
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
                      values: monthDropdown.map((v) => ({ userEnteredValue: v })),
                    },
                    inputMessage: "Pilih bulan untuk memfilter rekapitulasi data keuangan.",
                    showCustomUi: true,
                    strict: true,
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
                      values: categoryDropdown.map((v) => ({ userEnteredValue: v })),
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
                      values: walletDropdown.map((v) => ({ userEnteredValue: v })),
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

              // 6. Styling Control Bar (Row 4)
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
                    userEnteredFormat: {
                      horizontalAlignment: "CENTER",
                    },
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
    const sheets = this.getSheetsClient();
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
    ];

    // Simpan ke tab master transaksi mentah Data_{year}
    // Tab Dashboard {year} otomatis merefleksikan perubahan secara dinamis via formula FILTER
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${rawTabName}'!A2:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });
  }

  /**
   * Sinkronisasi seluruh transaksi personal user yang ada di DB ke Google Sheets
   */
  public async syncAllUserTransactions(
    userId: string,
    spreadsheetId: string
  ): Promise<{ syncedCount: number; error?: string }> {
    try {
      // Ambil transaksi user yang bersangkutan beserta nama wallet dan kategorinya
      const res = await executeSql(
        `SELECT t.*, w.name as wallet_name, c.name as category_name 
         FROM public."Transaction" t
         LEFT JOIN public."Wallet" w ON t."walletId" = w.id
         LEFT JOIN public."Category" c ON t."categoryId" = c.id
         WHERE t."userId" = $1
         ORDER BY t."createdAt" ASC`,
        [userId]
      );

      const rows = res.rows || [];
      if (rows.length === 0) {
        const currentYear = new Date().getFullYear();
        await this.ensureYearTab(spreadsheetId, currentYear);
        return { syncedCount: 0 };
      }

      // Kelompokkan transaksi berdasarkan tahun
      const byYear = new Map<number, any[]>();
      for (const row of rows) {
        const d = new Date(row.createdAt);
        const y = d.getFullYear();
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(row);
      }

      let totalSynced = 0;
      for (const [year, txList] of byYear.entries()) {
        const tabName = await this.ensureYearTab(spreadsheetId, year);
        const rawTabName = `Data_${year}`;

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
          ];
        });

        const sheets = this.getSheetsClient();
        // Bersihkan dulu area transaksi mentah lama di Data_{year}
        try {
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${rawTabName}'!A2:J1000`,
          });
        } catch {}

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${rawTabName}'!A2:J${1 + dataRows.length}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: dataRows },
        });

        // Pastikan formula filter dinamis di tab tahun berjalan tetap ada
        await this.applyDashboardLayout(spreadsheetId, tabName, undefined, String(year));

        totalSynced += dataRows.length;
      }

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
