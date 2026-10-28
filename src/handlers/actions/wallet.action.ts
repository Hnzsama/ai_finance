import {
  getWalletsSummary,
  setWalletInitialBalance,
  transferBalance,
  type WalletSummaryItem,
} from "../../prisma/finance.ts";
import { googleSheetsService } from "../../services/sheets.ts";
import type { ActionContext } from "./types.ts";

export async function handleListWallets(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const wallets = await getWalletsSummary(user.id);
    const activeWallets = wallets.filter((w: WalletSummaryItem) => w.count > 0);
    const otherWallets = wallets.filter((w: WalletSummaryItem) => w.count === 0);

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `👛 *Daftar Dompet & Akun Keuangan Anda*\n\n`;

    if (activeWallets.length > 0) {
      reply += `📌 *Dompet Aktif:*\n`;
      for (const w of activeWallets) {
        const badge = w.isDefault ? " ⭐ (Default)" : "";
        const icon = w.balanceRaw >= 0n ? "🟢" : "🔴";
        reply += `${icon} *${w.name}*${badge}: *${w.balance}* (${w.count} aktivitas)\n`;
      }
      reply += `\n`;
    }

    if (otherWallets.length > 0) {
      reply += `⚪ *Akun Lainnya:*\n`;
      const names = otherWallets.map((w: WalletSummaryItem) => (w.isDefault ? `*${w.name} (Default)*` : w.name)).join(" • ");
      reply += `${names}\n\n`;
    }

    reply += `💡 _Ketik: "kopi 25k bca", "dapat cod 45k", atau "tf bca ke shopeepay 100k"_`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengambil dompet:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengambil data dompet." }, { quoted: msg });
  }
}

export async function handleSetWalletBalance(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const rawItems: Array<{ wallet: string; amount: number }> =
      plan.args.items && Array.isArray(plan.args.items) && plan.args.items.length > 0
        ? plan.args.items
        : [{ wallet: plan.args.wallet || "Cash", amount: Number(plan.args.amount) || 0 }];

    const updatedList: Array<{ wallet: string; targetBalance: string; amount: number }> = [];
    for (const item of rawItems) {
      const res = await setWalletInitialBalance(item.wallet, Number(item.amount), user.id, deviceInfo.jid);
      updatedList.push({ wallet: res.wallet, targetBalance: res.targetBalance, amount: Number(item.amount) });
    }

    if (user.spreadsheetId) {
      googleSheetsService
        .syncAllUserTransactions(user.id, user.spreadsheetId)
        .catch((sErr) => console.error("[Google Sheets] Gagal sync setelah atur saldo:", sErr));
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `💳 *Saldo Dompet Berhasil Diperbarui:*\n\n`;
    for (const item of updatedList) {
      const icon = item.amount >= 0 ? "🟢" : "🔴";
      const note = item.amount < 0 ? " _(Saldo Minus Normal Driver ShopeeFood)_" : "";
      reply += `${icon} *${item.wallet}:* ${item.targetBalance}${note}\n`;
    }
    reply += `\n📊 *Google Sheets:* Tersinkron otomatis ke Tab ${new Date().getFullYear()} & Ringkasan Dompet.\n`;
    reply += `💡 _Ketik *dompet* untuk cek ringkasan seluruh akun._`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengatur saldo:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengatur saldo dompet." }, { quoted: msg });
  }
}

export async function handleTransferBalance(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const fromWallet = plan.args.fromWallet || (plan.args.isCod ? "ShopeePay" : "BCA");
    const toWallet = plan.args.toWallet || (plan.args.isCod ? "Cash" : "ShopeePay");
    const amount = Number(plan.args.amount) || 0;
    const isCod = Boolean(plan.args.isCod);

    if (amount <= 0) {
      await sock.sendMessage(remoteJid, { text: "Mohon sertakan nominal transfer yang valid." }, { quoted: msg });
      return;
    }

    const res = await transferBalance({
      fromWalletName: fromWallet,
      toWalletName: toWallet,
      amount,
      type: isCod ? "COD_SETTLEMENT" : "TRANSFER",
      description: plan.args.notes || undefined,
      userId: user.id,
      jid: deviceInfo.jid,
    });

    if (user.spreadsheetId) {
      googleSheetsService
        .syncAllUserTransactions(user.id, user.spreadsheetId)
        .catch((sErr) => console.error("[Google Sheets] Gagal sync setelah transfer:", sErr));
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    if (isCod) {
      reply +=
        `📦 *Pesanan COD ShopeeFood Berhasil Diselesaikan!*\n` +
        `💵 *Nominal:* ${res.amount}\n` +
        `📉 *${res.fromWallet.name}:* Terpotong (Sisa: ${res.fromWallet.balance})\n` +
        `📈 *${res.toWallet.name}:* Bertambah (Total: ${res.toWallet.balance})\n\n` +
        `💡 _Uang tunai dari pelanggan sudah tersimpan di dompet Cash Anda._`;
    } else {
      reply +=
        `🔄 *Pindah Saldo Antar Dompet Berhasil!*\n` +
        `💵 *Nominal:* ${res.amount}\n` +
        `📤 *Dari:* ${res.fromWallet.name} (Sisa: ${res.fromWallet.balance})\n` +
        `📥 *Ke:* ${res.toWallet.name} (Total: ${res.toWallet.balance})\n\n` +
        `💡 _Ketik "dompet" untuk melihat semua saldo akun Anda._`;
    }

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal transfer saldo:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal melakukan perpindahan saldo antar dompet." }, { quoted: msg });
  }
}
