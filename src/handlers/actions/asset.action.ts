import { clearAllAssets, getAssetsSummary, recordAsset } from "../../prisma/finance.ts";
import { googleSheetsService } from "../../services/sheets.ts";
import type { ActionContext } from "./types.ts";

export async function handleManageAssets(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, deviceInfo, switchNotice, plan } = ctx;
  try {
    const action = plan.args.action || "LIST";

    if (action === "CLEAR") {
      const res = await clearAllAssets(user.id);

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncAssetsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab aset setelah dikosongkan:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `🗑️ *Daftar Aset Telah Dikosongkan!*\n` +
        `Total *${res.deletedCount}* aset telah dihapus dari inventaris portofolio dan Google Spreadsheet Anda.\n\n` +
        `💡 _Ketik "tambah aset motor beat 12jt" jika ingin mendaftarkan aset baru._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    if (action === "RECORD") {
      const name = plan.args.name || "Aset Pribadi";
      const value = Number(plan.args.value) || 0;
      const category = (plan.args.category || "OTHER") as "VEHICLE" | "ELECTRONIC" | "FINANCIAL" | "OTHER";

      if (value <= 0) {
        await sock.sendMessage(remoteJid, { text: "Mohon sertakan nilai taksiran aset yang valid." }, { quoted: msg });
        return;
      }

      const res = await recordAsset({
        name,
        category,
        value,
        userId: user.id,
        jid: deviceInfo.jid,
      });

      if (user.spreadsheetId) {
        try {
          await googleSheetsService.syncAssetsTab(user.spreadsheetId, user.id);
        } catch (sErr) {
          console.error("[Google Sheets] Gagal sinkron tab aset:", sErr);
        }
      }

      let reply = plan.reply ? `${plan.reply}\n\n` : "";
      reply +=
        `🛵 *Aset Berhasil Didaftarkan!*\n` +
        `🏷️ *Nama Aset:* ${res.name}\n` +
        `📦 *Kategori:* ${res.category}\n` +
        `💰 *Nilai Taksiran:* ${res.value}\n\n` +
        `💡 _Ketik "daftar aset" untuk melihat total valuasi harta Anda._`;

      await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
      return;
    }

    // LIST ASSETS
    const res = await getAssetsSummary(user.id);
    let reply = plan.reply ? `${plan.reply}\n\n` : "";
    reply += `🏍️ *Daftar Aset & Valuasi Harta*\n`;
    reply += `💎 Total Nilai Aset: *${res.totalValue}* (${res.count} barang)\n\n`;

    if (res.count === 0) {
      reply += `_Belum ada aset yang tercatat. Contoh: "tambah aset motor beat 12jt" atau "tambah aset laptop asus 9jt"_\n`;
    } else {
      res.items.forEach((a: any, idx: number) => {
        let catIcon = "📦";
        if (a.category === "VEHICLE") catIcon = "🛵";
        else if (a.category === "ELECTRONIC") catIcon = "💻";
        else if (a.category === "FINANCIAL") catIcon = "🪙";

        reply += `${idx + 1}. ${catIcon} *${a.name}* - *${a.value}*\n`;
        if (a.notes && a.notes !== "-") {
          reply += `   📝 ${a.notes}\n`;
        }
      });
    }

    await sock.sendMessage(remoteJid, { text: switchNotice + reply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengelola aset:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengelola data aset." }, { quoted: msg });
  }
}
