import { clearAllDebts, getDebtsSummary, payDebt, recordDebt } from "../../prisma/finance.ts";
import { googleSheetsService } from "../../services/sheets.ts";
import type { ActionContext } from "./types.ts";

export async function handleManageDebt(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const action = plan.args.action || "LIST";

    if (action === "CLEAR") {
      const res = await clearAllDebts(user.id);

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncDebtsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab hutang setelah dikosongkan:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `🗑️ *Buku Hutang & Piutang Telah Dikosongkan!*\n` +
        `Total *${res.deletedCount}* catatan hutang/piutang telah dihapus dari database dan Google Spreadsheet Anda.\n\n` +
        `💡 _Ketik "pinjam uang budi 50rb" jika ingin mencatat hutang/piutang baru._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    if (action === "RECORD") {
      const type = (plan.args.type || "DEBT") as "DEBT" | "RECEIVABLE";
      const personName = plan.args.personName || "Teman";
      const amount = Number(plan.args.amount) || 0;
      const desc = plan.args.description || plan.args.notes || "Catatan pinjaman";

      if (amount <= 0) {
        await sock.sendMessage(remoteJid, { text: "Mohon sertakan nominal hutang/piutang yang valid." }, { quoted: msg });
        return;
      }

      const res = await recordDebt({
        type,
        personName,
        amount,
        description: desc,
        userId: user.id,
        jid: deviceInfo.jid,
      });

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncDebtsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab hutang:", sErr);
        }
      }

      const label = type === "DEBT" ? "Hutang ke" : "Piutang (Dipinjam oleh)";
      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `🤝 *Catatan ${label} Berhasil Disimpan!*\n` +
        `👤 *Pihak:* ${res.personName}\n` +
        `💰 *Nominal:* ${res.amount}\n` +
        `📝 *Keterangan:* ${desc}\n\n` +
        `💡 _Ketik "daftar hutang" untuk mengecek semua tagihan aktif._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    if (action === "PAY") {
      const personName = plan.args.personName || "";
      const amount = Number(plan.args.amount) || 0;

      const res = await payDebt({
        personName,
        amount,
        userId: user.id,
      });

      if (!res) {
        await sock.sendMessage(
          remoteJid,
          { text: `⚠️ Tidak ditemukan catatan hutang/piutang aktif atas nama *"${personName}"*.` },
          { quoted: msg }
        );
        return;
      }

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncDebtsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab hutang setelah bayar:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `✅ *Pembayaran Berhasil Dicatat!*\n` +
        `👤 *Pihak:* ${res.personName}\n` +
        `💵 *Nominal Dibayar:* ${res.paidAmount}\n` +
        `💰 *Sisa Tagihan:* ${res.remainingAmount} (${res.status === "PAID" ? "LUNAS 🎉" : "Sisa Sebagian"})\n`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    // LIST DEBTS
    const summary = await getDebtsSummary(user.id);
    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `📋 *Buku Catatan Hutang & Piutang*\n`;
    reply += `🔴 Total Hutang Saya: *${summary.totalPayable}*\n`;
    reply += `🟢 Total Piutang (Uang di orang): *${summary.totalReceivable}*\n\n`;

    if (summary.debts.length > 0) {
      reply += `📌 *Hutang yang Perlu Dibayar:*\n`;
      summary.debts.forEach((d, idx) => {
        reply += `${idx + 1}. Ke *${d.personName}*: ${d.remaining} (Total: ${d.amount}) [${d.status}]\n`;
        reply += `   📝 ${d.description}\n`;
      });
      reply += `\n`;
    }

    if (summary.receivables.length > 0) {
      reply += `📌 *Piutang yang Perlu Ditagih:*\n`;
      summary.receivables.forEach((r, idx) => {
        reply += `${idx + 1}. Di *${r.personName}*: ${r.remaining} (Total: ${r.amount}) [${r.status}]\n`;
        reply += `   📝 ${r.description}\n`;
      });
      reply += `\n`;
    }

    if (summary.debts.length === 0 && summary.receivables.length === 0) {
      reply += `✨ _Alhamdulillah tidak ada hutang atau piutang aktif saat ini._\n\n`;
    }

    reply += `💡 _Contoh catat: "pinjam uang budi 50rb" atau "si tono pinjam uang 30k"_`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengelola hutang:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengelola data hutang dan piutang." }, { quoted: msg });
  }
}
