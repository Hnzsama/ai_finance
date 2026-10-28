import type { WASocket, proto } from "@whiskeysockets/baileys";
import { getRecentTransactions, getUserSetting } from "../prisma/finance.ts";
import { aiService, type PersonaType } from "../services/ai.js";
import { googleSheetsService } from "../services/sheets.ts";
import {
  linkLidToUser,
  registerUserProfile,
  resolveUserAndDevice,
  updateUserSpreadsheet,
} from "../services/user.ts";
import { dispatchAction, type ActionContext } from "./actions/index.ts";

type WAMessage = proto.IWebMessageInfo;

/**
 * Ekstraksi teks dari berbagai tipe format pesan WhatsApp
 */
export const extractMessageText = (msg: WAMessage): string => {
  const content = msg.message;
  if (!content) return "";

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ""
  ).trim();
};

/**
 * Handler utama untuk incoming messages dengan AI Dynamic Tool Execution & Isolasi Personal
 */
export const handleIncomingMessage = async (
  sock: WASocket,
  msg: WAMessage
): Promise<void> => {
  if (msg.key.fromMe || !msg.message) return;

  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return;

  const text = extractMessageText(msg);
  if (!text) return;

  const senderName = msg.pushName || remoteJid.split("@")[0];
  console.log(`[Message] From ${senderName} (${remoteJid}): "${text}"`);

  // Kirim tanda telah dibaca & aktifkan status 'sedang mengetik...' (typing indicator)
  try {
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate("composing", remoteJid);
  } catch {}

  try {
    // 1. Identifikasi User & Deteksi Perangkat (HP / Laptop @lid)
    const { user, deviceInfo, deviceSwitch } = await resolveUserAndDevice(
      remoteJid,
      senderName,
      msg.key.participant
    );

    let switchNotice = "";
    if (deviceSwitch) {
      console.log(`[Device Switch] ${deviceSwitch.description}`);
      switchNotice = `🔄 *${deviceSwitch.description}*\n\n`;
    }

    const quickCmd = text.toLowerCase().trim();
    if (["ping", "test", "tes", "p"].includes(quickCmd)) {
      const devBadge = deviceInfo.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱 (@s.whatsapp.net)";
      await sock.sendMessage(
        remoteJid,
        {
          text: `${switchNotice}Pong! 🏓 Finny aktif & siap digunakan!\n📱 *Perangkat Aktif:* ${devBadge}\n⚡ *Status:* Online & Siap Catat Keuangan`,
        },
        { quoted: msg }
      );
      return;
    }

    const cleanCmd = quickCmd.replace(/[.!?,]+$/, "").trim();

    // Fast-path perintah administratif & sinkronisasi tanpa delay AI / halusinasi chat
    if (
      /^(reset|hapus semua|hapus semua transaksi|reset transaksi|kosongkan transaksi|reset data)$/i.test(cleanCmd) ||
      (/\b(reset|hapus semua|kosongkan)\b/i.test(cleanCmd) && /\b(transaksi|catatan)\b/i.test(cleanCmd) && !/\b(aset|asset|harta|hutang|piutang|budget|anggaran|langganan|subscription)\b/i.test(cleanCmd))
    ) {
      const plan = {
        function: "reset_transactions" as const,
        args: { confirm: true },
        reply: "Sedang mereset riwayat transaksi Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("reset_transactions", actionCtx);
      return;
    }

    if (
      /^(batal(kan)? transaksi|hapus transaksi (terakhir|tadi)|salah catat)$/i.test(cleanCmd) ||
      /\b(hapus transaksi (terakhir|tadi)|batal(kan)? transaksi|salah catat)\b/i.test(cleanCmd)
    ) {
      const plan = {
        function: "delete_last_transaction" as const,
        args: {},
        reply: "Sedang membatalkan transaksi terakhir Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("delete_last_transaction", actionCtx);
      return;
    }

    if (
      /\b(aset|asset|harta)\b/i.test(cleanCmd) &&
      /\b(hapus semua|kosongkan|reset|bersihkan)\b/i.test(cleanCmd)
    ) {
      const plan = {
        function: "manage_assets" as const,
        args: { action: "CLEAR" },
        reply: "Sedang mengosongkan dan menghapus seluruh daftar aset Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("manage_assets", actionCtx);
      return;
    }

    if (
      /\b(hutang|piutang)\b/i.test(cleanCmd) &&
      /\b(hapus semua|kosongkan|reset|bersihkan)\b/i.test(cleanCmd)
    ) {
      const plan = {
        function: "manage_debt" as const,
        args: { action: "CLEAR" },
        reply: "Sedang mengosongkan dan menghapus seluruh daftar hutang & piutang Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("manage_debt", actionCtx);
      return;
    }

    if (
      /\b(budget|anggaran)\b/i.test(cleanCmd) &&
      /\b(hapus semua|kosongkan|reset|bersihkan)\b/i.test(cleanCmd)
    ) {
      const plan = {
        function: "set_budget" as const,
        args: { action: "CLEAR" },
        reply: "Sedang mengosongkan seluruh batas anggaran Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("set_budget", actionCtx);
      return;
    }

    if (
      /\b(langganan|subscription|subs)\b/i.test(cleanCmd) &&
      /\b(hapus semua|kosongkan|reset|bersihkan)\b/i.test(cleanCmd)
    ) {
      const plan = {
        function: "manage_subscriptions" as const,
        args: { action: "CLEAR" },
        reply: "Sedang mengosongkan seluruh daftar langganan Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("manage_subscriptions", actionCtx);
      return;
    }

    if (/^(sync\s*(sheet|spreadsheet)|sinkron(kan)?\s*(ke\s*)?(sheet|spreadsheet|data))$/i.test(cleanCmd)) {
      const plan = {
        function: "sync_sheet" as const,
        args: {},
        reply: "Sedang menyinkronkan data Google Sheets Anda...",
      };
      const actionCtx: ActionContext = {
        sock,
        msg,
        remoteJid,
        user,
        deviceInfo,
        switchNotice,
        plan,
        rawText: text,
      };
      await dispatchAction("sync_sheet", actionCtx);
      return;
    }

    // 2. Onboarding & Registrasi Pengguna Baru (Minimal Nama Panggilan & Nomor WA jika Laptop)
    const lowerText = text.toLowerCase().trim();
    const isRegisterCommand =
      lowerText.startsWith("daftar") ||
      lowerText.startsWith("nama saya") ||
      lowerText.startsWith("panggil saya");

    if (!user.isRegistered || isRegisterCommand) {
      if (isRegisterCommand) {
        let nameCandidate = text
          .replace(/^(daftar|nama saya|panggil saya)\s*:?/i, "")
          .trim();

        // Cek jika pengguna juga menyertakan nomor HP (contoh: "Daftar Luqman 08123456789")
        let phoneCandidate: string | null = null;
        const phoneMatch = nameCandidate.match(/\b(08\d{8,12}|628\d{8,12})\b/);
        if (phoneMatch) {
          phoneCandidate = phoneMatch[0];
          nameCandidate = nameCandidate.replace(phoneCandidate, "").trim();
        }

        const finalName = nameCandidate || senderName || "Luqman";
        await registerUserProfile(user.id, finalName, phoneCandidate);
        user.name = finalName;
        user.isRegistered = true;

        const activePersona = (await getUserSetting("persona", user.id, "BESTIE")) as PersonaType;
        let greeting = "";
        if (activePersona === "ISTRI" || activePersona === "ISTRI_GALAK") {
          greeting = `Salam kenal Mas ${finalName} sayang! ❤️ Sekarang Mas sudah terdaftar di Finny.\nAku siap bantuin Mas jagain uang dan atur pengeluaran keluarga kita. Mau catat jajan atau pengeluaran apa hari ini Mas?`;
        } else if (activePersona === "SERIUS") {
          greeting = `Selamat datang, Pak ${finalName}. Profil finansial Anda telah berhasil diaktifkan.\nSaya siap mendampingi pembukuan dan analisis arus kas Anda secara profesional. Silakan mulai catat transaksi atau ketik "dompet" untuk meninjau rekening.`;
        } else {
          greeting = `Mantap ${finalName}! Akun lo udah aktif cuy! 👊\nMulai sekarang kalau lo jajan atau dapat uang masuk, langsung kabarin gue ya biar kita gak boncos bareng!`;
        }

        const devTag = deviceInfo.deviceType === "DESKTOP" ? "Laptop 💻 (@lid)" : "HP 📱";
        let fullWelcome = `${greeting}\n\n📱 *Perangkat Aktif:* ${devTag}`;
        if (phoneCandidate) {
          fullWelcome += `\n🔗 *Nomor WA Ditautkan:* ${phoneCandidate}`;
        }
        const clientEmail = googleSheetsService.getClientEmail();
        fullWelcome +=
          `\n\n💡 *Tips Google Spreadsheet:*\n` +
          `Anda bisa menyambungkan Google Sheet untuk rekap visual tahunan & bulanan otomatis:\n` +
          `1. Buka spreadsheet Anda, klik *Bagikan (Share)* dan beri izin *Editor* ke:\n` +
          `   📧 \`${clientEmail}\`\n` +
          `2. Lalu kirim ke sini: *hubungkan sheet <link_spreadsheet>*`;

        await sock.sendMessage(remoteJid, { text: switchNotice + fullWelcome }, { quoted: msg });
        return;
      }

      // Jika user belum melengkapi pendaftaran minimal dan mengirim pesan selain pendaftaran
      if (!user.isRegistered) {
        let promptMsg =
          `👋 *Halo! Selamat Datang di Finny Smart Finance!*\n\n` +
          `Sebelum mulai mencatat transaksi, kenalan dulu yuk! Boleh tahu siapa nama panggilan Anda agar AI kami bisa menyapa Anda dengan nyaman dan personal?\n\n` +
          `👉 *Ketik pesan dengan format:*\n` +
          `*Daftar [Nama Panggilan]*\n` +
          `_Contoh: Daftar ${senderName || "Luqman"}_\n`;

        if (deviceInfo.isLid) {
          promptMsg +=
            `\n💻 *Akses dari Laptop (@lid):*\n` +
            `Agar catatan di laptop ini otomatis terhubung saat Anda chat dari HP, cantumkan nomor HP Anda juga:\n` +
            `👉 *Daftar [Nama] [Nomor WhatsApp]*\n` +
            `_Contoh: Daftar ${senderName || "Luqman"} 081234567890_\n`;
        }

        await sock.sendMessage(remoteJid, { text: switchNotice + promptMsg }, { quoted: msg });
        return;
      }
    }

    // 3. Cek apakah ada permintaan penautan nomor HP jika chat dari Laptop (@lid)
    if (deviceInfo.isLid && (text.toLowerCase().includes("tautkan") || text.toLowerCase().includes("link wa"))) {
      const matchPhone = text.match(/\d{9,15}/);
      if (matchPhone) {
        const linked = await linkLidToUser(matchPhone[0], deviceInfo.jid);
        if (linked) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `✅ *Akun Laptop (@lid) Berhasil Ditautkan!*\nSemua catatan dompet, kategori, dan transaksi dari nomor *${matchPhone[0]}* kini tersinkron di laptop Anda.`,
            },
            { quoted: msg }
          );
          return;
        }
      }
    }

    // 4. Deteksi cepat URL Google Spreadsheet jika user mengirimkan link secara langsung
    const rawSpreadsheetMatch = text.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (rawSpreadsheetMatch || text.toLowerCase().startsWith("hubungkan sheet") || text.toLowerCase().startsWith("connect sheet")) {
      const targetUrl = rawSpreadsheetMatch ? rawSpreadsheetMatch[0] : text;
      const sheetId = googleSheetsService.extractSpreadsheetId(targetUrl);

      if (!sheetId) {
        const clientEmail = googleSheetsService.getClientEmail();
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
        const clientEmail = googleSheetsService.getClientEmail();
        const errMsg =
          `⚠️ *Akses Google Sheets Belum Diberikan!*\n\n` +
          `Bot belum bisa membuka spreadsheet Anda karena izin editor belum ada.\n` +
          `Silakan buka spreadsheet Anda > klik *Bagikan (Share)* > jadikan email ini sebagai *Editor*:\n` +
          `📧 \`${clientEmail}\`\n\n` +
          `Setelah diberi izin, silakan kirim ulang link spreadsheet Anda.`;

        await sock.sendMessage(remoteJid, { text: errMsg }, { quoted: msg });
        return;
      }

      await updateUserSpreadsheet(user.id, sheetId, targetUrl);
      const currentYear = new Date().getFullYear();
      await googleSheetsService.ensureYearTab(sheetId, currentYear);
      const syncResult = await googleSheetsService.syncAllUserTransactions(user.id, sheetId);

      const successReply =
        `🎉 *Google Spreadsheet Berhasil Dihubungkan!*\n\n` +
        `📊 *Judul:* ${verify.title}\n` +
        `📅 *Tab Aktif:* ${currentYear} (Otomatis dibuat tab per tahun)\n` +
        `🔄 *Data Tersinkron:* ${syncResult.syncedCount} transaksi lama telah dimasukkan\n\n` +
        `✨ *Fitur Dashboard Spreadsheet:*\n` +
        `• *Dropdown Filter Bulan:* Ubah bulan di sel B4 untuk memfilter seluruh rekap tahunan/bulanan.\n` +
        `• *Rekapitulasi Dinamis:* Saldo, pemasukan, pengeluaran, dan kategori otomatis terhitung ulang.\n` +
        `• *Sinkronisasi Otomatis:* Setiap transaksi baru dari WhatsApp (HP/Laptop) akan otomatis masuk ke sheet!`;

      await sock.sendMessage(remoteJid, { text: successReply }, { quoted: msg });
      return;
    }

    // 5. Muat kepribadian aktif pengguna (Terisolasi per User, Default: BESTIE)
    const activePersona = (await getUserSetting("persona", user.id, "BESTIE")) as PersonaType;

    // 6. Ambil konteks transaksi terakhir personal agar AI memiliki ingatan jangka pendek
    let lastTxContext: string | undefined;
    try {
      const recent = await getRecentTransactions(1, user.id);
      if (recent && recent.length > 0) {
        lastTxContext = `${recent[0].description} seharga ${recent[0].amount}`;
      }
    } catch (err) {
      console.error("[AI Context] Gagal memuat transaksi terakhir:", err);
    }

    // 7. Dynamic Tool Planning via AI
    const plan = await aiService.planAndAct(
      text,
      activePersona,
      lastTxContext,
      user.name || senderName || "Luqman"
    );
    console.log(`[AI Plan | Persona: ${activePersona} | User: ${user.name || user.phoneNumber || user.id}] Function: ${plan.function}`, plan.args);

    // 8. Action Context & Dispatcher
    const actionCtx: ActionContext = {
      sock,
      msg,
      remoteJid,
      user,
      deviceInfo,
      deviceSwitch,
      switchNotice,
      plan,
      rawText: text,
    };

    await dispatchAction(plan.function, actionCtx);
  } finally {
    // Hentikan efek mengetik
    try {
      await sock.sendPresenceUpdate("paused", remoteJid);
    } catch {}
  }
};
