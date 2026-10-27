import { getBudgetsSummary, setCategoryBudget } from "../../prisma/finance.ts";
import type { ActionContext } from "./types.ts";

export async function handleSetBudget(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const category = plan.args.category || "Makanan & Minuman";
    const amount = Number(plan.args.amount) || 0;
    const period = plan.args.period || "MONTHLY";

    if (amount <= 0) {
      await sock.sendMessage(
        remoteJid,
        { text: "Mohon tentukan nominal batas anggaran (budget) yang valid." },
        { quoted: msg }
      );
      return;
    }

    const res = await setCategoryBudget({
      categoryName: category,
      amount,
      period,
      userId: user.id,
      jid: deviceInfo.jid,
    });

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply +=
      `🎯 *Batas Anggaran (Budget) Disimpan!*\n` +
      `🏷️ *Kategori:* ${res.category}\n` +
      `💰 *Limit Anggaran:* ${res.budgetAmount} per bulan\n\n` +
      `💡 _Ketik "cek budget" kapan saja untuk melihat sisa jatah belanja bulan ini._`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengatur budget:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengatur batas anggaran." }, { quoted: msg });
  }
}

export async function handleGetBudgets(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan } = ctx;
  try {
    const res = await getBudgetsSummary(user.id);
    if (res.count === 0) {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `📊 *Belum Ada Budget yang Diatur!*\n\n` +
            `Yuk buat batasan jajan biar gak boncos! Contoh:\n` +
            `• _"budget makan 750rb"_\n` +
            `• _"set budget bensin 350k"_\n` +
            `• _"budget kuota 100rb"_`,
        },
        { quoted: msg }
      );
      return;
    }

    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `🎯 *Evaluasi Anggaran & Budget Bulan Ini*\n`;
    reply += `💰 Total Budget: *${res.totalBudget}* | Terpakai: *${res.totalSpent}*\n\n`;

    res.items.forEach((b: any, idx: number) => {
      let icon = "🟢";
      let statusTag = "Aman";
      if (b.status === "OVERBUDGET") {
        icon = "🔴";
        statusTag = "OVERBUDGET!";
      } else if (b.status === "WARNING") {
        icon = "🟡";
        statusTag = "Mendekati Limit";
      }

      reply += `${idx + 1}. ${icon} *${b.category}* [${statusTag}]\n`;
      reply += `   Limit: ${b.limit} | Terpakai: ${b.spent} (${b.percentage}%)\n`;
      reply += `   Sisa Anggaran: *${b.remaining}*\n\n`;
    });

    reply += `💡 _Disiplin pantau budget agar keuangan mahasiswa & sampingan tetap sehat!_`;

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengecek budget:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengambil evaluasi budget." }, { quoted: msg });
  }
}
