import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import postgres from "@prisma/orm-postgres/runtime";
import "temporal-polyfill/global";

import { Pool } from "pg";
import type { Contract } from "./generated/contract.d.ts";
import contractJson from "./generated/contract.json" with { type: "json" };
import { runMigration } from "./migrate.ts";

// Pastikan .env termuat di environment
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function isValidUrl(val: string | undefined): boolean {
  if (!val || val.startsWith("<")) return false;
  try {
    const parsed = new URL(val);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL && isValidUrl(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL;
  }

  // Fallback: baca langsung file .env jika proses belum menerima env
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
      if (match && match[1] && isValidUrl(match[1])) {
        process.env.DATABASE_URL = match[1];
        return match[1];
      }
    }
  } catch {}

  return "";
}

const activeUrl = getDatabaseUrl();

export const db = activeUrl
  ? postgres<Contract>({ contractJson, url: activeUrl })
  : postgres<Contract>({ contractJson });

let connection: Promise<void> | undefined;

export function connectDatabase(): Promise<void> {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL tidak ditemukan di file .env atau format URL salah.");
  }

  connection ??= (async () => {
    await runMigration();
    await db.connect({ url });
    console.log("⚡ [Prisma] Terhubung ke PostgreSQL Database.");
  })().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });

  return connection;
}

let pool: Pool | undefined;

export function getPgPool(): Pool {
  if (!pool) {
    const url = getDatabaseUrl();
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function executeSql(text: string, params: any[] = []): Promise<any> {
  const p = getPgPool();
  return p.query(text, params);
}


