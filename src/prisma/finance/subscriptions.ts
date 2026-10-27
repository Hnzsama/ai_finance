import { connectDatabase, executeSql } from "../db.ts";
import { formatIDR, type SubscriptionParams } from "./types.ts";
import { getOrCreateWallet } from "./wallets.ts";

/**
 * Fitur Langganan Berkala (Subscription)
 */
export async function recordSubscription({
  name,
  amount,
  billingCycle = "MONTHLY",
  billingDay,
  walletName,
  notes,
  userId,
  jid,
}: SubscriptionParams) {
  await connectDatabase();
  const amtBig = BigInt(amount);
  const subId = crypto.randomUUID();

  let walletId: string | null = null;
  if (walletName) {
    const w = await getOrCreateWallet(walletName, userId, jid);
    walletId = w.id;
  }

  await executeSql(
    `INSERT INTO public."Subscription" ("id", "userId", "jid", "walletId", "name", "amount", "billingCycle", "billingDay", "status", "notes", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      subId,
      userId || null,
      jid || null,
      walletId,
      name.trim(),
      amtBig.toString(),
      billingCycle,
      billingDay || null,
      notes || null,
    ]
  );

  return {
    id: subId,
    name,
    amount: formatIDR(amtBig),
    billingCycle,
    billingDay,
  };
}

export async function getSubscriptionsSummary(userId?: string) {
  await connectDatabase();
  const sql = userId
    ? `SELECT s.*, w.name as wallet_name 
       FROM public."Subscription" s 
       LEFT JOIN public."Wallet" w ON s."walletId" = w.id
       WHERE s."userId" = $1 AND s.status = 'ACTIVE'`
    : `SELECT s.*, w.name as wallet_name 
       FROM public."Subscription" s 
       LEFT JOIN public."Wallet" w ON s."walletId" = w.id
       WHERE s.status = 'ACTIVE'`;
  const res = await executeSql(sql, userId ? [userId] : []);
  const subs = res.rows || [];

  let monthlyTotal = 0n;
  for (const s of subs) {
    if (s.billingCycle === "MONTHLY") {
      monthlyTotal += BigInt(s.amount);
    }
  }

  return {
    count: subs.length,
    monthlyTotal: formatIDR(monthlyTotal),
    items: subs.map((s: any) => ({
      id: s.id,
      name: s.name,
      amount: formatIDR(BigInt(s.amount)),
      billingDay: s.billingDay ? `Setiap tgl ${s.billingDay}` : "-",
      wallet: s.wallet_name || "-",
      notes: s.notes || "-",
    })),
  };
}

export async function clearAllSubscriptions(userId?: string): Promise<{ deletedCount: number }> {
  await connectDatabase();
  const sql = userId
    ? `DELETE FROM public."Subscription" WHERE "userId" = $1`
    : `DELETE FROM public."Subscription"`;
  const res = await executeSql(sql, userId ? [userId] : []);
  return { deletedCount: res.rowCount || 0 };
}

