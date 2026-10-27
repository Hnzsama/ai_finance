import { syncDashboardToNotion } from "../../services/notion.ts";
import type { ActionContext } from "./types.ts";

export async function handleSyncNotion(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, plan } = ctx;

  const result = await syncDashboardToNotion(user.id);
  let reply = plan.reply ? `${plan.reply}\n\n` : "";

  if (result.success && result.pageUrl) {
    reply +=
      `📊 *Visualisasi Dashboard Notion Berhasil Disinkronkan!*\n\n` +
      `🔗 *Buka Dashboard Notion Anda:*\n` +
      `${result.pageUrl}\n\n` +
      `✨ *Fitur yang dapat Anda lihat di Notion:*\n` +
      `• 💳 Likuiditas & Saldo Dompet (Cash, ShopeePay, GoPay, Krom Bank)\n` +
      `• 🪙 Portofolio Aset & Investasi (Emas Batangan 4 Gram Antam, Motor, Laptop, dsb)\n` +
      `• 🎯 Evaluasi Anggaran Belanja (Budgeting Bulanan)\n` +
      `• 🔄 Langganan Aktif & Rekap Piutang Teman`;
  } else {
    reply +=
      `⚠️ *Gagal Menghubungkan ke Notion!*\n` +
      `Pastikan variabel \`NOTION_API_TOKEN\` telah terkonfigurasi dengan benar di file \`.env\`.`;
  }

  await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
}
