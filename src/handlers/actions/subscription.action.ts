import { clearAllSubscriptions, getSubscriptionsSummary, recordSubscription } from "../../prisma/finance.ts";
import { googleSheetsService } from "../../services/sheets.ts";
import type { ActionContext } from "./types.ts";

export async function handleManageSubscriptions(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const action = plan.args.action || "LIST";

    if (action === "CLEAR") {
      const res = await clearAllSubscriptions(user.id);

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncSubscriptionsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab langganan setelah dikosongkan:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `🗑️ *Daftar Langganan Telah Dikosongkan!*\n` +
        `Total *${res.deletedCount}* langganan rutin telah dihapus dari database dan Google Spreadsheet Anda.\n\n` +
        `💡 _Ketik "langganan spotify 27k" jika ingin mendaftarkan langganan baru._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    if (action === "RECORD") {
      const name = plan.args.name || "Langganan Bulanan";
      const amount = Number(plan.args.amount) || 0;
      const billingDay = plan.args.billingDay ? Number(plan.args.billingDay) : undefined;
      const walletName = plan.args.walletName || "ShopeePay";

      if (amount <= 0) {
        await sock.sendMessage(remoteJid, { text: "Mohon sertakan nominal biaya langganan yang valid." }, { quoted: msg });
        return;
      }

      const res = await recordSubscription({
        name,
        amount,
        billingCycle: "MONTHLY",
        billingDay,
        walletName,
        userId: user.id,
        jid: deviceInfo.jid,
      });

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncSubscriptionsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab langganan:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `📅 *Langganan Berhasil Didaftarkan!*\n` +
        `📦 *Nama Layanan:* ${res.name}\n` +
        `💵 *Biaya:* ${res.amount} / bulan\n` +
        `💳 *Sumber Pemotong:* ${walletName}\n\n` +
        `💡 _Ketik "daftar langganan" untuk melihat total komitmen bulanan Anda._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    // LIST SUBSCRIPTIONS
    const res = await getSubscriptionsSummary(user.id);
    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `📅 *Daftar Langganan & Tagihan Rutin*\n`;
    reply += `💳 Total Beban Bulanan: *${res.monthlyTotal}* (${res.count} layanan aktif)\n\n`;

    if (res.count === 0) {
      reply += `_Belum ada langganan aktif. Contoh: "langganan spotify 27k" atau "langganan kuota internet 85rb"_\n`;
    } else {
      res.items.forEach((s: any, idx: number) => {
        reply += `${idx + 1}. 🎵 *${s.name}* - *${s.amount}*\n`;
        reply += `   💳 Pemotong: ${s.wallet} | ⏰ Tagihan: ${s.billingDay}\n`;
      });
    }

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengelola langganan:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengelola data langganan." }, { quoted: msg });
  }
}
