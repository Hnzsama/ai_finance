import "dotenv/config";
import { Pool } from "pg";
import { getDatabaseUrl } from "./db.ts";

const SQL = `
-- 1. Tabel User
CREATE TABLE IF NOT EXISTS public."User" (
  "id" CHAR(36) PRIMARY KEY,
  "phoneNumber" TEXT,
  "primaryJid" TEXT,
  "name" TEXT,
  "lastDevice" TEXT,
  "lastJid" TEXT,
  "spreadsheetId" TEXT,
  "spreadsheetUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade kolom tabel User jika tabel sebelumnya sudah ada
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "primaryJid" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "lastDevice" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "lastJid" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "lid" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "isRegistered" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "spreadsheetId" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "spreadsheetUrl" TEXT;

-- Buat kolom email opsional (nullable) jika sebelumnya ada constraint not-null
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'email'
  ) THEN
    ALTER TABLE public."User" ALTER COLUMN "email" DROP NOT NULL;
  END IF;
END $$;

-- 2. Tabel UserDevice (Pencatatan riwayat perangkat & deteksi perpindahan HP/Laptop)
CREATE TABLE IF NOT EXISTS public."UserDevice" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36) NOT NULL,
  "jid" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Category (Dengan isolasi kepemilikan personal per user dan type INCOME/EXPENSE)
CREATE TABLE IF NOT EXISTS public."Category" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'EXPENSE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Wallet (Dengan isolasi kepemilikan personal per user)
CREATE TABLE IF NOT EXISTS public."Wallet" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Transaction (Dengan metadata perangkat, JID, dan status sinkronisasi Sheets)
CREATE TABLE IF NOT EXISTS public."Transaction" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "type" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "description" TEXT NOT NULL,
  "rawText" TEXT,
  "userPhone" TEXT,
  "jid" TEXT,
  "deviceType" TEXT,
  "isSyncedToSheet" BOOLEAN NOT NULL DEFAULT FALSE,
  "walletId" CHAR(36) NOT NULL,
  "categoryId" CHAR(36) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabel UserSetting (Pengaturan personal per user)
CREATE TABLE IF NOT EXISTS public."UserSetting" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "userPhone" TEXT,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabel Debt (Hutang & Piutang)
CREATE TABLE IF NOT EXISTS public."Debt" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "type" TEXT NOT NULL DEFAULT 'DEBT',
  "personName" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "remainingAmount" BIGINT NOT NULL,
  "dueDate" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'UNPAID',
  "description" TEXT,
  "walletId" CHAR(36),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabel Asset (Aset Mahasiswa/Driver/Freelance)
CREATE TABLE IF NOT EXISTS public."Asset" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'VEHICLE',
  "value" BIGINT NOT NULL,
  "purchasePrice" BIGINT,
  "purchaseDate" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tabel Budget (Anggaran Belanja per Kategori)
CREATE TABLE IF NOT EXISTS public."Budget" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "categoryId" CHAR(36) NOT NULL,
  "amount" BIGINT NOT NULL,
  "period" TEXT NOT NULL DEFAULT 'MONTHLY',
  "month" INTEGER,
  "year" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabel Subscription (Langganan Rutin)
CREATE TABLE IF NOT EXISTS public."Subscription" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "walletId" CHAR(36),
  "categoryId" CHAR(36),
  "name" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
  "billingDay" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "nextBillingDate" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabel Transfer (Pindah Antar Dompet & Mutasi COD ShopeeFood)
CREATE TABLE IF NOT EXISTS public."Transfer" (
  "id" CHAR(36) PRIMARY KEY,
  "userId" CHAR(36),
  "jid" TEXT,
  "fromWalletId" CHAR(36) NOT NULL,
  "toWalletId" CHAR(36) NOT NULL,
  "amount" BIGINT NOT NULL,
  "adminFee" BIGINT NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL DEFAULT 'TRANSFER',
  "description" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hapus unique constraint lama jika ada agar nama dompet/kategori/setting bisa multi-user
ALTER TABLE public."Wallet" DROP CONSTRAINT IF EXISTS "Wallet_name_key";
ALTER TABLE public."Category" DROP CONSTRAINT IF EXISTS "Category_name_key";
ALTER TABLE public."UserSetting" DROP CONSTRAINT IF EXISTS "UserSetting_key_key";
ALTER TABLE public."UserSetting" DROP CONSTRAINT IF EXISTS "UserSetting_pkey";

-- Pastikan kolom baru terpasang di semua tabel jika tabel sudah ada sebelumnya
ALTER TABLE public."Wallet" ADD COLUMN IF NOT EXISTS "userId" CHAR(36);
ALTER TABLE public."Wallet" ADD COLUMN IF NOT EXISTS "jid" TEXT;

ALTER TABLE public."Category" ADD COLUMN IF NOT EXISTS "userId" CHAR(36);
ALTER TABLE public."Category" ADD COLUMN IF NOT EXISTS "jid" TEXT;
ALTER TABLE public."Category" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'EXPENSE';

ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "userId" CHAR(36);
ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "jid" TEXT;
ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "isSyncedToSheet" BOOLEAN DEFAULT FALSE;

ALTER TABLE public."UserSetting" ADD COLUMN IF NOT EXISTS "id" CHAR(36);
ALTER TABLE public."UserSetting" ADD COLUMN IF NOT EXISTS "userId" CHAR(36);
ALTER TABLE public."UserSetting" ADD COLUMN IF NOT EXISTS "userPhone" TEXT;

-- Indeks performa pencarian
CREATE INDEX IF NOT EXISTS "idx_user_phone" ON public."User"("phoneNumber");
CREATE INDEX IF NOT EXISTS "idx_user_lid" ON public."User"("lid");
CREATE INDEX IF NOT EXISTS "idx_user_device_user" ON public."UserDevice"("userId");
CREATE INDEX IF NOT EXISTS "idx_user_device_jid" ON public."UserDevice"("jid");
CREATE INDEX IF NOT EXISTS "idx_tx_user" ON public."Transaction"("userId");
CREATE INDEX IF NOT EXISTS "idx_tx_wallet" ON public."Transaction"("walletId");
CREATE INDEX IF NOT EXISTS "idx_tx_category" ON public."Transaction"("categoryId");
CREATE INDEX IF NOT EXISTS "idx_wallet_user" ON public."Wallet"("userId");
CREATE INDEX IF NOT EXISTS "idx_category_user" ON public."Category"("userId");
CREATE INDEX IF NOT EXISTS "idx_debt_user" ON public."Debt"("userId");
CREATE INDEX IF NOT EXISTS "idx_asset_user" ON public."Asset"("userId");
CREATE INDEX IF NOT EXISTS "idx_budget_user" ON public."Budget"("userId");
CREATE INDEX IF NOT EXISTS "idx_sub_user" ON public."Subscription"("userId");
CREATE INDEX IF NOT EXISTS "idx_transfer_user" ON public."Transfer"("userId");
`;

export async function runMigration(): Promise<void> {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL tidak ditemukan!");

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  try {
    console.log("Menyiapkan & migrasi tabel PostgreSQL (Multi-Device, User Privacy, Hutang, Aset, Budget, Subscription, Transfer)...");
    await pool.query(SQL);
    console.log("✅ Struktur tabel PostgreSQL siap (User, UserDevice, Wallet, Category, Transaction, UserSetting, Debt, Asset, Budget, Subscription, Transfer)!");
  } finally {
    await pool.end();
  }
}
