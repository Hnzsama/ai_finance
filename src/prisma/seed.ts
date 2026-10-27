import { connectDatabase, executeSql } from "./db.ts";

export const DEFAULT_WALLETS = [
  { name: "Cash", isDefault: true, initialBalance: 2400000, desc: "Uang tunai di saku / hasil terima bayaran COD pelanggan" },
  { name: "ShopeePay", isDefault: false, initialBalance: 2400000, desc: "Dompet mitra driver ShopeeFood (terpotong saat terima COD) & belanja" },
  { name: "GoPay", isDefault: false, initialBalance: 2400000, desc: "E-wallet jajan & transportasi harian" },
  { name: "Krom Bank", isDefault: false, initialBalance: 2400000, desc: "Bank digital simpanan tabungan bunga tinggi" },
  { name: "BCA", isDefault: false, initialBalance: 0, desc: "Rekening utama transfer freelance & tabungan kuliah" },
  { name: "Jago", isDefault: false, initialBalance: 0, desc: "Bank digital kantong budgeting harian & kuliah" },
  { name: "DANA", isDefault: false, initialBalance: 0, desc: "E-wallet transaksi digital" },
  { name: "Mandiri", isDefault: false, initialBalance: 0, desc: "Rekening bank" },
  { name: "BRI", isDefault: false, initialBalance: 0, desc: "Rekening bank" },
  { name: "BNI", isDefault: false, initialBalance: 0, desc: "Rekening bank" },
  { name: "OVO", isDefault: false, initialBalance: 0, desc: "E-wallet" },
];

export const DEFAULT_CATEGORIES = [
  // --- KATEGORI PEMASUKAN (INCOME) ---
  { name: "Uang Saku & Kiriman Ortu", type: "INCOME" },
  { name: "Pendapatan Driver ShopeeFood", type: "INCOME" },
  { name: "Pendapatan Freelance", type: "INCOME" },
  { name: "Beasiswa & Prestasi", type: "INCOME" },
  { name: "Cashback & Penjualan", type: "INCOME" },
  { name: "Saldo Awal & Penyesuaian", type: "INCOME" },
  { name: "Lainnya (Pemasukan)", type: "INCOME" },

  // --- KATEGORI PENGELUARAN (EXPENSE) ---
  { name: "Makanan & Minuman", type: "EXPENSE" },
  { name: "Operasional ShopeeFood & Bensin", type: "EXPENSE" },
  { name: "Kosan & Tagihan Listrik", type: "EXPENSE" },
  { name: "Kuota Internet & Pulsa", type: "EXPENSE" },
  { name: "Servis & Perawatan Motor", type: "EXPENSE" },
  { name: "Kebutuhan Kuliah & Buku", type: "EXPENSE" },
  { name: "Software & Tools Freelance", type: "EXPENSE" },
  { name: "Belanja Pribadi & Harian", type: "EXPENSE" },
  { name: "Hiburan & Nongkrong", type: "EXPENSE" },
  { name: "Lainnya (Pengeluaran)", type: "EXPENSE" },
];

export const DEFAULT_BUDGETS = [
  { categoryName: "Makanan & Minuman", amount: 750000n, period: "MONTHLY" },
  { categoryName: "Operasional ShopeeFood & Bensin", amount: 350000n, period: "MONTHLY" },
  { categoryName: "Kosan & Tagihan Listrik", amount: 600000n, period: "MONTHLY" },
  { categoryName: "Kuota Internet & Pulsa", amount: 100000n, period: "MONTHLY" },
  { categoryName: "Servis & Perawatan Motor", amount: 100000n, period: "MONTHLY" },
  { categoryName: "Kebutuhan Kuliah & Buku", amount: 150000n, period: "MONTHLY" },
  { categoryName: "Hiburan & Nongkrong", amount: 200000n, period: "MONTHLY" },
];

export const DEFAULT_ASSETS = [
  {
    name: "Emas Batangan 4 Gram (Logam Mulia Antam)",
    category: "INVESTMENT",
    value: 6000000n,
    notes: "Simpanan investasi 4 gram emas batangan fisik Logam Mulia Antam (~Rp 1.500.000 / gram)",
  },
  {
    name: "Motor Honda Beat FI 2021",
    category: "VEHICLE",
    value: 12500000n,
    notes: "Kendaraan operasional kuliah dan narik ShopeeFood",
  },
  {
    name: "Laptop ASUS TUF Gaming",
    category: "ELECTRONIC",
    value: 9500000n,
    notes: "Laptop andalan nugas kuliah dan coding project freelance",
  },
  {
    name: "HP Xiaomi Redmi Note 10",
    category: "ELECTRONIC",
    value: 1800000n,
    notes: "HP utama orderan driver ShopeeFood dan komunikasi",
  },
];

export const DEFAULT_SUBSCRIPTIONS = [
  {
    name: "Spotify Mahasiswa (Student Plan)",
    amount: 27500n,
    billingCycle: "MONTHLY",
    billingDay: 20,
    notes: "Teman belajar nugas kuliah & coding santai",
  },
  {
    name: "Paket Data Akrab 50GB",
    amount: 85000n,
    billingCycle: "MONTHLY",
    billingDay: 1,
    notes: "Koneksi data driver ShopeeFood dan hotspot freelance",
  },
];

export const DEFAULT_DEBTS = [
  {
    personName: "Budi (Teman Kampus)",
    type: "RECEIVABLE", // Piutang (orang berhutang ke kita)
    amount: 50000n,
    remainingAmount: 50000n,
    status: "UNPAID",
    description: "Talangan makan mie gacoan pas nugas bareng",
  },
];

/**
 * Hapus seluruh data keuangan user (atau global) untuk reset fresh
 */
async function cleanUserData(targetUserId?: string | null): Promise<void> {
  const whereSql = targetUserId ? 'WHERE "userId" = $1' : 'WHERE "userId" IS NULL';
  const params = targetUserId ? [targetUserId] : [];

  await executeSql(`DELETE FROM public."Transaction" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Transfer" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Budget" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Asset" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Subscription" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Debt" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Category" ${whereSql}`, params);
  await executeSql(`DELETE FROM public."Wallet" ${whereSql}`, params);
}

/**
 * Seed data untuk target user (atau null untuk template global)
 */
async function seedUserTarget(targetUserId?: string | null, targetLabel?: string): Promise<void> {
  const label = targetLabel || targetUserId || "Global Fallback";
  console.log(`📦 Menyiapkan seed data untuk: [${label}]...`);

  // 1. Seed Wallets
  const walletMap = new Map<string, string>();
  for (const wallet of DEFAULT_WALLETS) {
    const existing = await executeSql(
      targetUserId
        ? 'SELECT id FROM public."Wallet" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1'
        : 'SELECT id FROM public."Wallet" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      targetUserId ? [targetUserId, wallet.name] : [wallet.name]
    );

    let walletId: string;
    if (existing.rows && existing.rows.length > 0) {
      walletId = existing.rows[0].id;
    } else {
      walletId = crypto.randomUUID();
      await executeSql(
        `INSERT INTO public."Wallet" ("id", "userId", "name", "isDefault", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [walletId, targetUserId || null, wallet.name, wallet.isDefault]
      );
    }
    walletMap.set(wallet.name.toLowerCase(), walletId);
  }

  // 2. Seed Categories (Terpisah Type: INCOME dan EXPENSE)
  const categoryMap = new Map<string, string>();
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await executeSql(
      targetUserId
        ? 'SELECT id FROM public."Category" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1'
        : 'SELECT id FROM public."Category" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      targetUserId ? [targetUserId, cat.name] : [cat.name]
    );

    let categoryId: string;
    if (existing.rows && existing.rows.length > 0) {
      categoryId = existing.rows[0].id;
      await executeSql(
        'UPDATE public."Category" SET "type" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [cat.type, categoryId]
      );
    } else {
      categoryId = crypto.randomUUID();
      await executeSql(
        `INSERT INTO public."Category" ("id", "userId", "name", "type", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [categoryId, targetUserId || null, cat.name, cat.type]
      );
    }
    categoryMap.set(cat.name.toLowerCase(), categoryId);
  }

  // 3. Set Saldo Awal Wallet (Cash, ShopeePay, GoPay, Krom Bank @ Rp 2.400.000)
  const saldoAwalCatId = categoryMap.get("saldo awal & penyesuaian");
  for (const wallet of DEFAULT_WALLETS) {
    if (wallet.initialBalance > 0 && saldoAwalCatId) {
      const wId = walletMap.get(wallet.name.toLowerCase());
      if (wId) {
        // Cek apakah sudah ada transaksi saldo awal di dompet ini
        const txCheck = await executeSql(
          targetUserId
            ? 'SELECT id FROM public."Transaction" WHERE "userId" = $1 AND "walletId" = $2 AND "categoryId" = $3 LIMIT 1'
            : 'SELECT id FROM public."Transaction" WHERE "userId" IS NULL AND "walletId" = $1 AND "categoryId" = $2 LIMIT 1',
          targetUserId ? [targetUserId, wId, saldoAwalCatId] : [wId, saldoAwalCatId]
        );

        if (!txCheck.rows || txCheck.rows.length === 0) {
          const txId = crypto.randomUUID();
          await executeSql(
            `INSERT INTO public."Transaction"
             ("id", "userId", "walletId", "categoryId", "type", "amount", "description", "rawText", "isSyncedToSheet", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'INCOME', $5, $6, $7, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              txId,
              targetUserId || null,
              wId,
              saldoAwalCatId,
              wallet.initialBalance.toString(),
              `Saldo Awal ${wallet.name}`,
              `Saldo Awal ${wallet.name} Rp ${wallet.initialBalance.toLocaleString("id-ID")}`,
            ]
          );
        }
      }
    }
  }

  // 4. Seed Default Budgets
  for (const b of DEFAULT_BUDGETS) {
    const catId = categoryMap.get(b.categoryName.toLowerCase());
    if (catId) {
      const existing = await executeSql(
        targetUserId
          ? 'SELECT id FROM public."Budget" WHERE "userId" = $1 AND "categoryId" = $2 LIMIT 1'
          : 'SELECT id FROM public."Budget" WHERE "userId" IS NULL AND "categoryId" = $1 LIMIT 1',
        targetUserId ? [targetUserId, catId] : [catId]
      );

      if (!existing.rows || existing.rows.length === 0) {
        await executeSql(
          `INSERT INTO public."Budget" ("id", "userId", "categoryId", "amount", "period", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [crypto.randomUUID(), targetUserId || null, catId, b.amount.toString(), b.period]
        );
      }
    }
  }

  // 5. Seed Default Assets (Termasuk Emas Batangan 4 Gram Antam)
  for (const ast of DEFAULT_ASSETS) {
    const existing = await executeSql(
      targetUserId
        ? 'SELECT id FROM public."Asset" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1'
        : 'SELECT id FROM public."Asset" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      targetUserId ? [targetUserId, ast.name] : [ast.name]
    );

    if (!existing.rows || existing.rows.length === 0) {
      await executeSql(
        `INSERT INTO public."Asset" ("id", "userId", "name", "category", "value", "notes", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), targetUserId || null, ast.name, ast.category, ast.value.toString(), ast.notes]
      );
    }
  }

  // 6. Seed Default Subscriptions
  for (const sub of DEFAULT_SUBSCRIPTIONS) {
    const existing = await executeSql(
      targetUserId
        ? 'SELECT id FROM public."Subscription" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1'
        : 'SELECT id FROM public."Subscription" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      targetUserId ? [targetUserId, sub.name] : [sub.name]
    );

    if (!existing.rows || existing.rows.length === 0) {
      const shopeeWalletId = walletMap.get("shopeepay") || null;
      await executeSql(
        `INSERT INTO public."Subscription" ("id", "userId", "walletId", "name", "amount", "billingCycle", "billingDay", "status", "notes", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          targetUserId || null,
          shopeeWalletId,
          sub.name,
          sub.amount.toString(),
          sub.billingCycle,
          sub.billingDay,
          sub.notes,
        ]
      );
    }
  }

  // 7. Seed Default Debts / Receivables
  for (const d of DEFAULT_DEBTS) {
    const existing = await executeSql(
      targetUserId
        ? 'SELECT id FROM public."Debt" WHERE "userId" = $1 AND LOWER("personName") = LOWER($2) LIMIT 1'
        : 'SELECT id FROM public."Debt" WHERE "userId" IS NULL AND LOWER("personName") = LOWER($1) LIMIT 1',
      targetUserId ? [targetUserId, d.personName] : [d.personName]
    );

    if (!existing.rows || existing.rows.length === 0) {
      await executeSql(
        `INSERT INTO public."Debt" ("id", "userId", "type", "personName", "amount", "remainingAmount", "status", "description", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          targetUserId || null,
          d.type,
          d.personName,
          d.amount.toString(),
          d.remainingAmount.toString(),
          d.status,
          d.description,
        ]
      );
    }
  }
}

let pendingSeed: Promise<void> | undefined;

export async function runSeed(targetUserId?: string, fresh: boolean = false): Promise<void> {
  await connectDatabase();

  console.log(`🌱 Memulai ${fresh ? "FRESH SEED" : "SEED"} database untuk Mahasiswa + Freelance + Driver ShopeeFood...`);

  if (targetUserId) {
    if (fresh) {
      await cleanUserData(targetUserId);
    }
    await seedUserTarget(targetUserId);
  } else {
    // Jalankan untuk template global (userId IS NULL)
    if (fresh) {
      await cleanUserData(null);
    }
    await seedUserTarget(null, "Template Global (userId: NULL)");

    // Jalankan juga untuk semua user yang terdaftar di database
    const userRows = await executeSql('SELECT id, name, "phoneNumber" FROM public."User"');
    for (const u of userRows.rows || []) {
      const uLabel = `${u.name || "User"} (${u.phoneNumber || u.id})`;
      if (fresh) {
        await cleanUserData(u.id);
      }
      await seedUserTarget(u.id, uLabel);
    }
  }

  console.log("✅ Seed database berhasil: Wallets (Cash, ShopeePay, GoPay, Krom Bank @ 2.4jt), Kategori (Income/Expense), Budget, Aset (4 Gram Emas LM), Langganan & Piutang siap!");
}

export function seed(targetUserId?: string, fresh: boolean = false): Promise<void> {
  pendingSeed ??= runSeed(targetUserId, fresh).catch((error: unknown) => {
    pendingSeed = undefined;
    throw error;
  });
  return pendingSeed;
}

// Support dieksekusi langsung via CLI: `node --import tsx src/prisma/seed.ts [--fresh]`
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const isFresh = process.argv.includes("--fresh");
  runSeed(undefined, isFresh)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Gagal menjalankan seed:", err);
      process.exit(1);
    });
}
