import { connectDatabase, executeSql } from "../db.ts";
import { formatIDR, type TransferParams } from "./types.ts";
import { getOrCreateWallet, getSpecificWalletBalance } from "./wallets.ts";

/**
 * Fitur Pindah Antar Dompet & Mutasi COD ShopeeFood
 * Saat driver dapat order COD: Saldo ShopeePay berkurang, uang Cash bertambah!
 */
export async function transferBalance({
  fromWalletName,
  toWalletName,
  amount,
  adminFee = 0n,
  type = "TRANSFER",
  description,
  userId,
  jid,
}: TransferParams) {
  await connectDatabase();

  const fromW = await getOrCreateWallet(fromWalletName, userId, jid);
  const toW = await getOrCreateWallet(toWalletName, userId, jid);

  const amtBig = BigInt(amount);
  const feeBig = BigInt(adminFee);
  const transferId = crypto.randomUUID();

  let autoDesc = description;
  if (!autoDesc) {
    if (type === "COD_SETTLEMENT") {
      autoDesc = `Settlement Pesanan COD ShopeeFood (Potong ${fromW.name}, Masuk ${toW.name})`;
    } else {
      autoDesc = `Pindah saldo dari ${fromW.name} ke ${toW.name}`;
    }
  }

  await executeSql(
    `INSERT INTO public."Transfer"
     ("id", "userId", "jid", "fromWalletId", "toWalletId", "amount", "adminFee", "type", "description", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      transferId,
      userId || null,
      jid || null,
      fromW.id,
      toW.id,
      amtBig.toString(),
      feeBig.toString(),
      type,
      autoDesc,
    ]
  );

  const fromBal = await getSpecificWalletBalance(fromW.id, userId);
  const toBal = await getSpecificWalletBalance(toW.id, userId);

  return {
    transferId,
    type,
    amount: formatIDR(amtBig),
    adminFee: formatIDR(feeBig),
    description: autoDesc,
    fromWallet: { name: fromW.name, balance: formatIDR(fromBal) },
    toWallet: { name: toW.name, balance: formatIDR(toBal) },
  };
}
