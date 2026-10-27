import pg from "pg";
import { google } from "googleapis";

const { Pool } = pg;

// Daftar kategori standar
const CATEGORIES = [
  "Makanan & Minuman",
  "Rokok & Tembakau",
  "Transportasi & Bensin",
  "Gaji & Pendapatan",
  "Belanja & Kebutuhan",
  "Tagihan & Utilitas",
  "Hiburan & Langganan",
  "Lainnya"
];

// Daftar dompet standar
const WALLETS = ["Cash", "BCA", "Mandiri", "GoPay", "OVO", "DANA"];

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember"
];

async function seed() {
  console.log("=== 1. Menghubungkan ke Database ===");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const userId = "fe21d531-2f9f-4996-a179-6578cd7739d7"; // Luqman
  const userPhone = "085159884234";
  const userLid = "276252363632838@lid";

  // Pastikan Kategori & Dompet standar ada di DB untuk user Luqman
  const catMap = new Map<string, string>();
  for (const catName of CATEGORIES) {
    const existing = await pool.query(
      `SELECT id FROM public."Category" WHERE "userId" = $1 AND name = $2 LIMIT 1`,
      [userId, catName]
    );
    if (existing.rows.length > 0) {
      catMap.set(catName, existing.rows[0].id);
    } else {
      const ins = await pool.query(
        `INSERT INTO public."Category" (id, name, "userId", "createdAt", "updatedAt") 
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW()) RETURNING id`,
        [catName, userId]
      );
      catMap.set(catName, ins.rows[0].id);
    }
  }

  const walletMap = new Map<string, string>();
  for (const wName of WALLETS) {
    const existing = await pool.query(
      `SELECT id FROM public."Wallet" WHERE "userId" = $1 AND name = $2 LIMIT 1`,
      [userId, wName]
    );
    if (existing.rows.length > 0) {
      walletMap.set(wName, existing.rows[0].id);
    } else {
      const ins = await pool.query(
        `INSERT INTO public."Wallet" (id, name, balance, "userId", "createdAt", "updatedAt") 
         VALUES (gen_random_uuid(), $1, 0, $2, NOW(), NOW()) RETURNING id`,
        [wName, userId]
      );
      walletMap.set(wName, ins.rows[0].id);
    }
  }

  // Hapus transaksi lama Luqman untuk digantikan seed data yang rapi dan konsisten
  await pool.query(`DELETE FROM public."Transaction" WHERE "userId" = $1`, [userId]);
  console.log("Riwayat transaksi lama user berhasil dibersihkan untuk seeding baru.");

  // Generator data transaksi bulanan (Januari - Oktober 2026)
  const seedItems: any[] = [];

  for (let m = 0; m <= 9; m++) { // 0 = Jan, 9 = Okt
    const year = 2026;
    const month = m;

    // 1. Gaji Bulanan (Pemasukan) pada tanggal 25 atau tanggal 1
    seedItems.push({
      type: "INCOME",
      amount: 8500000,
      description: `Gaji Bulanan (${MONTH_NAMES[m]} 2026)`,
      category: "Gaji & Pendapatan",
      wallet: "BCA",
      createdAt: new Date(year, month, 1, 9, 30, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });

    // 2. Bonus / Side Income di pertengahan bulan
    if (m % 2 === 0) {
      seedItems.push({
        type: "INCOME",
        amount: 750000,
        description: `Project freelance / bonus mini`,
        category: "Gaji & Pendapatan",
        wallet: "Mandiri",
        createdAt: new Date(year, month, 15, 14, 0, 0),
        deviceType: "MOBILE",
        jid: `${userPhone}@s.whatsapp.net`,
      });
    }

    // 3. Pengeluaran Rutin: Tagihan Listrik & WiFi
    seedItems.push({
      type: "EXPENSE",
      amount: 450000,
      description: "Tagihan WiFi Indihome",
      category: "Tagihan & Utilitas",
      wallet: "BCA",
      createdAt: new Date(year, month, 3, 10, 15, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });
    seedItems.push({
      type: "EXPENSE",
      amount: 300000,
      description: "Token Listrik PLN Rumah",
      category: "Tagihan & Utilitas",
      wallet: "Mandiri",
      createdAt: new Date(year, month, 5, 19, 0, 0),
      deviceType: "MOBILE",
      jid: `${userPhone}@s.whatsapp.net`,
    });

    // 4. Belanja Kebutuhan Bulanan
    seedItems.push({
      type: "EXPENSE",
      amount: 650000,
      description: "Belanja Bulanan Supermarket",
      category: "Belanja & Kebutuhan",
      wallet: "BCA",
      createdAt: new Date(year, month, 4, 16, 45, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });

    // 5. Makanan & Minuman harian
    seedItems.push({
      type: "EXPENSE",
      amount: 35000,
      description: "Makan Siang Nasi Padang Komplit",
      category: "Makanan & Minuman",
      wallet: "Cash",
      createdAt: new Date(year, month, 6, 12, 30, 0),
      deviceType: "MOBILE",
      jid: `${userPhone}@s.whatsapp.net`,
    });
    seedItems.push({
      type: "EXPENSE",
      amount: 28000,
      description: "Kopi Kenangan & Roti",
      category: "Makanan & Minuman",
      wallet: "GoPay",
      createdAt: new Date(year, month, 10, 15, 10, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });
    seedItems.push({
      type: "EXPENSE",
      amount: 55000,
      description: "Makan Malam Bersama Teman",
      category: "Makanan & Minuman",
      wallet: "OVO",
      createdAt: new Date(year, month, 18, 20, 0, 0),
      deviceType: "MOBILE",
      jid: `${userPhone}@s.whatsapp.net`,
    });

    // 6. Rokok & Tembakau / Vape
    seedItems.push({
      type: "EXPENSE",
      amount: 24000,
      description: "Rokok Camel Option Biru",
      category: "Rokok & Tembakau",
      wallet: "Cash",
      createdAt: new Date(year, month, 7, 11, 0, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });
    seedItems.push({
      type: "EXPENSE",
      amount: 38000,
      description: "Marlboro Filter Black",
      category: "Rokok & Tembakau",
      wallet: "DANA",
      createdAt: new Date(year, month, 16, 17, 30, 0),
      deviceType: "MOBILE",
      jid: `${userPhone}@s.whatsapp.net`,
    });
    if (m % 2 === 1) {
      seedItems.push({
        type: "EXPENSE",
        amount: 140000,
        description: "Liquid Vape Fruity 60ml",
        category: "Rokok & Tembakau",
        wallet: "BCA",
        createdAt: new Date(year, month, 22, 14, 20, 0),
        deviceType: "DESKTOP",
        jid: userLid,
      });
    }

    // 7. Transportasi & Bensin
    seedItems.push({
      type: "EXPENSE",
      amount: 50000,
      description: "Bensin Pertamax Full",
      category: "Transportasi & Bensin",
      wallet: "Cash",
      createdAt: new Date(year, month, 8, 8, 15, 0),
      deviceType: "MOBILE",
      jid: `${userPhone}@s.whatsapp.net`,
    });
    seedItems.push({
      type: "EXPENSE",
      amount: 42000,
      description: "Gojek Pulang Kantor",
      category: "Transportasi & Bensin",
      wallet: "GoPay",
      createdAt: new Date(year, month, 20, 18, 45, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });

    // 8. Hiburan & Langganan
    seedItems.push({
      type: "EXPENSE",
      amount: 54000,
      description: "Langganan Spotify Family",
      category: "Hiburan & Langganan",
      wallet: "DANA",
      createdAt: new Date(year, month, 25, 21, 0, 0),
      deviceType: "DESKTOP",
      jid: userLid,
    });
  }

  console.log(`Memasukkan ${seedItems.length} transaksi ke Database PostgreSQL...`);
  for (const item of seedItems) {
    const cId = catMap.get(item.category) || null;
    const wId = walletMap.get(item.wallet) || null;
    await pool.query(
      `INSERT INTO public."Transaction" 
       (id, type, amount, description, "rawText", "userPhone", "walletId", "categoryId", "createdAt", "updatedAt", "userId", jid, "deviceType", "isSyncedToSheet")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
      [
        item.type,
        item.amount,
        item.description,
        item.description,
        userPhone,
        wId,
        cId,
        item.createdAt,
        item.createdAt,
        userId,
        item.jid,
        item.deviceType,
      ]
    );
  }

  await pool.end();
  console.log("✅ Seed database selesai!");

  console.log("\n=== 2. Sinkronisasi Data & Tata Letak Sempurna ke Google Sheets ===");
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "my-bendahara@manminmun.iam.gserviceaccount.com";
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
  if (privateKey) privateKey = privateKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1xruOv9O1CAyjIMK_5r05dMu1o3USepa7pMrByYEFNYg";
  const tabName = "2026";

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetObj = meta.data.sheets?.find((s: any) => s.properties?.title === tabName);
  const sheetId = sheetObj?.properties?.sheetId;
  const locale = meta.data.properties?.locale;
  const isSemicolonLocale = !locale || locale.startsWith("id") || !locale.startsWith("en");
  const s = isSemicolonLocale ? ";" : ",";

  // Clear previous validation rules
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 10 },
            rule: null,
          },
        },
      ],
    },
  });

  // Rumus Filter Dinamis yang 100% tahan uji pada Locale Indonesia
  // Catatan: Gunakan "<>" untuk mencocokkan semua data jika filter dipilih "Semua ..."
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
      "Tahun: 2026",
      "Sync: Multi-Device",
      clientEmail,
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
    // Row 7: KPI Card Formulas
    [
      "",
      "=D7-F7",
      "",
      `=SUMIFS($H$16:$H${s} $D$16:$D${s} "INCOME"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      `=SUMIFS($H$16:$H${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      `=COUNTIFS($D$16:$D${s} "<>"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
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
      `=SUMIFS($H$16:$H${s} $E$16:$E${s} B11${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      "Cash",
      `=SUMIFS($H$16:$H${s} $F$16:$F${s} "Cash"${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
      "",
      "",
      "",
      "",
    ],
    // Row 12: Breakdown 2
    [
      "",
      "Transportasi & Bensin",
      `=SUMIFS($H$16:$H${s} $E$16:$E${s} B12${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      "BCA",
      `=SUMIFS($H$16:$H${s} $F$16:$F${s} "BCA"${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
      "",
      "",
      "",
      "",
    ],
    // Row 13: Breakdown 3
    [
      "",
      "Rokok & Tembakau",
      `=SUMIFS($H$16:$H${s} $E$16:$E${s} B13${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      "Mandiri",
      `=SUMIFS($H$16:$H${s} $F$16:$F${s} "Mandiri"${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
      "",
      "",
      "",
      "",
    ],
    // Row 14: Breakdown 4
    [
      "",
      "Tagihan & Utilitas",
      `=SUMIFS($H$16:$H${s} $E$16:$E${s} B14${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $F$16:$F${s} IF($G$4="Semua Dompet"${s} "<>"${s} $G$4))`,
      "",
      "GoPay",
      `=SUMIFS($H$16:$H${s} $F$16:$F${s} "GoPay"${s} $D$16:$D${s} "EXPENSE"${s} $C$16:$C${s} IF($C$4="Semua Bulan"${s} "<>"${s} $C$4)${s} $E$16:$E${s} IF($E$4="Semua Kategori"${s} "<>"${s} $E$4))`,
      "",
      "",
      "",
      "",
    ],
    // Row 15: Table Header
    [
      "NO",
      "TANGGAL & WAKTU",
      "BULAN",
      "TIPE",
      "KATEGORI",
      "DOMPET",
      "KETERANGAN",
      "NOMINAL (RP)",
      "PERANGKAT",
      "WHATSAPP SENDER",
    ],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:J15`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: headerValues },
  });

  // Urutkan transaksi seed dari Januari sampai Oktober
  seedItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const txDataRows = seedItems.map((item, idx) => {
    const d = item.createdAt;
    const formattedDate = d.toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const mIdx = d.getMonth();
    const monthLabel = MONTH_NAMES[mIdx];
    const dev = item.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱 (@s.whatsapp.net)";

    return [
      idx + 1,
      formattedDate,
      monthLabel,
      item.type,
      item.category,
      item.wallet,
      item.description,
      item.amount, // Pure numeric number
      dev,
      item.jid,
    ];
  });

  // Bersihkan dan masukkan seluruh baris transaksi
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A16:J1000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A16:J${15 + txDataRows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: txDataRows },
  });
  console.log(`Berhasil menulis ${txDataRows.length} transaksi ke Google Sheets!`);

  // Dropdown list
  const monthDropdown = ["Semua Bulan", ...MONTH_NAMES];
  const categoryDropdown = ["Semua Kategori", ...CATEGORIES];
  const walletDropdown = ["Semua Dompet", ...WALLETS];

  // Formatting & Validation
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

  const formattingRequests: any[] = [];

  for (const cw of colWidths) {
    formattingRequests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: cw.index, endIndex: cw.index + 1 },
        properties: { pixelSize: cw.width },
        fields: "pixelSize",
      },
    });
  }

  // Set Dropdowns ONLY on C4, E4, G4
  formattingRequests.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 2, endColumnIndex: 3 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: monthDropdown.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: true,
      },
    },
  });
  formattingRequests.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 4, endColumnIndex: 5 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: categoryDropdown.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: true,
      },
    },
  });
  formattingRequests.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 6, endColumnIndex: 7 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: walletDropdown.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true,
        strict: true,
      },
    },
  });

  // Banner
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.05, green: 0.08, blue: 0.14 },
          textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 1, green: 1, blue: 1 } },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat)",
    },
  });
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 10 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 },
          textFormat: { fontSize: 9, foregroundColor: { red: 0.6, green: 0.65, blue: 0.75 } },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat)",
    },
  });

  // Filter Bar
  formattingRequests.push({
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
  });
  for (const c of [2, 4, 6]) {
    formattingRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.12, blue: 0.22 } },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  }

  // Cards
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 3 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.94, green: 0.96, blue: 1.0 },
          textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.18, green: 0.22, blue: 0.45 } },
          numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
    },
  });
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 3, endColumnIndex: 5 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.92, green: 0.99, blue: 0.95 },
          textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.02, green: 0.4, blue: 0.25 } },
          numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
    },
  });
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 5, endColumnIndex: 7 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1.0, green: 0.94, blue: 0.95 },
          textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.65, green: 0.08, blue: 0.2 } },
          numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
    },
  });
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 5, endRowIndex: 8, startColumnIndex: 7, endColumnIndex: 9 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.96, green: 0.97, blue: 0.98 },
          textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.15, green: 0.2, blue: 0.3 } },
          numberFormat: { type: "NUMBER", pattern: '#,##0' },
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
    },
  });

  // Section Headers
  formattingRequests.push({
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
  });
  formattingRequests.push({
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
  });

  // Breakdown currency
  formattingRequests.push({
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
  });
  formattingRequests.push({
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
  });

  // Table Header
  formattingRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 10 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 },
          textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } },
          horizontalAlignment: "CENTER",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
    },
  });

  // Table Data format
  formattingRequests.push({
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
  });
  for (const c of [0, 1, 2, 3]) {
    formattingRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 15, endRowIndex: 1000, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(horizontalAlignment)",
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: formattingRequests },
  });

  console.log("\n🎉 SEED DATA & FORMULAS COMPLETED!");
}

seed().catch(console.error);
