import { connectDatabase, executeSql } from "../db.ts";
import { getOrCreateCategory } from "./categories.ts";
import { formatIDR, type BudgetParams } from "./types.ts";

/**
 * Fitur Budgeting: Atur Batasan Anggaran Pengeluaran Kategori
 */
export async function setCategoryBudget({
  categoryName,
  amount,
  period = "MONTHLY",
  userId,
  jid,
}: BudgetParams) {
  await connectDatabase();
  const category = await getOrCreateCategory(categoryName, "EXPENSE", userId, jid);
  const amtBig = BigInt(amount);

  const checkSql = userId
    ? `SELECT id FROM public."Budget" WHERE "userId" = $1 AND "categoryId" = $2 LIMIT 1`
    : `SELECT id FROM public."Budget" WHERE "userId" IS NULL AND "categoryId" = $1 LIMIT 1`;
  const checkParams = userId ? [userId, category.id] : [category.id];
  const res = await executeSql(checkSql, checkParams);

  if (res.rows && res.rows.length > 0) {
    await executeSql(
      `UPDATE public."Budget" SET amount = $1, period = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
      [amtBig.toString(), period, res.rows[0].id]
    );
  } else {
    await executeSql(
      `INSERT INTO public."Budget" ("id", "userId", "jid", "categoryId", "amount", "period", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId || null, jid || null, category.id, amtBig.toString(), period]
    );
  }

  return {
    category: category.name,
    budgetAmount: formatIDR(amtBig),
    period,
  };
}

/**
 * Cek Evaluasi & Status Budget Pengguna
 */
export async function getBudgetsSummary(userId?: string) {
  await connectDatabase();

  const bSql = userId
    ? `SELECT b.*, c.name as category_name 
       FROM public."Budget" b
       JOIN public."Category" c ON b."categoryId" = c.id
       WHERE b."userId" = $1`
    : `SELECT b.*, c.name as category_name 
       FROM public."Budget" b
       JOIN public."Category" c ON b."categoryId" = c.id`;
  const bRes = await executeSql(bSql, userId ? [userId] : []);
  const budgets = bRes.rows || [];

  if (budgets.length === 0) {
    return { count: 0, items: [], totalBudget: "Rp 0", totalSpent: "Rp 0", totalBudgetRaw: 0n, totalSpentRaw: 0n };
  }

  // Hitung pengeluaran kategori di bulan ini
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const expSql = userId
    ? `SELECT "categoryId", SUM(amount) as total
       FROM public."Transaction"
       WHERE "userId" = $1 
         AND type = 'EXPENSE'
         AND EXTRACT(MONTH FROM "createdAt") = $2
         AND EXTRACT(YEAR FROM "createdAt") = $3
       GROUP BY "categoryId"`
    : `SELECT "categoryId", SUM(amount) as total
       FROM public."Transaction"
       WHERE type = 'EXPENSE'
         AND EXTRACT(MONTH FROM "createdAt") = $1
         AND EXTRACT(YEAR FROM "createdAt") = $2
       GROUP BY "categoryId"`;
  const expParams = userId ? [userId, currentMonth, currentYear] : [currentMonth, currentYear];
  const expRes = await executeSql(expSql, expParams);
  const spentMap = new Map<string, bigint>();
  for (const r of expRes.rows || []) {
    spentMap.set(r.categoryId, BigInt(r.total || 0));
  }

  let totalLimit = 0n;
  let totalSpent = 0n;

  const items = budgets.map((b: any) => {
    const limit = BigInt(b.amount);
    const spent = spentMap.get(b.categoryId) || 0n;
    totalLimit += limit;
    totalSpent += spent;

    const remaining = limit - spent;
    const pct = limit > 0n ? Math.round((Number(spent) / Number(limit)) * 100) : 0;

    let status = "SAFE";
    if (pct >= 100) status = "OVERBUDGET";
    else if (pct >= 80) status = "WARNING";

    return {
      id: b.id,
      category: b.category_name,
      limit: formatIDR(limit),
      limitRaw: limit,
      spent: formatIDR(spent),
      spentRaw: spent,
      remaining: formatIDR(remaining > 0n ? remaining : 0n),
      remainingRaw: remaining,
      percentage: pct,
      status, // 'SAFE' | 'WARNING' | 'OVERBUDGET'
      period: b.period,
    };
  });

  return {
    count: items.length,
    totalBudget: formatIDR(totalLimit),
    totalBudgetRaw: totalLimit,
    totalSpent: formatIDR(totalSpent),
    totalSpentRaw: totalSpent,
    items,
  };
}
