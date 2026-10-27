import { connectDatabase, executeSql } from "../db.ts";
import { formatIDR, type DebtParams } from "./types.ts";
import { getOrCreateWallet } from "./wallets.ts";

/**
 * Fitur Hutang & Piutang (Debt / Receivable)
 */
export async function recordDebt({
  type,
  personName,
  amount,
  dueDate,
  description,
  walletName,
  userId,
  jid,
}: DebtParams) {
  await connectDatabase();
  const amtBig = BigInt(amount);
  const debtId = crypto.randomUUID();

  let walletId: string | null = null;
  if (walletName) {
    const w = await getOrCreateWallet(walletName, userId, jid);
    walletId = w.id;
  }

  await executeSql(
    `INSERT INTO public."Debt"
     ("id", "userId", "jid", "type", "personName", "amount", "remainingAmount", "dueDate", "status", "description", "walletId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UNPAID', $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      debtId,
      userId || null,
      jid || null,
      type,
      personName.trim(),
      amtBig.toString(),
      amtBig.toString(),
      dueDate || null,
      description || null,
      walletId,
    ]
  );

  return {
    id: debtId,
    type, // 'DEBT' (Hutang) | 'RECEIVABLE' (Piutang)
    personName,
    amount: formatIDR(amtBig),
    status: "UNPAID",
    description,
  };
}

export async function payDebt({
  personName,
  amount,
  userId,
}: {
  personName: string;
  amount: number | bigint;
  userId?: string;
}) {
  await connectDatabase();
  const amtBig = BigInt(amount);

  const sql = userId
    ? `SELECT * FROM public."Debt" WHERE "userId" = $1 AND LOWER("personName") LIKE LOWER($2) AND status != 'PAID' ORDER BY "createdAt" ASC LIMIT 1`
    : `SELECT * FROM public."Debt" WHERE LOWER("personName") LIKE LOWER($1) AND status != 'PAID' ORDER BY "createdAt" ASC LIMIT 1`;
  const params = userId ? [userId, `%${personName.trim()}%`] : [`%${personName.trim()}%`];
  const res = await executeSql(sql, params);

  if (!res.rows || res.rows.length === 0) return null;
  const debt = res.rows[0];

  const currentRem = BigInt(debt.remainingAmount);
  const newRem = currentRem > amtBig ? currentRem - amtBig : 0n;
  const newStatus = newRem === 0n ? "PAID" : "PARTIAL";

  await executeSql(
    `UPDATE public."Debt" SET "remainingAmount" = $1, status = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
    [newRem.toString(), newStatus, debt.id]
  );

  return {
    personName: debt.personName,
    type: debt.type,
    paidAmount: formatIDR(amtBig),
    remainingAmount: formatIDR(newRem),
    status: newStatus,
  };
}

export async function getDebtsSummary(userId?: string) {
  await connectDatabase();

  const sql = userId
    ? `SELECT * FROM public."Debt" WHERE "userId" = $1 ORDER BY status ASC, "createdAt" DESC`
    : `SELECT * FROM public."Debt" ORDER BY status ASC, "createdAt" DESC`;
  const res = await executeSql(sql, userId ? [userId] : []);
  const all = res.rows || [];

  let totalPayable = 0n; // Hutang kita ke orang
  let totalReceivable = 0n; // Piutang orang ke kita

  const debts = all.filter((d: any) => d.type === "DEBT");
  const receivables = all.filter((d: any) => d.type === "RECEIVABLE");

  for (const d of debts) {
    if (d.status !== "PAID") totalPayable += BigInt(d.remainingAmount);
  }
  for (const r of receivables) {
    if (r.status !== "PAID") totalReceivable += BigInt(r.remainingAmount);
  }

  const formatList = (items: any[]) =>
    items.map((i) => ({
      id: i.id,
      personName: i.personName,
      amount: formatIDR(BigInt(i.amount)),
      remaining: formatIDR(BigInt(i.remainingAmount)),
      status: i.status,
      description: i.description || "-",
    }));

  return {
    totalPayable: formatIDR(totalPayable),
    totalReceivable: formatIDR(totalReceivable),
    debts: formatList(debts),
    receivables: formatList(receivables),
  };
}

export async function clearAllDebts(userId?: string): Promise<{ deletedCount: number }> {
  await connectDatabase();
  const sql = userId
    ? `DELETE FROM public."Debt" WHERE "userId" = $1`
    : `DELETE FROM public."Debt"`;
  const res = await executeSql(sql, userId ? [userId] : []);
  return { deletedCount: res.rowCount || 0 };
}

