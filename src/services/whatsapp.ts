import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { CONFIG } from "../config.js";
import { handleIncomingMessage } from "../handlers/message.js";

/**
 * Format nomor HP agar sesuai standar E.164 tanpa tanda + (contoh: 6281234567890)
 */
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  return cleaned;
}

export class WhatsAppService {
  private socket: WASocket | null = null;
  private isReconnecting = false;
  private pairingTimeout: NodeJS.Timeout | null = null;

  public async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.authFolder);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`[WhatsApp] Using WA v${version.join(".")} (Latest: ${isLatest})`);

    this.socket = makeWASocket({
      version,
      auth: state,
      // Matikan logger internal Baileys agar terminal tetap bersih
      logger: pino({ level: CONFIG.logLevel }),
      printQRInTerminal: false, // Ditangani sendiri secara rapi via qrcode-terminal atau pairing code
      browser: Browsers.ubuntu("Chrome"),
    });

    this.registerEvents(saveCreds);

    // Hubungkan via Pairing Code jika env nomor HP tidak kosong dan belum terdaftar
    const rawPhoneNumber = CONFIG.phoneNumber;
    if (rawPhoneNumber && !state.creds.registered) {
      this.requestPairingCode(rawPhoneNumber);
    }
  }

  private requestPairingCode(phone: string): void {
    if (this.pairingTimeout) {
      clearTimeout(this.pairingTimeout);
    }

    const cleanPhone = formatPhoneNumber(phone);
    if (!cleanPhone) {
      console.warn("⚠️ [WhatsApp] Nomor telepon pairing code tidak valid.");
      return;
    }

    console.log(`⏳ [WhatsApp] Menyiapkan kode pairing untuk nomor: ${cleanPhone}...`);

    this.pairingTimeout = setTimeout(async () => {
      try {
        if (!this.socket || this.socket.authState.creds.registered) return;

        const code = await this.socket.requestPairingCode(cleanPhone);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

        console.log("\n================ [ PAIRING CODE ] ================");
        console.log(`📱 Nomor WhatsApp : ${cleanPhone}`);
        console.log(`🔑 Kode Pairing   : ${formattedCode}`);
        console.log("👉 Masukkan kode ini di WhatsApp Anda:");
        console.log("   Pengaturan > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja.\n");
      } catch (err) {
        console.error("❌ [WhatsApp] Gagal mendapatkan kode pairing:", err);
      }
    }, 3000);
  }

  private registerEvents(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // 1. Simpan update kredensial / session
    this.socket.ev.on("creds.update", saveCreds);

    // 2. Lifecycle koneksi
    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Hanya tampilkan QR code jika tidak menggunakan pairing code
      if (qr && !CONFIG.phoneNumber) {
        console.clear();
        console.log("\n================ [ SCAN QR CODE ] ================");
        qrcode.generate(qr, { small: true });
        console.log("👉 Scan QR di atas menggunakan aplikasi WhatsApp Anda.\n");
      }

      if (connection === "close") {
        if (this.pairingTimeout) {
          clearTimeout(this.pairingTimeout);
          this.pairingTimeout = null;
        }
        this.handleDisconnection(lastDisconnect?.error);
      } else if (connection === "open") {
        if (this.pairingTimeout) {
          clearTimeout(this.pairingTimeout);
          this.pairingTimeout = null;
        }
        console.log("✅ WhatsApp bot berhasil terhubung dan siap digunakan!");
      }
    });

    // 3. Penanganan pesan masuk
    this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        try {
          if (this.socket) {
            await handleIncomingMessage(this.socket, msg);
          }
        } catch (err) {
          console.error("[WhatsApp] Error processing message:", err);
        }
      }
    });
  }

  private handleDisconnection(error: Error | undefined): void {
    const statusCode = (error as Boom)?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    console.warn(`[WhatsApp] Koneksi terputus. Kode status: ${statusCode ?? "unknown"}`);

    if (shouldReconnect) {
      if (this.isReconnecting) return;
      this.isReconnecting = true;

      console.log(`[WhatsApp] Mencoba menghubungkan kembali dalam ${CONFIG.reconnectIntervalMs / 1000} detik...`);
      setTimeout(async () => {
        this.isReconnecting = false;
        try {
          await this.start();
        } catch (err) {
          console.error("[WhatsApp] Gagal menghubungkan ulang:", err);
        }
      }, CONFIG.reconnectIntervalMs);
    } else {
      console.error(
        "❌ Akun logout / session invalid. Hapus folder 'auth_info_baileys' lalu jalankan ulang bot."
      );
    }
  }

  public getSocket(): WASocket | null {
    return this.socket;
  }
}
