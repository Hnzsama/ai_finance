import { connectDatabase, executeSql } from "../db.ts";
import { formatIDR, type AssetParams } from "./types.ts";

/**
 * Fitur Aset Mahasiswa / Freelancer / Driver
 */
export async function recordAsset({
  name,
  category = "VEHICLE",
  value,
  purchasePrice,
  notes,
  userId,
  jid,
}: AssetParams) {
  await connectDatabase();
  const valBig = BigInt(value);
  const pPriceBig = purchasePrice ? BigInt(purchasePrice) : null;
  const assetId = crypto.randomUUID();

  await executeSql(
    `INSERT INTO public."Asset" ("id", "userId", "jid", "name", "category", "value", "purchasePrice", "notes", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      assetId,
      userId || null,
      jid || null,
      name.trim(),
      category,
      valBig.toString(),
      pPriceBig ? pPriceBig.toString() : null,
      notes || null,
    ]
  );

  return {
    id: assetId,
    name,
    category,
    value: formatIDR(valBig),
  };
}

export async function getAssetsSummary(userId?: string) {
  await connectDatabase();
  const sql = userId
    ? `SELECT * FROM public."Asset" WHERE "userId" = $1 ORDER BY "value" DESC`
    : `SELECT * FROM public."Asset" ORDER BY "value" DESC`;
  const res = await executeSql(sql, userId ? [userId] : []);
  const assets = res.rows || [];

  let totalValue = 0n;
  for (const a of assets) {
    totalValue += BigInt(a.value);
  }

  return {
    count: assets.length,
    totalValue: formatIDR(totalValue),
    items: assets.map((a: any) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      value: formatIDR(BigInt(a.value)),
      notes: a.notes || "-",
    })),
  };
}

export async function clearAllAssets(userId?: string): Promise<{ deletedCount: number }> {
  await connectDatabase();
  const sql = userId
    ? `DELETE FROM public."Asset" WHERE "userId" = $1`
    : `DELETE FROM public."Asset"`;
  const res = await executeSql(sql, userId ? [userId] : []);
  return { deletedCount: res.rowCount || 0 };
}

