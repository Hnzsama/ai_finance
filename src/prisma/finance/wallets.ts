import { connectDatabase, executeSql } from "../db.ts";
import { formatIDR, type WalletSummaryItem } from "./types.ts";

/**
 * Helper: Ambil atau buat Dompet personal user
 */
export async function getOrCreateWallet(
  walletName: string,
  userId?: string,
  jid?: string
): Promise<{ id: string; name: string }> {
  const clean = walletName.trim();
  if (userId) {
    const res = await executeSql(
      'SELECT id, name FROM public."Wallet" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
      [userId, clean]
    );
    if (res.rows && res.rows.length > 0) {
      return { id: res.rows[0].id, name: res.rows[0].name };
    }
    const newId = crypto.randomUUID();
    await executeSql(
      `INSERT INTO public."Wallet" ("id", "userId", "jid", "name", "isDefault", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newId, userId, jid || null, clean, clean.toLowerCase() === "cash"]
    );
    return { id: newId, name: clean };
  } else {
    const res = await executeSql(
      'SELECT id, name FROM public."Wallet" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      [clean]
    );
    if (res.rows && res.rows.length > 0) {
      return { id: res.rows[0].id, name: res.rows[0].name };
    }
    const newId = crypto.randomUUID();
    await executeSql(
      `INSERT INTO public."Wallet" ("id", "name", "isDefault", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newId, clean, clean.toLowerCase() === "cash"]
    );
    return { id: newId, name: clean };
  }
}

/**
 * Hitung saldo akurat untuk spesifik wallet (memperhitungkan Transaction dan Transfer)
 */
export async function getSpecificWalletBalance(walletId: string, userId?: string): Promise<bigint> {
  const balQuery = userId
    ? `SELECT type, amount FROM public."Transaction" WHERE "userId" = $1 AND "walletId" = $2`
    : `SELECT type, amount FROM public."Transaction" WHERE "walletId" = $1`;
  const balParams = userId ? [userId, walletId] : [walletId];
  const balRes = await executeSql(balQuery, balParams);

  let balance = 0n;
  for (const row of balRes.rows || []) {
    const amt = BigInt(row.amount);
    if (row.type === "INCOME") balance += amt;
    else balance -= amt;
  }

  // Mutasi transfer masuk (+)
  const inQuery = userId
    ? `SELECT amount FROM public."Transfer" WHERE "userId" = $1 AND "toWalletId" = $2`
    : `SELECT amount FROM public."Transfer" WHERE "toWalletId" = $1`;
  const inRes = await executeSql(inQuery, balParams);
  for (const row of inRes.rows || []) {
    balance += BigInt(row.amount);
  }

  // Mutasi transfer keluar (-)
  const outQuery = userId
    ? `SELECT amount, "adminFee" FROM public."Transfer" WHERE "userId" = $1 AND "fromWalletId" = $2`
    : `SELECT amount, "adminFee" FROM public."Transfer" WHERE "fromWalletId" = $1`;
  const outRes = await executeSql(outQuery, balParams);
  for (const row of outRes.rows || []) {
    balance -= (BigInt(row.amount) + BigInt(row.adminFee || 0));
  }

  return balance;
}

/**
 * Daftar Dompet & Saldo Personal Pengguna (Termasuk Mutasi Transfer)
 */
export async function getWalletsSummary(userId?: string): Promise<WalletSummaryItem[]> {
  await connectDatabase();

  const wQuery = userId
    ? `SELECT * FROM public."Wallet" WHERE "userId" = $1`
    : `SELECT * FROM public."Wallet"`;
  const wRes = await executeSql(wQuery, userId ? [userId] : []);
  const wallets = wRes.rows || [];

  // Hitung transaksi biasa
  const txQuery = userId
    ? `SELECT "walletId", type, amount FROM public."Transaction" WHERE "userId" = $1`
    : `SELECT "walletId", type, amount FROM public."Transaction"`;
  const txRes = await executeSql(txQuery, userId ? [userId] : []);
  const transactions = txRes.rows || [];

  const walletStats = new Map<string, { income: bigint; expense: bigint; count: number }>();
  for (const t of transactions) {
    const stat = walletStats.get(t.walletId) || { income: 0n, expense: 0n, count: 0 };
    const amt = BigInt(t.amount);
    if (t.type === "INCOME") stat.income += amt;
    else stat.expense += amt;
    stat.count += 1;
    walletStats.set(t.walletId, stat);
  }

  // Hitung mutasi transfer masuk (+) & keluar (-)
  const tfQuery = userId
    ? `SELECT "fromWalletId", "toWalletId", amount, "adminFee" FROM public."Transfer" WHERE "userId" = $1`
    : `SELECT "fromWalletId", "toWalletId", amount, "adminFee" FROM public."Transfer"`;
  const tfRes = await executeSql(tfQuery, userId ? [userId] : []);
  for (const row of tfRes.rows || []) {
    const amt = BigInt(row.amount);
    const fee = BigInt(row.adminFee || 0);

    const fromStat = walletStats.get(row.fromWalletId) || { income: 0n, expense: 0n, count: 0 };
    fromStat.expense += (amt + fee);
    fromStat.count += 1;
    walletStats.set(row.fromWalletId, fromStat);

    const toStat = walletStats.get(row.toWalletId) || { income: 0n, expense: 0n, count: 0 };
    toStat.income += amt;
    toStat.count += 1;
    walletStats.set(row.toWalletId, toStat);
  }

  const list: WalletSummaryItem[] = wallets.map((w: any) => {
    const stat = walletStats.get(w.id) || { income: 0n, expense: 0n, count: 0 };
    const balance = stat.income - stat.expense;
    return {
      id: w.id,
      name: w.name,
      isDefault: Boolean(w.isDefault),
      balanceRaw: balance,
      balance: formatIDR(balance),
      count: stat.count,
    };
  });

  list.sort((a, b) => {
    if (a.count > 0 && b.count === 0) return -1;
    if (a.count === 0 && b.count > 0) return 1;
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  return list;
}

/**
 * Atur Saldo Awal Dompet Personal Pengguna
 */
export async function setWalletInitialBalance(
  walletName: string,
  balance: number,
  userId?: string,
  jid?: string
): Promise<{ wallet: string; targetBalance: string }> {
  await connectDatabase();
  const wallet = await getOrCreateWallet(walletName, userId, jid);

  // Ambil atau buat Kategori Saldo Awal
  let categoryId: string;
  const catName = "Saldo Awal & Penyesuaian";
  if (userId) {
    const cRes = await executeSql(
      'SELECT id FROM public."Category" WHERE "userId" = $1 AND name = $2 LIMIT 1',
      [userId, catName]
    );
    if (cRes.rows && cRes.rows.length > 0) {
      categoryId = cRes.rows[0].id;
    } else {
      categoryId = crypto.randomUUID();
      await executeSql(
        `INSERT INTO public."Category" ("id", "userId", "jid", "name", "type", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'INCOME', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [categoryId, userId, jid || null, catName]
      );
    }
  } else {
    const cRes = await executeSql(
      'SELECT id FROM public."Category" WHERE "userId" IS NULL AND name = $1 LIMIT 1',
      [catName]
    );
    if (cRes.rows && cRes.rows.length > 0) {
      categoryId = cRes.rows[0].id;
    } else {
      categoryId = crypto.randomUUID();
      await executeSql(
        `INSERT INTO public."Category" ("id", "name", "type", "createdAt", "updatedAt")
         VALUES ($1, $2, 'INCOME', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [categoryId, catName]
      );
    }
  }

  const currentBalance = await getSpecificWalletBalance(wallet.id, userId);
  const targetBig = BigInt(balance);
  const diff = targetBig - currentBalance;

  if (diff !== 0n) {
    await executeSql(
      `INSERT INTO public."Transaction"
       ("id", "userId", "walletId", "categoryId", "type", "amount", "description", "rawText", "isSyncedToSheet", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId || null,
        wallet.id,
        categoryId,
        diff > 0n ? "INCOME" : "EXPENSE",
        (diff > 0n ? diff : -diff).toString(),
        `Atur Saldo Awal ${wallet.name}`,
        `Setting saldo awal ${wallet.name} menjadi ${formatIDR(targetBig)}`,
      ]
    );
  }

  return {
    wallet: wallet.name,
    targetBalance: formatIDR(targetBig),
  };
}
