import path from "node:path";

export const CONFIG = {
  authFolder: path.resolve(process.cwd(), "auth_info_baileys"),
  logLevel: "silent" as const, // Ubah ke 'info' atau 'debug' jika ingin melihat raw log Baileys
  reconnectIntervalMs: 3000,
} as const;
