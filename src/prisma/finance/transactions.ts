import { connectDatabase, executeSql } from "../db.ts";
import { getOrCreateCategory } from "./categories.ts";
import {
  formatIDR,
  type QueryTransactionsFilter,
  type RecentTransactionItem,
  type SaveTransactionParams,
} from "./types.ts";
import { getOrCreateWallet, getSpecificWalletBalance } from "./wallets.ts";

/**
 * Simpan Transaksi dengan Isolasi Personal per Pengguna
 */
export async function saveTransaction({
  data,
  userId,
  userPhone,
  jid,
  deviceType,
  rawText,
}: SaveTransactionParams) {
  await connectDatabase();

  const walletName = data.wallet?.trim() || "Cash";
  const categoryName = data.category?.trim() || "Lainnya";
  const txType = data.type ?? "EXPENSE";

  const wallet = await getOrCreateWallet(walletName, userId, jid);
  const category = await getOrCreateCategory(categoryName, txType, userId, jid);

  const txId = crypto.randomUUID();
  const rawAmt = BigInt(data.amount);
  const desc = data.description;

  await executeSql(
    `INSERT INTO public."Transaction" 
     ("id", "userId", "walletId", "categoryId", "type", "amount", "description", "rawText", "userPhone", "jid", "deviceType", "isSyncedToSheet", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      txId,
      userId || null,
      wallet.id,
      category.id,
      txType,
      rawAmt.toString(),
      desc,
      rawText || null,
      userPhone || null,
      jid || null,
      deviceType || "MOBILE",
    ]
  );

  const walletBalance = await getSpecificWalletBalance(wallet.id, userId);

  return {
    transaction: {
      id: txId,
      type: txType,
      amount: rawAmt,
      description: desc,
      walletId: wallet.id,
      categoryId: category.id,
      userId,
      jid,
      deviceType,
    },
    wallet: { id: wallet.id, name: wallet.name },
    category: { id: category.id, name: category.name },
    walletBalance: formatIDR(walletBalance),
  };
}

/**
 * Ringkasan Finansial Personal Pengguna
 */
export async function getFinancialSummary(userId?: string) {
  await connectDatabase();

  const txQuery = userId
    ? `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id
       WHERE t."userId" = $1`
    : `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id`;

  const txRes = await executeSql(txQuery, userId ? [userId] : []);
  const transactions = txRes.rows || [];

  let totalIncome = 0n;
  let totalExpense = 0n;
  const categoryExpenseMap = new Map<string, bigint>();
  const walletExpenseMap = new Map<string, bigint>();

  for (const t of transactions) {
    const amt = BigInt(t.amount);
    if (t.type === "INCOME") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const catName = t.category_name || "Lainnya";
      categoryExpenseMap.set(catName, (categoryExpenseMap.get(catName) || 0n) + amt);

      const wName = t.wallet_name || "Cash";
      walletExpenseMap.set(wName, (walletExpenseMap.get(wName) || 0n) + amt);
    }
  }

  const balance = totalIncome - totalExpense;

  const categoryBreakdown = Array.from(categoryExpenseMap.entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 5)
    .map(([name, amt]) => {
      const pct = totalExpense > 0n ? Math.round((Number(amt) / Number(totalExpense)) * 100) : 0;
      return { name, amount: formatIDR(amt), percentage: pct };
    });

  const walletBreakdown = Array.from(walletExpenseMap.entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 4)
    .map(([name, amt]) => ({ name, expense: formatIDR(amt) }));

  return {
    totalIncome: formatIDR(totalIncome),
    totalExpense: formatIDR(totalExpense),
    balance: formatIDR(balance),
    transactionCount: transactions.length,
    categoryBreakdown,
    walletBreakdown,
  };
}

/**
 * Transaksi Terakhir Personal Pengguna
 */
export async function getRecentTransactions(
  limit = 5,
  userId?: string
): Promise<RecentTransactionItem[]> {
  await connectDatabase();

  const sql = userId
    ? `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id
       WHERE t."userId" = $1
       ORDER BY t."createdAt" DESC
       LIMIT $2`
    : `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id
       ORDER BY t."createdAt" DESC
       LIMIT $1`;

  const params = userId ? [userId, limit] : [limit];
  const res = await executeSql(sql, params);

  return (res.rows || []).map((t: any) => ({
    id: t.id,
    type: t.type,
    amount: formatIDR(BigInt(t.amount)),
    description: t.description,
    wallet: t.wallet_name || "Cash",
    category: t.category_name || "Lainnya",
    deviceType: t.deviceType || "MOBILE",
    date: t.createdAt
      ? new Date(t.createdAt).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-",
  }));
}

/**
 * Reset Riwayat Transaksi & Transfer Personal Pengguna
 */
export async function resetAllTransactions(userId?: string): Promise<{ success: boolean }> {
  await connectDatabase();
  if (userId) {
    await executeSql('DELETE FROM public."Transaction" WHERE "userId" = $1 OR "userId" IS NULL', [userId]);
    await executeSql('DELETE FROM public."Transfer" WHERE "userId" = $1 OR "userId" IS NULL', [userId]);
  } else {
    await executeSql('DELETE FROM public."Transaction"');
    await executeSql('DELETE FROM public."Transfer"');
  }
  return { success: true };
}

/**
 * Hapus 1 Transaksi Terakhir Personal Pengguna
 */
export async function deleteLastTransaction(userId?: string): Promise<any | null> {
  await connectDatabase();
  const selectSql = userId
    ? `SELECT * FROM public."Transaction" WHERE ("userId" = $1 OR "userId" IS NULL) ORDER BY "createdAt" DESC LIMIT 1`
    : `SELECT * FROM public."Transaction" ORDER BY "createdAt" DESC LIMIT 1`;
  const res = await executeSql(selectSql, userId ? [userId] : []);

  if (!res.rows || res.rows.length === 0) return null;
  const last = res.rows[0];

  await executeSql('DELETE FROM public."Transaction" WHERE id = $1', [last.id]);
  return last;
}

/**
 * Filter & Search Transaksi Personal
 */
export async function queryTransactions(filter: QueryTransactionsFilter, userId?: string) {
  await connectDatabase();

  const sql = userId
    ? `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id
       WHERE t."userId" = $1
       ORDER BY t."createdAt" DESC`
    : `SELECT t.*, w.name as wallet_name, c.name as category_name 
       FROM public."Transaction" t
       LEFT JOIN public."Wallet" w ON t."walletId" = w.id
       LEFT JOIN public."Category" c ON t."categoryId" = c.id
       ORDER BY t."createdAt" DESC`;

  const res = await executeSql(sql, userId ? [userId] : []);
  let matched = res.rows || [];

  if (filter.type) {
    matched = matched.filter((t: any) => t.type === filter.type);
  }
  if (filter.wallet) {
    const targetW = filter.wallet.toLowerCase();
    matched = matched.filter((t: any) => (t.wallet_name || "").toLowerCase().includes(targetW));
  }
  if (filter.category) {
    const targetC = filter.category.toLowerCase();
    matched = matched.filter((t: any) => (t.category_name || "").toLowerCase().includes(targetC));
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    matched = matched.filter((t: any) => {
      const desc = (t.description || "").toLowerCase();
      const raw = (t.rawText || "").toLowerCase();
      return desc.includes(kw) || raw.includes(kw);
    });
  }
  if (filter.minAmount) {
    matched = matched.filter((t: any) => BigInt(t.amount) >= BigInt(filter.minAmount!));
  }
  if (filter.maxAmount) {
    matched = matched.filter((t: any) => BigInt(t.amount) <= BigInt(filter.maxAmount!));
  }

  let totalAmount = 0n;
  for (const t of matched) {
    totalAmount += BigInt(t.amount);
  }

  const limit = filter.limit || 5;
  const items: RecentTransactionItem[] = matched.slice(0, limit).map((t: any) => ({
    id: t.id,
    type: t.type,
    amount: formatIDR(BigInt(t.amount)),
    description: t.description,
    wallet: t.wallet_name || "Cash",
    category: t.category_name || "Lainnya",
    deviceType: t.deviceType || "MOBILE",
    date: t.createdAt
      ? new Date(t.createdAt).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-",
  }));

  return {
    count: matched.length,
    total: formatIDR(totalAmount),
    totalRaw: totalAmount,
    items,
  };
}
