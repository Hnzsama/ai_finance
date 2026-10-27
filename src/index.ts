import "./env.js";
import { WhatsAppService } from "./services/whatsapp.js";
import { createDashboardServer } from "./server/dashboard.ts";

const bootstrap = async (): Promise<void> => {
  console.log("🚀 Memulai Smart Finance Services...");

  // 1. Jalankan Interactive Web Dashboard Server (Visual KPI cards, Charts, Tabs & Filter Table)
  const dashboardPort = Number(process.env.PORT) || 3000;
  createDashboardServer(dashboardPort);

  // 2. Jalankan WhatsApp Bot Service
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
