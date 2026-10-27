# Smart Finance - WhatsApp Bot Service

Layanan bot WhatsApp berbasis **Node.js** dan **TypeScript** menggunakan `@whiskeysockets/baileys` dengan arsitektur modular, rapi, dan type-safe.

---

## 📁 Struktur Proyek

```
smart_finance/
├── auth_info_baileys/       # Kredensial sesi WhatsApp (di-ignore oleh git)
├── dist/                    # Hasil build kompilasi JavaScript
├── src/
│   ├── config.ts            # Konfigurasi aplikasi & konstanta
│   ├── handlers/
│   │   └── message.ts       # Handler pesan masuk, ekstraksi teks, & routing respon
│   ├── services/
│   │   └── whatsapp.ts      # Lifecycle koneksi Baileys, auth, QR, & auto-reconnect
│   └── index.ts             # Entry point utama & graceful shutdown
├── .gitignore               # Proteksi node_modules & session credentials
├── package.json             # Scripts & dependencies
├── tsconfig.json            # Konfigurasi compiler TypeScript (ESM / NodeNext)
└── README.md
```

---

## 🚀 Perintah yang Tersedia

| Script | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan bot dalam mode development dengan auto-reload (`tsx watch`) |
| `npm run build` | Melakukan kompilasi TypeScript ke folder `dist/` |
| `npm start` | Menjalankan build produksi dari `dist/index.js` |
| `npm run typecheck` | Validasi tipe data tanpa meng-output file (`tsc --noEmit`) |

---

## 🛠️ Poin Peningkatan (Senior Dev Perspective)

1. **Modern ESM & TypeScript Strict Mode**: Menggunakan `import`/`export` native dan type definition lengkap dari Baileys & Boom, bukan `require`.
2. **Pino Silent Logger**: Log internal bawaan Baileys dimatikan agar QR code dan terminal log aplikasi tetap bersih & terbaca.
3. **Resilient Reconnection**: Logika reconnect membedakan antara koneksi putus sementara vs logout permanen (`DisconnectReason.loggedOut`).
4. **Separation of Concerns**: Logika koneksi (`WhatsAppService`) terpisah dari logika bisnis pesan (`handleIncomingMessage`).
5. **Session Safety**: Folder `auth_info_baileys/` sudah ditambahkan ke `.gitignore` agar file kredensial tidak sengaja ter-commit ke repository.
