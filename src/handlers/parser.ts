export type TransactionType = "INCOME" | "EXPENSE";
export type ActionType =
  | "RECORD_TRANSACTION"
  | "RESET_TRANSACTIONS"
  | "SET_WALLET_BALANCE"
  | "TRANSFER_BALANCE"
  | "SET_BUDGET"
  | "GET_BUDGETS"
  | "MANAGE_DEBT"
  | "MANAGE_ASSETS"
  | "MANAGE_SUBSCRIPTIONS"
  | "QUERY_SUMMARY"
  | "LIST_WALLETS"
  | "RECENT_TRANSACTIONS"
  | "DELETE_LAST_TRANSACTION"
  | "SET_PERSONALITY"
  | "WEB_DASHBOARD"
  | "SYNC_NOTION"
  | "HELP"
  | "CHAT"
  | "UNKNOWN";

export interface TransactionData {
  type: TransactionType | null;
  amount: number;
  description: string;
  category: string;
  wallet: string | null;
  fromWallet?: string;
  toWallet?: string;
  isCod?: boolean;
  actionPayload?: Record<string, any>;
}

export interface ParseResult {
  action: ActionType;
  data: TransactionData | null;
  reply_message: string;
}

const WALLETS: Record<string, string> = {
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  shopeefood: "ShopeePay",
  spay: "ShopeePay",
  seabank: "SeaBank",
  "sea bank": "SeaBank",
  krom: "Krom",
  "krom bank": "Krom",
  cash: "Cash",
  tunai: "Cash",
  bca: "BCA",
  mandiri: "Mandiri",
  bri: "BRI",
  bni: "BNI",
  jago: "Jago",
  ovo: "OVO",
  dana: "DANA",
};

// Kategori Pemasukan & Pengeluaran Khusus Mahasiswa + Freelance + Driver ShopeeFood
const INCOME_CATEGORIES: [string, string[]][] = [
  ["Pendapatan Driver ShopeeFood", ["shopeefood", "driver", "orderan", "antar makanan", "insentif driver", "tip customer", "tips driver", "argo", "narik"]],
  ["Pendapatan Freelance", ["freelance", "proyek", "project", "coding", "desain", "bikin web", "joki", "nulis", "klien", "client", "upwork", "fiverr"]],
  ["Uang Saku & Kiriman Ortu", ["uang saku", "kiriman", "transfer ortu", "dari mama", "dari papa", "dari ibu", "dari ayah", "bulanan ortu", "sangu"]],
  ["Beasiswa & Prestasi", ["beasiswa", "kip", "lomba", "hadiah", "grant"]],
  ["Cashback & Penjualan", ["cashback", "penjualan", "jual", "olx", "preloved"]],
  ["Lainnya (Pemasukan)", ["gaji", "bonus", "cuan", "masuk", "dapat duit"]],
];

const EXPENSE_CATEGORIES: [string, string[]][] = [
  ["Makanan & Minuman", ["kopi", "teh", "es teh", "makan", "jajan", "resto", "cemilan", "minum", "mie", "nasi", "ayam", "bakso", "cafe", "gorengan", "roti", "snack", "jus", "warteg", "warmindo", "geprek", "indomie", "sarapan", "siang", "malam", "esteh", "gacoan"]],
  ["Operasional ShopeeFood & Bensin", ["bensin", "pertalite", "pertamax", "bensin motor", "parkir", "parkir resto", "parkir cust", "parkir customer", "ojol", "tol"]],
  ["Servis & Perawatan Motor", ["servis", "service", "ganti oli", "oli mesin", "oli gardan", "tambal ban", "ban bocor", "bengkel", "cuci motor", "kampas rem", "aki motor"]],
  ["Kebutuhan Kuliah & Buku", ["kuliah", "kampus", "print", "fotokopi", "fotocopy", "buku", "makalah", "skripsi", "ukt", "spp", "alat tulis", "pulpen", "binder", "jilid"]],
  ["Kosan & Tagihan Listrik", ["kos", "kosan", "sewa kos", "listrik", "pln", "token listrik", "air kos", "iuran kos", "kamar kos"]],
  ["Kuota Internet & Pulsa", ["pulsa", "kuota", "paket data", "internet", "wifi", "indihome", "kartu halo", "telkomsel", "xl", "tri", "smartfren", "axis"]],
  ["Software & Tools Freelance", ["canva", "domain", "hosting", "figma", "chatgpt", "github", "vps", "adobe", "midjourney"]],
  ["Belanja Pribadi & Harian", ["minimarket", "alfamart", "indomaret", "baju", "belanja", "sembako", "sabun", "shampoo", "odol", "laundry", "cuci baju"]],
  ["Hiburan & Nongkrong", ["nongkrong", "nonton", "bioskop", "netflix", "spotify", "game", "topup", "steam", "mlbb", "ps", "karaoke"]],
  ["Rokok & Tembakau", ["rokok", "marlboro", "malboro", "surya", "sampoerna", "esse", "gudang garam", "magnum", "djarum", "camel", "vape", "liquid", "pod", "coil"]],
  ["Lainnya (Pengeluaran)", []],
];

const INCOME_KEYWORDS = [
  "+", "gaji", "dapet", "dapat", "masuk", "tf dari", "transfer dari", "cashback", "tips",
  "driver", "bonus", "penjualan", "cuan", "kiriman", "uang saku", "freelance"
];

const SUMMARY_KEYWORDS = [
  "rekap", "pengeluaranku", "pemasukanku", "laporan", "summary", "total", "saldo keseluruhan"
];

const formatIDR = (n: number) => {
  if (n < 0) return `-Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(n))}`;
  return `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
};

export function detectCategory(text: string, isIncome: boolean = false): string {
  const lower = text.toLowerCase();
  if (isIncome) {
    for (const [catName, keywords] of INCOME_CATEGORIES) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return catName;
      }
    }
    return "Pendapatan Freelance";
  }

  for (const [catName, keywords] of EXPENSE_CATEGORIES) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return catName;
    }
  }
  return "Lainnya (Pengeluaran)";
}

export function extractNumericAmount(text: string): {
  amount: number;
  raw: string;
  qty?: number;
  unitPrice?: number;
  isMultiplied?: boolean;
} | null {
  const lower = text.toLowerCase();

  // 1. Cek perkalian kuantitas x harga satuan
  // Contoh: "4 gram estimasi pergramnya 2.400.000", "3 porsi @ 25.000", "5x 50rb", "2 liter perliter 10k"
  const qtyPriceRegex = /(\d+(?:[.,]\d+)?)\s*(?:gram|gr|g|pcs|buah|biji|porsi|lembar|item|box|bungkus|paket|orang|liter|l|meter|m|hari|bln|bulan)?\s*(?:estimasi\s+)?(?:per\s*(?:gram|gr|g|pcs|buah|porsi|liter|item|bulan|hari|orang)|@|x|\*|kali)\s*(?:seharga|sebesar|harga|nya)?\s*(?:rp\.?\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(k|rb|jt|ribu|juta)?/i;
  const qMatch = lower.match(qtyPriceRegex);
  if (qMatch) {
    const qty = parseFloat(qMatch[1].replace(/,/g, "."));
    let unitPriceRaw = qMatch[2];
    const unit = (qMatch[3] || "").toLowerCase();
    let unitPrice = 0;
    if (unit) {
      unitPrice = parseFloat(unitPriceRaw.replace(/,/g, "."));
      if (unit === "k" || unit === "rb" || unit === "ribu") unitPrice *= 1_000;
      if (unit === "jt" || unit === "juta") unitPrice *= 1_000_000;
    } else {
      unitPrice = parseFloat(unitPriceRaw.replace(/\./g, "").replace(/,/g, "."));
    }
    const total = Math.round(qty * unitPrice);
    if (!isNaN(total) && total > 0) {
      return {
        amount: total,
        raw: qMatch[0],
        qty,
        unitPrice,
        isMultiplied: true,
      };
    }
  }

  // 2. Format angka ribuan Indonesia: 2.400.000 atau 50.000 atau desimal 2,5jt
  const amountRegex = /([+-]?)\s*(?:(rp\.?)\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)\s*(k|rb|jt|ribu|juta)?\b/gi;
  const allMatches = [...lower.matchAll(amountRegex)];

  if (allMatches.length === 0) return null;

  const candidates = allMatches.map((m) => {
    const hasRp = Boolean(m[2]);
    let rawNum = m[3];
    const unit = (m[4] || "").toLowerCase();

    if (unit) {
      rawNum = rawNum.replace(/,/g, ".");
    } else if (rawNum.includes(".") && rawNum.includes(",")) {
      rawNum = rawNum.replace(/\./g, "").replace(/,/g, ".");
    } else if ((rawNum.match(/\./g) || []).length > 1) {
      rawNum = rawNum.replace(/\./g, "");
    } else if ((rawNum.match(/,/g) || []).length > 1) {
      rawNum = rawNum.replace(/,/g, "");
    } else if (rawNum.includes(".")) {
      const parts = rawNum.split(".");
      if (parts[1] && parts[1].length === 3) {
        rawNum = rawNum.replace(/\./g, "");
      } else {
        rawNum = rawNum.replace(/\./g, ".");
      }
    } else if (rawNum.includes(",")) {
      const parts = rawNum.split(",");
      if (parts[1] && parts[1].length === 3) {
        rawNum = rawNum.replace(/,/g, "");
      } else {
        rawNum = rawNum.replace(/,/g, ".");
      }
    }

    let val = parseFloat(rawNum);
    if (unit === "k" || unit === "rb" || unit === "ribu") val *= 1_000;
    if (unit === "jt" || unit === "juta") val *= 1_000_000;
    val = Math.round(val);

    return {
      hasExplicitUnit: Boolean(unit) || hasRp,
      amount: val,
      raw: m[0],
    };
  }).filter((c) => !isNaN(c.amount) && c.amount > 0);

  if (candidates.length === 0) return null;

  let chosen = candidates.find((c) => c.hasExplicitUnit);
  if (!chosen) {
    chosen = candidates.find((c) => c.amount >= 1000) || candidates[candidates.length - 1];
  }

  return chosen ? { amount: chosen.amount, raw: chosen.raw } : null;
}

/**
 * Parsing pesan percakapan kasual menjadi data terstruktur JSON keuangan
 */
export function parseFinancialMessage(rawText: string): ParseResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Cek pergantian kepribadian (Personality)
  if (/(istri.*galak|galak.*istri|istri judes|istri ngomel)/i.test(lower)) {
    return {
      action: "SET_PERSONALITY",
      data: { type: null, amount: 0, description: "ISTRI_GALAK", category: "", wallet: null },
      reply_message: "Hah?! Kamu minta aku jadi istri galak?! Awas ya Mas, mulai detik ini gak ada ceritanya jajan sembarangan! Tiap kamu keluar duit bakal aku introgasi! 😤💅",
    };
  }
  if (/\b(mode istri|jadi istri|istri aku|mode pasangan)\b/i.test(lower)) {
    return {
      action: "SET_PERSONALITY",
      data: { type: null, amount: 0, description: "ISTRI", category: "", wallet: null },
      reply_message: "Siap Mas sayang! Mulai sekarang aku jadi istri kamu yang jagain keuangan ya ❤️",
    };
  }
  if (/\b(mode bestie|mode santai|mode temen|mode teman)\b/i.test(lower)) {
    return {
      action: "SET_PERSONALITY",
      data: { type: null, amount: 0, description: "BESTIE", category: "", wallet: null },
      reply_message: "Sip bro! Mode bestie aktif! Santai tapi tetep inget nabung ya cuy 👊",
    };
  }
  if (/\b(mode serius|mode konsultan|mode formal|mode pro)\b/i.test(lower)) {
    return {
      action: "SET_PERSONALITY",
      data: { type: null, amount: 0, description: "SERIUS", category: "", wallet: null },
      reply_message: "Baik. Mode Konsultan Keuangan Profesional (CFP) telah diaktifkan.",
    };
  }
  if (/\b(mode hemat|mode pelit|mode galak)\b/i.test(lower)) {
    return {
      action: "SET_PERSONALITY",
      data: { type: null, amount: 0, description: "HEMAT_EKSTREM", category: "", wallet: null },
      reply_message: "Mode Hemat Ekstrem aktif! Jangan coba-coba laper mata lagi ya! 😤",
    };
  }

  // 2. Cek spesifik reset per modul (Aset, Hutang, Budget, Langganan) SEBELUM reset umum transaksi!
  if (/\b(aset|asset|harta|kekayaan)\b/i.test(lower) && /\b(hapus|kosongkan|reset|bersihkan)\b/i.test(lower)) {
    return {
      action: "MANAGE_ASSETS",
      data: {
        type: null,
        amount: 0,
        description: "Kosongkan semua aset",
        category: "Aset",
        wallet: null,
        actionPayload: { action: "CLEAR" },
      },
      reply_message: "Sedang mengosongkan dan menghapus seluruh daftar aset Anda...",
    };
  }

  if (/\b(hutang|piutang)\b/i.test(lower) && /\b(hapus|kosongkan|reset|bersihkan)\b/i.test(lower)) {
    return {
      action: "MANAGE_DEBT",
      data: {
        type: null,
        amount: 0,
        description: "Kosongkan semua hutang",
        category: "Hutang",
        wallet: null,
        actionPayload: { action: "CLEAR" },
      },
      reply_message: "Sedang mengosongkan seluruh daftar hutang dan piutang Anda...",
    };
  }

  if (/\b(budget|anggaran)\b/i.test(lower) && /\b(hapus|kosongkan|reset|bersihkan)\b/i.test(lower)) {
    return {
      action: "SET_BUDGET",
      data: {
        type: null,
        amount: 0,
        description: "Kosongkan semua budget",
        category: "Budget",
        wallet: null,
        actionPayload: { action: "CLEAR" },
      },
      reply_message: "Sedang mengosongkan dan menghapus seluruh batas anggaran Anda...",
    };
  }

  if (/\b(langganan|subscription|subs)\b/i.test(lower) && /\b(hapus|kosongkan|reset|bersihkan)\b/i.test(lower)) {
    return {
      action: "MANAGE_SUBSCRIPTIONS",
      data: {
        type: null,
        amount: 0,
        description: "Kosongkan semua langganan",
        category: "Subscription",
        wallet: null,
        actionPayload: { action: "CLEAR" },
      },
      reply_message: "Sedang mengosongkan seluruh daftar langganan rutin Anda...",
    };
  }

  // 2b. Cek intent reset data transaksi umum (Hanya jika BUKAN aset/hutang/budget/langganan)
  if (
    /\b(reset|hapus semua|ulang dari awal|setting dari awal|mulai dari awal|kosongkan)\b/i.test(lower) &&
    !/\b(aset|asset|harta|hutang|piutang|budget|anggaran|langganan|subscription)\b/i.test(lower)
  ) {
    return {
      action: "RESET_TRANSACTIONS",
      data: null,
      reply_message: "Sedang mereset riwayat transaksi Anda...",
    };
  }

  // 3. Cek batalkan / hapus transaksi terakhir
  if (/\b(hapus transaksi (terakhir|tadi)|batal(kan)? transaksi|salah catat)\b/i.test(lower)) {
    return {
      action: "DELETE_LAST_TRANSACTION",
      data: null,
      reply_message: "Sedang menghapus transaksi terakhir Anda...",
    };
  }

  // 4. Cek COD Order ShopeeFood (Pindah saldo ShopeePay ke Cash)
  // Contoh: "dapat cod 35rb", "order cod 45k", "dapat cod shopeepay motong nambah cash 25rb"
  const isCodOrder = /\bcod\b/i.test(lower);
  if (isCodOrder) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      return {
        action: "TRANSFER_BALANCE",
        data: {
          type: null,
          amount: extracted.amount,
          description: "Pesanan COD ShopeeFood",
          category: "Operasional ShopeeFood",
          wallet: "Cash",
          fromWallet: "ShopeePay",
          toWallet: "Cash",
          isCod: true,
          actionPayload: { type: "COD_SETTLEMENT" },
        },
        reply_message: `📦 *Pesanan COD Dicatat!*\nSaldo *ShopeePay* terpotong *${formatIDR(extracted.amount)}*, uang *Cash* di saku bertambah *${formatIDR(extracted.amount)}*.`,
      };
    }
  }

  // 4b. Cek Atur Saldo Dompet / Saldo Awal (termasuk saldo MINUS driver ShopeeFood / Grab / Gojek)
  // Contoh: "masukan shopeepay minus 52.652", "saldo awal bca 5jt", "saldo shopeepay minus 50rb", "atur saldo cash 200k", "shopeepay minus 52652"
  const isSetBalance =
    /\b(saldo awal|atur saldo|set saldo|isi saldo|saldo sekarang)\b/i.test(lower) ||
    (/\b(masuk(k)?an|input|catat)\b/i.test(lower) && /\b(minus|-)\b/i.test(lower)) ||
    (/\b(shopeepay|gopay|bca|cash|dana|ovo|seabank|mandiri|bri|jago)\b/i.test(lower) && /\b(minus|-)\b/i.test(lower) && !/\b(transfer|tf|beli|bayar)\b/i.test(lower));

  if (isSetBalance && !isCodOrder) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      let targetWallet = "ShopeePay";
      for (const [key, val] of Object.entries(WALLETS)) {
        if (new RegExp(`\\b${key}\\b`, "i").test(lower)) {
          targetWallet = val;
          break;
        }
      }

      const isNegative = /\b(minus|min|-)\b/i.test(lower);
      const finalAmount = isNegative ? -Math.abs(extracted.amount) : extracted.amount;

      return {
        action: "SET_WALLET_BALANCE",
        data: {
          type: null,
          amount: finalAmount,
          description: `Atur Saldo ${targetWallet}`,
          category: "Saldo Awal & Penyesuaian",
          wallet: targetWallet,
        },
        reply_message: `💳 *Saldo Dompet Diatur:*\nSaldo *${targetWallet}* berhasil disesuaikan menjadi *${formatIDR(finalAmount)}*${isNegative ? " (Saldo Minus Normal Driver ShopeeFood)" : ""}.`,
      };
    }
  }

  // 5. Cek Transfer Antar Dompet biasa
  // Contoh: "transfer 50rb dari bca ke shopeepay", "pindah dana 100k jago ke gopay", "tarik shopeepay 200rb ke bca"
  const isTransfer = /\b(transfer|tf|pindah|tarik saldo|kirim)\b/i.test(lower) && /\b(ke|menuju|to)\b/i.test(lower);
  if (isTransfer) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      // Cari nama dompet sumber dan tujuan
      let fromW = "ShopeePay";
      let toW = "BCA";

      const words = lower.split(/\s+/);
      const foundWallets: string[] = [];
      for (const w of words) {
        if (WALLETS[w] && !foundWallets.includes(WALLETS[w])) {
          foundWallets.push(WALLETS[w]);
        }
      }

      if (foundWallets.length >= 2) {
        fromW = foundWallets[0];
        toW = foundWallets[1];
      } else if (foundWallets.length === 1) {
        if (lower.includes(`ke ${foundWallets[0].toLowerCase()}`)) {
          toW = foundWallets[0];
          fromW = toW === "Cash" ? "ShopeePay" : "BCA";
        } else {
          fromW = foundWallets[0];
          toW = fromW === "ShopeePay" ? "Cash" : "ShopeePay";
        }
      }

      return {
        action: "TRANSFER_BALANCE",
        data: {
          type: null,
          amount: extracted.amount,
          description: `Transfer ${fromW} ke ${toW}`,
          category: "Transfer",
          wallet: toW,
          fromWallet: fromW,
          toWallet: toW,
          isCod: false,
          actionPayload: { type: "TRANSFER" },
        },
        reply_message: `🔄 *Transfer Berhasil!*\nMemindahkan *${formatIDR(extracted.amount)}* dari *${fromW}* ke *${toW}*.`,
      };
    }
  }

  // 6. Cek Budgeting: "set budget", "budget makan 500rb", "cek budget"
  if (/\b(budget|anggaran)\b/i.test(lower)) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      const cat = detectCategory(lower, false);
      return {
        action: "SET_BUDGET",
        data: {
          type: null,
          amount: extracted.amount,
          description: `Budget ${cat}`,
          category: cat,
          wallet: null,
          actionPayload: { category: cat, amount: extracted.amount, period: "MONTHLY" },
        },
        reply_message: `🎯 *Budget Diatur:* Batas anggaran untuk *${cat}* diatur sebesar *${formatIDR(extracted.amount)}* per bulan.`,
      };
    } else if (/\b(cek|sisa|status|list|rekap|berapa)\b/i.test(lower)) {
      return {
        action: "GET_BUDGETS",
        data: null,
        reply_message: "Sedang mengecek status anggaran & sisa budget Anda...",
      };
    }
  }

  // 7. Cek Hutang / Piutang: "hutang", "piutang", "pinjam", "pinjem"
  if (/\b(hutang|piutang|pinjam|pinjem|utang)\b/i.test(lower)) {
    const extracted = extractNumericAmount(text);
    const isPay = /\b(bayar|lunas|cicil)\b/i.test(lower);
    const isReceivable = /\b(minjemin|dipinjam|piutang|talang|ditalangin)\b/i.test(lower);

    if (extracted && extracted.amount > 0) {
      return {
        action: "MANAGE_DEBT",
        data: {
          type: null,
          amount: extracted.amount,
          description: text,
          category: "Hutang & Piutang",
          wallet: null,
          actionPayload: {
            action: isPay ? "PAY" : "RECORD",
            type: isReceivable ? "RECEIVABLE" : "DEBT",
            amount: extracted.amount,
          },
        },
        reply_message: `🤝 *Catatan Hutang/Piutang:* Nominal ${formatIDR(extracted.amount)} telah diproses.`,
      };
    } else if (/\b(daftar|cek|list|rekap|rincian)\b/i.test(lower)) {
      return {
        action: "MANAGE_DEBT",
        data: {
          type: null,
          amount: 0,
          description: "List hutang",
          category: "Hutang",
          wallet: null,
          actionPayload: { action: "LIST" },
        },
        reply_message: "Sedang mengambil daftar hutang & piutang Anda...",
      };
    }
  }

  // 8. Cek Aset: "daftar aset", "aset motor beat 12jt", "tambahkan aset baru emas 4 gram estimasi pergramnya 2.400.000"
  if (/\b(aset|asset|harta|kekayaan)\b/i.test(lower)) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      // Ekstraksi nama aset yang bersih dan rapi
      let assetName = text
        .replace(/^(tambah(kan)?|catat|masuk(k)?an|input|simpan)\s+(aset|asset|harta|kekayaan)\s*(baru)?\s*/i, "")
        .replace(/\b(aset|asset|harta|kekayaan)\s*(baru)?\s*/i, "")
        .trim();

      assetName = assetName
        .replace(/\s*(?:estimasi|seharga|harga|senilai|per\s*\w+|@|x|\*|kali)\s*.*$/i, "")
        .trim();

      if (!assetName) assetName = "Aset Pribadi";
      assetName = assetName.charAt(0).toUpperCase() + assetName.slice(1);

      return {
        action: "MANAGE_ASSETS",
        data: {
          type: null,
          amount: extracted.amount,
          description: `Aset: ${assetName}`,
          category: "Aset",
          wallet: null,
          actionPayload: { action: "RECORD", value: extracted.amount, name: assetName },
        },
        reply_message: `🛵 *Aset Dicatat:* *${assetName}* dengan estimasi nilai *${formatIDR(extracted.amount)}* berhasil ditambahkan ke inventaris aset Anda.`,
      };
    } else {
      return {
        action: "MANAGE_ASSETS",
        data: {
          type: null,
          amount: 0,
          description: "List aset",
          category: "Aset",
          wallet: null,
          actionPayload: { action: "LIST" },
        },
        reply_message: "Sedang mengambil daftar aset Anda...",
      };
    }
  }

  // 9. Cek Subscription / Langganan
  if (/\b(langganan|subscription|subs)\b/i.test(lower)) {
    const extracted = extractNumericAmount(text);
    if (extracted && extracted.amount > 0) {
      return {
        action: "MANAGE_SUBSCRIPTIONS",
        data: {
          type: null,
          amount: extracted.amount,
          description: text,
          category: "Subscription",
          wallet: null,
          actionPayload: { action: "RECORD", amount: extracted.amount, name: text },
        },
        reply_message: `📅 *Langganan Ditambahkan:* Tagihan ${formatIDR(extracted.amount)} berhasil didaftarkan.`,
      };
    } else {
      return {
        action: "MANAGE_SUBSCRIPTIONS",
        data: {
          type: null,
          amount: 0,
          description: "List langganan",
          category: "Subscription",
          wallet: null,
          actionPayload: { action: "LIST" },
        },
        reply_message: "Sedang mengambil daftar langganan aktif Anda...",
      };
    }
  }

  // 10. Cek query dompet / saldo rekening
  const isAskingWallets =
    (/\b(dompet|rekening|akun|kantong)\b/i.test(lower) &&
      /\b(apa|mana|berapa|daftar|list|cek|semua|punya|ada)\b/i.test(lower)) ||
    /^(dompet|rekening|saldo|cek dompet|daftar dompet|dompetku)$/i.test(lower);

  if (isAskingWallets && !/\d{2,}/.test(text)) {
    return {
      action: "LIST_WALLETS",
      data: null,
      reply_message: "Sedang mengambil daftar dompet dan saldo Anda...",
    };
  }

  // 11. Cek query riwayat
  if (
    /\b(riwayat|history|terakhir|tadi beli|catatan terakhir|list transaksi)\b/i.test(lower) &&
    !/\d{3,}/.test(text)
  ) {
    return {
      action: "RECENT_TRANSACTIONS",
      data: null,
      reply_message: "Sedang mengambil riwayat transaksi terakhir...",
    };
  }

  // 12. Cek query summary
  if (SUMMARY_KEYWORDS.some((kw) => lower.includes(kw)) && !/\d{2,}/.test(text)) {
    return {
      action: "QUERY_SUMMARY",
      data: null,
      reply_message: "Sedang mengambil ringkasan keuangan Anda...",
    };
  }

  // 13. Cek Web Dashboard & Visualisasi Interaktif
  if (/\b(dashboard|web|grafik|chart|buka web|link web)\b/i.test(lower)) {
    return {
      action: "WEB_DASHBOARD",
      data: null,
      reply_message: `🌐 *Smart Finance Interactive Web Dashboard*\n\nBuka dashboard interaktif Anda di browser:\n👉 http://localhost:3000\n\n✨ *Fitur Lengkap:*\n• 📊 Summary Cards (Likuiditas Rp 9.6jt, Aset Emas 4g, Plafon Budget)\n• 📈 3 Grafik Chart.js (Distribusi Dompet, Alokasi Kategori, Arus Kas)\n• 📋 Tab Tabel Transaksi Lengkap (Filter Tipe, Dompet, Kategori & Pencarian)\n• 📥 Fitur Export CSV & Sinkronisasi Notion`,
    };
  }

  // 14. Cek Notion Sync & Dashboard
  if (/\b(notion|dashboard notion|sync notion|link notion)\b/i.test(lower)) {
    return {
      action: "SYNC_NOTION",
      data: null,
      reply_message: "Sedang menyiapkan dan menyinkronkan visualisasi dashboard Notion Anda...",
    };
  }

  // 14. Cek menu bantuan
  if (/^(bantuan|help|menu|panduan|bisa apa|fitur)$/i.test(lower)) {
    return {
      action: "HELP",
      data: null,
      reply_message: "Menampilkan panduan fitur bot...",
    };
  }

  // 14. Ekstraksi nominal transaksi normal
  const extracted = extractNumericAmount(text);
  if (!extracted) {
    return {
      action: "UNKNOWN",
      data: null,
      reply_message: "Halo! Kirim pesan seperti:\n• '+35000 shopeefood driver'\n• 'dapat cod 45k'\n• 'bensin 25k cash'\n• 'kopi 20k pake gopay'\n• 'set budget makan 500rb'",
    };
  }

  const amount = extracted.amount;
  const hasMinus = /\b(minus|min|-)\b/i.test(lower);
  const isIncome = !hasMinus && (text.startsWith("+") || INCOME_KEYWORDS.some((kw) => lower.includes(kw)));
  const type: TransactionType = isIncome ? "INCOME" : "EXPENSE";

  let wallet: string | null = null;
  for (const [key, val] of Object.entries(WALLETS)) {
    const walletRegex = new RegExp(`\\b${key}\\b`, "i");
    if (walletRegex.test(lower)) {
      wallet = val;
      break;
    }
  }

  const category = detectCategory(lower, isIncome);

  let desc = text
    .replace(extracted.raw, "")
    .replace(/\b(pake|pakai|ke|via|dari|buat|beli|bayar)\b/gi, "")
    .replace(new RegExp(`\\b(${Object.keys(WALLETS).join("|")})\\b`, "gi"), "")
    .replace(/^[,\s-+]+|[,\s-+]+$/g, "")
    .trim();

  desc = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : category;

  const typeLabel = type === "INCOME" ? "Pemasukan" : "Pengeluaran";
  const walletLabel = wallet ? ` via ${wallet}` : "";
  const replyMessage = `✅ ${typeLabel} ${formatIDR(amount)} (${desc})${walletLabel} berhasil dicatat.`;

  return {
    action: "RECORD_TRANSACTION",
    data: {
      type,
      amount,
      description: desc,
      category,
      wallet,
    },
    reply_message: replyMessage,
  };
}
