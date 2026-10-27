import { connectDatabase, executeSql } from "./db.ts";

export const LUQMAN_USER = {
  name: "Luqman",
  phone: "6285159884234",
  primaryJid: "6285159884234@s.whatsapp.net",
  lid: "276252363632838@lid",
};

export const DEFAULT_WALLETS = [
  { name: "Cash", isDefault: true, initialBalance: 0, desc: "Uang tunai di saku / hasil bayaran COD pelanggan ShopeeFood" },
  { name: "ShopeePay", isDefault: false, initialBalance: 0, desc: "Dompet mitra driver ShopeeFood (terpotong saat terima COD) & belanja" },
  { name: "GoPay", isDefault: false, initialBalance: 0, desc: "E-wallet transaksi digital & harian" },
  { name: "SeaBank", isDefault: false, initialBalance: 0, desc: "Rekening bank digital penarikan saldo driver & tabungan" },
  { name: "Krom", isDefault: false, initialBalance: 0, desc: "Bank digital simpanan & tabungan fleksibel bunga tinggi" },
];

export const DEFAULT_CATEGORIES = [
  // --- KATEGORI PEMASUKAN (INCOME) ---
  { name: "Pendapatan Driver ShopeeFood", type: "INCOME" },
  { name: "Pendapatan Freelance", type: "INCOME" },
  { name: "Uang Saku & Kiriman Ortu", type: "INCOME" },
  { name: "Beasiswa & Prestasi", type: "INCOME" },
  { name: "Lainnya (Pemasukan)", type: "INCOME" },

  // --- KATEGORI PENGELUARAN (EXPENSE) ---
  { name: "Operasional ShopeeFood & Bensin", type: "EXPENSE" },
  { name: "Servis & Perawatan Motor", type: "EXPENSE" },
  { name: "Parkir & Tol", type: "EXPENSE" },
  { name: "Makanan & Minuman", type: "EXPENSE" },
  { name: "Kosan & Tagihan Listrik", type: "EXPENSE" },
  { name: "Kebutuhan Kuliah & Buku", type: "EXPENSE" },
  { name: "Software & Tools Freelance", type: "EXPENSE" },
  { name: "Kuota Internet & Pulsa", type: "EXPENSE" },
  { name: "Belanja Pribadi & Harian", type: "EXPENSE" },
  { name: "Hiburan & Nongkrong", type: "EXPENSE" },
  { name: "Kesehatan & Obat", type: "EXPENSE" },
  { name: "Lainnya (Pengeluaran)", type: "EXPENSE" },
];

export const DEFAULT_BUDGETS = [
  { categoryName: "Operasional ShopeeFood & Bensin", amount: 400000n, period: "MONTHLY" },
  { categoryName: "Makanan & Minuman", amount: 750000n, period: "MONTHLY" },
  { categoryName: "Kosan & Tagihan Listrik", amount: 600000n, period: "MONTHLY" },
  { categoryName: "Kuota Internet & Pulsa", amount: 100000n, period: "MONTHLY" },
  { categoryName: "Kebutuhan Kuliah & Buku", amount: 150000n, period: "MONTHLY" },
  { categoryName: "Servis & Perawatan Motor", amount: 100000n, period: "MONTHLY" },
  { categoryName: "Hiburan & Nongkrong", amount: 200000n, period: "MONTHLY" },
];

export const DEFAULT_ASSETS = [
  {
    name: "Motor Operasional (Kuliah & Driver)",
    category: "VEHICLE",
    value: 12000000n,
    notes: "Kendaraan operasional kuliah harian dan narik ShopeeFood",
  },
  {
    name: "Laptop Nugas & Freelance",
    category: "ELECTRONIC",
    value: 8500000n,
    notes: "Laptop untuk nugas kuliah dan pengerjaan project freelance",
  },
  {
    name: "Smartphone Android Driver",
    category: "ELECTRONIC",
    value: 1800000n,
    notes: "HP utama orderan ShopeeFood Driver & komunikasi WhatsApp",
  },
];

export const DEFAULT_SUBSCRIPTIONS = [
  {
    name: "Spotify Mahasiswa (Student Plan)",
    amount: 27500n,
    billingCycle: "MONTHLY",
    billingDay: 20,
    notes: "Hiburan musik saat nugas dan di jalan",
  },
  {
    name: "Paket Data Internet Narik & Hotspot",
    amount: 85000n,
    billingCycle: "MONTHLY",
    billingDay: 1,
    notes: "Koneksi aplikasi driver ShopeeFood dan nugas freelance",
  },
];

export const DEFAULT_DEBTS: any[] = [];

/**
 * Hapus seluruh data transaksi & likuiditas user untuk reset fresh
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

  // 1. Seed Wallets (5 Dompet: Cash, ShopeePay, GoPay, SeaBank, Krom)
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

  // 2. Seed Categories (Khusus Mahasiswa + Freelance + Driver ShopeeFood)
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

  // 3. Likuiditas: Kosongkan seluruh transaksi saldo awal (Saldo awal = Rp 0 murni)
  // Tidak ada transaksi yang di-generate agar riwayat transaksi kosong bersih.

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

  // 5. Seed Default Assets
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
}

/**
 * Inisialisasi atau sinkronisasi user Luqman dengan nomor WhatsApp & LID
 */
export async function seedLuqmanUser(): Promise<string> {
  console.log(`👤 Menyiapkan user profil Luqman (Phone: ${LUQMAN_USER.phone} | LID: ${LUQMAN_USER.lid})...`);

  // Cari user Luqman yang mungkin sudah dibuat via LID atau nomor telepon
  const existing = await executeSql(
    `SELECT id FROM public."User" 
     WHERE "lid" = $1 OR "phoneNumber" = $2 OR "primaryJid" = $3 OR "phoneNumber" = '276252363632838'
     LIMIT 1`,
    [LUQMAN_USER.lid, LUQMAN_USER.phone, LUQMAN_USER.primaryJid]
  );

  let userId: string;
  if (existing.rows && existing.rows.length > 0) {
    userId = existing.rows[0].id;
    await executeSql(
      `UPDATE public."User" 
       SET "name" = $1, "phoneNumber" = $2, "primaryJid" = $3, "lid" = $4, "isRegistered" = true, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [LUQMAN_USER.name, LUQMAN_USER.phone, LUQMAN_USER.primaryJid, LUQMAN_USER.lid, userId]
    );
  } else {
    userId = crypto.randomUUID();
    await executeSql(
      `INSERT INTO public."User" 
       ("id", "phoneNumber", "primaryJid", "name", "lid", "isRegistered", "lastDevice", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, 'DESKTOP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, LUQMAN_USER.phone, LUQMAN_USER.primaryJid, LUQMAN_USER.name, LUQMAN_USER.lid]
    );
  }

  // Daftarkan kedua perangkat ke tabel UserDevice:
  // 1. Mobile Device (HP WhatsApp Android/iOS)
  const devMobile = await executeSql(
    `SELECT id FROM public."UserDevice" WHERE "userId" = $1 AND jid = $2 LIMIT 1`,
    [userId, LUQMAN_USER.primaryJid]
  );
  if (!devMobile.rows || devMobile.rows.length === 0) {
    await executeSql(
      `INSERT INTO public."UserDevice" ("id", "userId", "jid", "deviceType", "deviceLabel", "lastSeenAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'MOBILE', 'HP (WhatsApp Android/iOS)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId, LUQMAN_USER.primaryJid]
    );
  }

  // 2. Desktop Device (Laptop / WhatsApp Web Desktop via LID)
  const devLid = await executeSql(
    `SELECT id FROM public."UserDevice" WHERE "userId" = $1 AND jid = $2 LIMIT 1`,
    [userId, LUQMAN_USER.lid]
  );
  if (!devLid.rows || devLid.rows.length === 0) {
    await executeSql(
      `INSERT INTO public."UserDevice" ("id", "userId", "jid", "deviceType", "deviceLabel", "lastSeenAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'DESKTOP', 'Laptop (WhatsApp Web/Desktop)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId, LUQMAN_USER.lid]
    );
  }

  // 3. UserSetting
  const settingCheck = await executeSql(
    `SELECT id FROM public."UserSetting" WHERE "userId" = $1 LIMIT 1`,
    [userId]
  );
  if (!settingCheck.rows || settingCheck.rows.length === 0) {
    await executeSql(
      `INSERT INTO public."UserSetting" ("id", "userId", "userPhone", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId, LUQMAN_USER.phone]
    );
  } else {
    await executeSql(
      `UPDATE public."UserSetting" SET "userPhone" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2`,
      [LUQMAN_USER.phone, userId]
    );
  }

  return userId;
}

let pendingSeed: Promise<void> | undefined;

export async function runSeed(targetUserId?: string, fresh: boolean = false): Promise<void> {
  await connectDatabase();

  console.log(`🌱 Memulai ${fresh ? "FRESH SEED" : "SEED"} database untuk Luqman (Mahasiswa + Freelance + Driver ShopeeFood)...`);

  // 1. Kosongkan semua transaksi & likuiditas jika fresh
  if (fresh) {
    console.log("🧹 Mengosongkan seluruh riwayat transaksi & likuiditas...");
    await executeSql('DELETE FROM public."Transaction"');
    await executeSql('DELETE FROM public."Transfer"');
  }

  // 2. Setup user Luqman
  const luqmanId = await seedLuqmanUser();

  if (fresh) {
    await cleanUserData(luqmanId);
  }
  await seedUserTarget(luqmanId, `Luqman (${LUQMAN_USER.phone} | ${LUQMAN_USER.lid})`);

  // 3. Template Global Fallback
  if (fresh) {
    await cleanUserData(null);
  }
  await seedUserTarget(null, "Template Global (userId: NULL)");

  // 4. Pastikan transaksi benar-benar kosong sesuai permintaan
  if (fresh) {
    await executeSql('DELETE FROM public."Transaction"');
    await executeSql('DELETE FROM public."Transfer"');
  }

  console.log("✅ Seed database berhasil!");
  console.log("💳 Dompet: Cash (Default), ShopeePay, GoPay, SeaBank, Krom (Saldo Rp 0).");
  console.log("📊 Kategori: Mahasiswa + Freelance + ShopeeFood Driver.");
  console.log("👤 User Luqman terhubung dengan JID: 6285159884234 & LID: 276252363632838@lid.");
  console.log("🧾 Transaksi: Kosong bersih (0 transaksi).");
}

export function seed(targetUserId?: string, fresh: boolean = false): Promise<void> {
  pendingSeed ??= runSeed(targetUserId, fresh).catch((error: unknown) => {
    pendingSeed = undefined;
    throw error;
  });
  return pendingSeed;
}

// Support dieksekusi langsung via CLI: `tsx src/prisma/seed.ts [--fresh]`
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const isFresh = process.argv.includes("--fresh");
  runSeed(undefined, isFresh)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Gagal menjalankan seed:", err);
      process.exit(1);
    });
}
