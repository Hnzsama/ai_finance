import path from "node:path";

export const CONFIG = {
  authFolder: path.resolve(process.cwd(), "auth_info_baileys"),
  logLevel: "silent" as const, // Ubah ke 'info' atau 'debug' jika ingin melihat raw log Baileys
  reconnectIntervalMs: 3000,
  get phoneNumber(): string {
    return (process.env.PHONE_NUMBER || process.env.WA_PHONE_NUMBER || process.env.BOT_PHONE_NUMBER || "").trim();
  },
};
