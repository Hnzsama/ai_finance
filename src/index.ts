import "./env.js";
import { WhatsAppService } from "./services/whatsapp.js";

const bootstrap = async (): Promise<void> => {
  console.log("🚀 Memulai Smart Finance Services...");

  // Jalankan WhatsApp Bot Service
  const waService = new WhatsAppService();

  // Tangani sinyal shutdown terminal (Ctrl+C)
  const shutdown = (): void => {
    console.log("\n🛑 Menghentikan bot secara aman...");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await waService.start();
  } catch (error) {
    console.error("💥 Fatal error saat inisialisasi bot:", error);
    process.exit(1);
  }
};

void bootstrap();
