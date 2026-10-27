import "./env.js";
import { aiService } from "./services/ai.js";
import { WhatsAppService } from "./services/whatsapp.js";

const bootstrap = async (): Promise<void> => {
  console.log("🚀 Memulai Smart Finance Services...");

  // Pre-load model AI di background agar chat tidak mengalami cold-start lag
  void aiService.warmup();

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
