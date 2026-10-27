import {
  deleteLastTransaction,
  formatIDR,
  getFinancialSummary,
  getRecentTransactions,
  queryTransactions,
  resetAllTransactions,
  saveTransaction,
} from "../../prisma/finance.ts";
import { googleSheetsService } from "../../services/sheets.ts";
import { syncTransactionToNotion } from "../../services/notion.ts";
import { detectCategory } from "../parser.js";
import type { ActionContext } from "./types.ts";

export async function handleRecordTransaction(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan, rawText } = ctx;
  try {
    const rawAmount = Number(plan.args.amount);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      await sock.sendMessage(
        remoteJid,
        { text: plan.reply || "Mohon sertakan nominal transaksi yang jelas." },
        { quoted: msg }
      );
      return;
    }

    const isIncome = plan.args.type === "INCOME";
    const detected = detectCategory(rawText, isIncome);
    const categoryName =
      detected && !detected.includes("Lainnya")
        ? detected
        : plan.args.category || (isIncome ? "Pendapatan Freelance" : "Lainnya (Pengeluaran)");

    const saved = await saveTransaction({
      data: {
        type: plan.args.type || "EXPENSE",
        amount: rawAmount,
        description: plan.args.description || (isIncome ? "Pemasukan" : "Pengeluaran"),
        category: categoryName,
        wallet: plan.args.wallet || null,
      },
      userId: user.id,
      userPhone: user.phoneNumber,
      jid: deviceInfo.jid,
      deviceType: deviceInfo.deviceType,
      rawText,
    });

    let sheetStatusText = "";
    if (user.spreadsheetId) {
      try {
        await googleSheetsService.appendTransaction(user.spreadsheetId, {
          type: isIncome ? "INCOME" : "EXPENSE",
          amount: rawAmount,
          description: plan.args.description || "Pengeluaran",
          category: saved.category.name,
          wallet: saved.wallet.name,
          deviceType: deviceInfo.deviceType,
          jid: deviceInfo.jid,
        });
        sheetStatusText = `\n📊 *Google Sheets:* Tersinkron otomatis ke Tab ${new Date().getFullYear()}`;
      } catch (sheetErr) {
        console.error("[GoogleSheets] Gagal auto-append:", sheetErr);
      }
    }

    // Background sync ke Notion Database jika token tersedia
    syncTransactionToNotion({
      description: plan.args.description || (isIncome ? "Pemasukan" : "Pengeluaran"),
      type: isIncome ? "INCOME" : "EXPENSE",
      amount: rawAmount,
      walletName: saved.wallet.name,
      categoryName: saved.category.name,
    }).catch((notionErr) => console.error("[Notion] Background auto-sync error:", notionErr));

    const icon = isIncome ? "💵 Pemasukan" : "💸 Pengeluaran";
    const amountStr = formatIDR(rawAmount);
    const devTag = deviceInfo.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱";

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply +=
      `✅ *Tercatat:* ${icon} ${amountStr}\n` +
      `📝 *Keterangan:* ${plan.args.description || "Pengeluaran"}\n` +
      `💳 *Dompet:* ${saved.wallet.name} _(Saldo saat ini: ${saved.walletBalance})_\n` +
      `🏷️ *Kategori:* ${saved.category.name}\n` +
      `📱 *Perangkat:* ${devTag}` +
      sheetStatusText;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mencatat transaksi:", err);
    await sock.sendMessage(
      remoteJid,
      { text: `${plan.reply}\n\n⚠️ _(Catatan: Database offline, tersimpan di memori log)_` },
      { quoted: msg }
    );
  }
}

export async function handleDeleteLastTransaction(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const deleted = await deleteLastTransaction(user.id);
    if (!deleted) {
      await sock.sendMessage(
        remoteJid,
        { text: plan.reply || "Belum ada transaksi untuk dibatalkan." },
        { quoted: msg }
      );
      return;
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply +=
      `🗑️ *Transaksi Terakhir Dibatalkan/Dihapus!*\n` +
      `Keterangan: *${deleted.description}*\n` +
      `Nominal: *${formatIDR(BigInt(deleted.amount))}*\n` +
      `Data saldo dompet telah disesuaikan kembali.`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal menghapus transaksi:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal menghapus transaksi terakhir." }, { quoted: msg });
  }
}

export async function handleQueryTransactions(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const result = await queryTransactions(
      {
        keyword: plan.args.keyword || undefined,
        wallet: plan.args.wallet || undefined,
        category: plan.args.category || undefined,
        minAmount: plan.args.minAmount ? Number(plan.args.minAmount) : undefined,
        type: plan.args.type || undefined,
        limit: 5,
      },
      user.id
    );

    if (result.count === 0) {
      await sock.sendMessage(
        remoteJid,
        { text: plan.reply || `🔍 Tidak ditemukan transaksi yang cocok dengan kriteria pencarian Anda.` },
        { quoted: msg }
      );
      return;
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `🔍 *Hasil Pencarian Transaksi:*\n`;
    reply += `📊 Total Ditemukan: *${result.count} transaksi* (${result.total})\n\n`;

    result.items.forEach((t, idx: number) => {
      const icon = t.type === "INCOME" ? "📈" : "📉";
      const dev = t.deviceType === "DESKTOP" ? "💻" : "📱";
      reply += `${idx + 1}. ${icon} *${t.description}* - *${t.amount}* ${dev}\n`;
      reply += `   📅 ${t.date} | 💳 ${t.wallet} | 🏷️ ${t.category}\n\n`;
    });

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal query transaksi:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal melakukan pencarian transaksi." }, { quoted: msg });
  }
}

export async function handleGetRecentTransactions(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const limit = Number(plan.args.limit) || 5;
    const recents = await getRecentTransactions(limit, user.id);

    if (recents.length === 0) {
      await sock.sendMessage(
        remoteJid,
        { text: plan.reply || "Belum ada transaksi yang tercatat nih. Coba ketik: _'kopi 25k pake gopay'_ untuk mulai mencatat!" },
        { quoted: msg }
      );
      return;
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `🕒 *Riwayat ${recents.length} Transaksi Terakhir Anda:*\n\n`;
    recents.forEach((t, idx: number) => {
      const icon = t.type === "INCOME" ? "📈" : "📉";
      const dev = t.deviceType === "DESKTOP" ? "💻" : "📱";
      reply += `${idx + 1}. ${icon} *${t.description}* - *${t.amount}* ${dev}\n`;
      reply += `   📅 ${t.date} | 💳 ${t.wallet} | 🏷️ ${t.category}\n\n`;
    });

    reply += `💡 _Ketik *rekap* untuk melihat ringkasan keuangan._`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengambil riwayat:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengambil riwayat transaksi." }, { quoted: msg });
  }
}

export async function handleResetTransactions(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    await resetAllTransactions(user.id);
    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply +=
      `🔄 *Status Data:* Riwayat transaksi Anda telah dikosongkan (Saldo semua dompet kembali ke Rp 0).\n\n` +
      `💡 _Contoh atur saldo awal: "saldo awal bca 5jt" atau "cash ada 250rb"_`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal reset transaksi:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Terjadi kendala saat mereset data keuangan Anda." }, { quoted: msg });
  }
}

export async function handleGetSummary(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const summary = await getFinancialSummary(user.id);

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply +=
      `📊 *Ringkasan Keuangan Pribadi Anda*\n\n` +
      `📈 Total Pemasukan: *${summary.totalIncome}*\n` +
      `📉 Total Pengeluaran: *${summary.totalExpense}*\n` +
      `💰 Saldo Bersih: *${summary.balance}*\n` +
      `📝 Total Transaksi: *${summary.transactionCount}*\n`;

    if (summary.categoryBreakdown.length > 0) {
      reply += `\n🏷️ *Pengeluaran per Kategori:*\n`;
      for (const cat of summary.categoryBreakdown) {
        reply += `• ${cat.name}: *${cat.amount}* (${cat.percentage}%)\n`;
      }
    }

    if (summary.walletBreakdown.length > 0) {
      reply += `\n💳 *Pengeluaran per Dompet:*\n`;
      for (const w of summary.walletBreakdown) {
        reply += `• ${w.name}: *${w.expense}*\n`;
      }
    }

    if (user.spreadsheetId) {
      reply += `\n📊 _Rekap lengkap per bulan tersedia di Google Sheets Anda._`;
    }

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengambil summary:", err);
    await sock.sendMessage(remoteJid, { text: plan.reply || "⚠️ Gagal mengambil ringkasan." }, { quoted: msg });
  }
}
