import { googleSheetsService } from "../../services/sheets.ts";
import { updateUserSpreadsheet } from "../../services/user.ts";
import type { ActionContext } from "./types.ts";

export async function handleConnectSheet(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, plan, rawText } = ctx;
  const clientEmail = googleSheetsService.getClientEmail();
  const rawUrl = plan.args.url || rawText;
  const sheetId = googleSheetsService.extractSpreadsheetId(rawUrl);

  if (!sheetId) {
    const tutorial =
      `📋 *Panduan Menghubungkan Google Spreadsheet Pribadi Anda:*\n\n` +
      `1. Buat spreadsheet di Google Sheets.\n` +
      `2. Bagikan (Share) spreadsheet Anda dengan status *Editor* ke:\n` +
      `   📧 \`${clientEmail}\`\n` +
      `3. Kirim kembali link spreadsheet Anda ke sini.`;
    await sock.sendMessage(remoteJid, { text: tutorial }, { quoted: msg });
    return;
  }

  const verify = await googleSheetsService.verifyAccess(sheetId);
  if (!verify.valid) {
    const errMsg =
      `⚠️ *Izin Belum Terpasang!*\n` +
      `Pastikan Anda telah menambahkan email ini sebagai *Editor*:\n` +
      `📧 \`${clientEmail}\``;
    await sock.sendMessage(remoteJid, { text: errMsg }, { quoted: msg });
    return;
  }

  await updateUserSpreadsheet(user.id, sheetId, rawUrl);
  const currentYear = new Date().getFullYear();
  await googleSheetsService.ensureYearTab(sheetId, currentYear);
  const syncResult = await googleSheetsService.syncAllUserTransactions(user.id, sheetId);

  let reply = plan.reply ? `${plan.reply}\n\n` : "";
  reply +=
    `✅ *Google Spreadsheet Terhubung!*\n` +
    `📊 Dokumen: *${verify.title}*\n` +
    `📅 Tab: *${currentYear}* (Tersedia filter dropdown bulan & rekap otomatis)\n` +
    `🔄 Sinkronisasi: *${syncResult.syncedCount} transaksi* telah dimasukkan ke sheet.`;

  await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
}

export async function handleSyncSheet(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, plan } = ctx;
  if (!user.spreadsheetId) {
    const clientEmail = googleSheetsService.getClientEmail();
    await sock.sendMessage(
      remoteJid,
      {
        text:
          `⚠️ *Google Spreadsheet Belum Terhubung!*\n\n` +
          `Untuk menyinkronkan data, silakan buat Google Sheets baru, berikan akses Editor ke:\n` +
          `📧 \`${clientEmail}\`\n\n` +
          `Lalu kirimkan link spreadsheet Anda ke sini dengan format:\n` +
          `_hubungkan sheet <link_spreadsheet>_`,
      },
      { quoted: msg }
    );
    return;
  }

  const syncResult = await googleSheetsService.syncAllUserTransactions(user.id, user.spreadsheetId);
  let reply = plan.reply ? `${plan.reply}\n\n` : "";
  if (syncResult.error) {
    reply += `⚠️ Terjadi kendala sinkronisasi: ${syncResult.error}`;
  } else {
    reply +=
      `🔄 *Sinkronisasi Google Sheets Berhasil!*\n` +
      `📊 *${syncResult.syncedCount} transaksi* telah diperbarui ke tab tahunan masing-masing.\n` +
      `💡 Buka tab tahun di Google Sheets Anda dan gunakan dropdown di sel B4 untuk memfilter per bulan.`;
  }
  await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
}
