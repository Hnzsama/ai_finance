import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { CONFIG } from "../config.js";
import { handleIncomingMessage } from "../handlers/message.js";

export class WhatsAppService {
  private socket: WASocket | null = null;
  private isReconnecting = false;

  public async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.authFolder);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`[WhatsApp] Using WA v${version.join(".")} (Latest: ${isLatest})`);

    this.socket = makeWASocket({
      version,
      auth: state,
      // Matikan logger internal Baileys agar terminal tetap bersih
      logger: pino({ level: CONFIG.logLevel }),
      printQRInTerminal: false, // Ditangani sendiri secara rapi via qrcode-terminal
      browser: ["Smart Finance", "Chrome", "1.0.0"],
    });

    this.registerEvents(saveCreds);
  }

  private registerEvents(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // 1. Simpan update kredensial / session
    this.socket.ev.on("creds.update", saveCreds);

    // 2. Lifecycle koneksi
    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.clear();
        console.log("\n================ [ SCAN QR CODE ] ================");
        qrcode.generate(qr, { small: true });
        console.log("👉 Scan QR di atas menggunakan aplikasi WhatsApp Anda.\n");
      }

      if (connection === "close") {
        this.handleDisconnection(lastDisconnect?.error);
      } else if (connection === "open") {
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
