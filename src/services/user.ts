import { executeSql } from "../prisma/db.ts";
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS } from "../prisma/seed.ts";

export type DeviceType = "MOBILE" | "DESKTOP";

export interface DeviceInfo {
  jid: string;
  deviceType: DeviceType;
  deviceLabel: string;
  phone: string | null;
  isLid: boolean;
}

export interface UserProfile {
  id: string;
  phoneNumber: string;
  primaryJid: string;
  name: string | null;
  lastDevice: DeviceType | null;
  lastJid: string | null;
  lid: string | null;
  isRegistered: boolean;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
}

export interface DeviceSwitchEvent {
  from: DeviceType;
  to: DeviceType;
  description: string;
}

export interface ResolveUserResult {
  user: UserProfile;
  deviceInfo: DeviceInfo;
  deviceSwitch: DeviceSwitchEvent | null;
}

/**
 * Deteksi tipe perangkat dan nomor telepon dari format JID WhatsApp / Baileys
 * - HP / Smartphone: [nomor]@s.whatsapp.net
 * - Laptop / WhatsApp Web / Desktop (Multi-Device): [nomor]:1@s.whatsapp.net ATAU [id]@lid
 */
export function parseDeviceInfo(remoteJid: string, participant?: string | null): DeviceInfo {
  const activeJid = (participant || remoteJid).trim();

  if (activeJid.endsWith("@lid")) {
    return {
      jid: activeJid,
      deviceType: "DESKTOP",
      deviceLabel: "Laptop / WhatsApp Web / Desktop (@lid)",
      phone: null,
      isLid: true,
    };
  }

  if (activeJid.includes(":") && activeJid.includes("@s.whatsapp.net")) {
    const rawNumber = activeJid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
    return {
      jid: activeJid,
      deviceType: "DESKTOP",
      deviceLabel: `Laptop / WhatsApp Web Companion (:1)`,
      phone: rawNumber,
      isLid: false,
    };
  }

  // Standar HP (Mobile)
  const rawNumber = activeJid.split("@")[0].replace(/[^0-9]/g, "");
  return {
    jid: activeJid,
    deviceType: "MOBILE",
    deviceLabel: "HP Android/iOS (@s.whatsapp.net)",
    phone: rawNumber || null,
    isLid: false,
  };
}

/**
 * Seed wallet dan kategori default yang terisolasi khusus untuk satu user
 */
export async function seedUserWalletsAndCategories(userId: string, jid: string): Promise<void> {
  // Cek apakah wallet user sudah ada
  const checkWallet = await executeSql(
    'SELECT id FROM public."Wallet" WHERE "userId" = $1 LIMIT 1',
    [userId]
  );

  if (!checkWallet.rows || checkWallet.rows.length === 0) {
    for (const w of DEFAULT_WALLETS) {
      await executeSql(
        `INSERT INTO public."Wallet" ("id", "userId", "jid", "name", "isDefault", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT DO NOTHING`,
        [userId, jid, w.name, w.isDefault]
      );
    }
  }

  // Cek apakah kategori user sudah ada
  const checkCat = await executeSql(
    'SELECT id FROM public."Category" WHERE "userId" = $1 LIMIT 1',
    [userId]
  );

  if (!checkCat.rows || checkCat.rows.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await executeSql(
        `INSERT INTO public."Category" ("id", "userId", "jid", "name", "type", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT DO NOTHING`,
        [userId, jid, c.name, c.type || 'EXPENSE']
      );
    }
  }
}

/**
 * Mendapatkan atau membuat akun User dengan isolasi data personal per orang
 * Sekaligus mendeteksi perpindahan device (Laptop / HP) secara real-time
 */
export async function resolveUserAndDevice(
  remoteJid: string,
  pushName?: string,
  participant?: string | null
): Promise<ResolveUserResult> {
  const deviceInfo = parseDeviceInfo(remoteJid, participant);
  const jid = deviceInfo.jid;

  let user: UserProfile | null = null;
  let deviceSwitch: DeviceSwitchEvent | null = null;

  // 1. Cari user berdasarkan LID jika pesan dari laptop (@lid)
  if (deviceInfo.isLid) {
    const res = await executeSql(
      `SELECT * FROM public."User" WHERE "lid" = $1 OR "primaryJid" = $1 LIMIT 1`,
      [jid]
    );
    if (res.rows && res.rows.length > 0) {
      user = res.rows[0];
    } else {
      // Cari juga dari histori perangkat UserDevice
      const devRes = await executeSql(
        `SELECT u.* FROM public."User" u 
         JOIN public."UserDevice" ud ON u.id = ud."userId" 
         WHERE ud.jid = $1 LIMIT 1`,
        [jid]
      );
      if (devRes.rows && devRes.rows.length > 0) {
        user = devRes.rows[0];
      }
    }
  }

  // 2. Jika belum ditemukan dan memiliki nomor telepon (@s.whatsapp.net)
  if (!user && deviceInfo.phone) {
    const primaryJid = `${deviceInfo.phone}@s.whatsapp.net`;
    const res = await executeSql(
      `SELECT * FROM public."User" WHERE "phoneNumber" = $1 OR "primaryJid" = $2 LIMIT 1`,
      [deviceInfo.phone, primaryJid]
    );
    if (res.rows && res.rows.length > 0) {
      user = res.rows[0];
    }
  }

  // 3. Jika user belum ada sama sekali di database, buat profil User baru
  if (!user) {
    const newId = crypto.randomUUID();
    const phone = deviceInfo.phone || (deviceInfo.isLid ? jid.replace("@lid", "") : jid.split("@")[0]);
    const primaryJid = deviceInfo.phone ? `${deviceInfo.phone}@s.whatsapp.net` : jid;
    const lidVal = deviceInfo.isLid ? jid : null;
    const defaultEmail = `${phone || jid.replace(/[^a-zA-Z0-9]/g, "")}@smartfinance.local`;

    // Pastikan kolom email tidak memblokir pembuatan user dan isRegistered tersedia
    try {
      await executeSql('ALTER TABLE public."User" ALTER COLUMN "email" DROP NOT NULL');
      await executeSql('ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "isRegistered" BOOLEAN NOT NULL DEFAULT FALSE');
    } catch {}

    try {
      await executeSql(
        `INSERT INTO public."User" ("id", "phoneNumber", "primaryJid", "name", "lastDevice", "lastJid", "lid", "email", "isRegistered", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [newId, phone, primaryJid, pushName || null, deviceInfo.deviceType, jid, lidVal, defaultEmail]
      );
    } catch {
      // Fallback jika skema kolom email atau isRegistered berbeda
      await executeSql(
        `INSERT INTO public."User" ("id", "phoneNumber", "primaryJid", "name", "lastDevice", "lastJid", "lid", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [newId, phone, primaryJid, pushName || null, deviceInfo.deviceType, jid, lidVal]
      );
    }

    const created = await executeSql('SELECT * FROM public."User" WHERE id = $1', [newId]);
    user = created.rows[0];
    if (!user) {
      throw new Error("Gagal menginisialisasi profil pengguna baru.");
    }
    user.isRegistered = Boolean(user.isRegistered);
  } else {
    user.isRegistered = Boolean(user.isRegistered);
    // 4. Deteksi perpindahan perangkat (Device Switch Detection)
    if (user.lastDevice && user.lastDevice !== deviceInfo.deviceType) {
      const fromLabel = user.lastDevice === "DESKTOP" ? "Laptop / Desktop 💻" : "HP Smartphone 📱";
      const toLabel = deviceInfo.deviceType === "DESKTOP" ? "Laptop / Desktop 💻" : "HP Smartphone 📱";
      deviceSwitch = {
        from: user.lastDevice,
        to: deviceInfo.deviceType,
        description: `Perpindahan perangkat terdeteksi: beralih dari ${fromLabel} ke ${toLabel}. Data keuangan Anda tetap aman dan sinkron!`,
      };
    }

    // Update sesi terakhir user & tautkan LID jika belum tertaut
    const updateLidSql = (deviceInfo.isLid && !user.lid) ? `, "lid" = '${jid}'` : "";
    await executeSql(
      `UPDATE public."User" 
       SET "lastDevice" = $1, "lastJid" = $2, "updatedAt" = CURRENT_TIMESTAMP ${updateLidSql}
       WHERE id = $3`,
      [deviceInfo.deviceType, jid, user.id]
    );

    user.lastDevice = deviceInfo.deviceType;
    user.lastJid = jid;
    if (deviceInfo.isLid && !user.lid) {
      user.lid = jid;
    }
  }

  // 5. Catat atau perbarui riwayat perangkat di tabel UserDevice
  await executeSql(
    `INSERT INTO public."UserDevice" ("id", "userId", "jid", "deviceType", "deviceLabel", "lastSeenAt", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [user.id, jid, deviceInfo.deviceType, deviceInfo.deviceLabel]
  );
  await executeSql(
    `UPDATE public."UserDevice" 
     SET "lastSeenAt" = CURRENT_TIMESTAMP, "deviceType" = $1, "deviceLabel" = $2
     WHERE "userId" = $3 AND "jid" = $4`,
    [deviceInfo.deviceType, deviceInfo.deviceLabel, user.id, jid]
  );

  // 6. Pastikan default wallets & categories personal siap untuk user ini
  await seedUserWalletsAndCategories(user.id, user.primaryJid);

  return {
    user,
    deviceInfo,
    deviceSwitch,
  };
}

/**
 * Tautkan akun Laptop (@lid) dengan nomor WhatsApp utama (@s.whatsapp.net)
 */
export async function linkLidToUser(phone: string, lidJid: string): Promise<boolean> {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const primaryJid = `${cleanPhone}@s.whatsapp.net`;

  const userRes = await executeSql(
    `SELECT id FROM public."User" WHERE "phoneNumber" = $1 OR "primaryJid" = $2 LIMIT 1`,
    [cleanPhone, primaryJid]
  );

  if (!userRes.rows || userRes.rows.length === 0) {
    return false;
  }

  const userId = userRes.rows[0].id;
  await executeSql(
    `UPDATE public."User" SET "lid" = $1, "lastJid" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
    [lidJid, userId]
  );

  await executeSql(
    `INSERT INTO public."UserDevice" ("id", "userId", "jid", "deviceType", "deviceLabel", "lastSeenAt", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'DESKTOP', 'Laptop / WhatsApp Web Linked (@lid)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [userId, lidJid]
  );

  return true;
}

/**
 * Simpan link Google Spreadsheet untuk user
 */
export async function updateUserSpreadsheet(
  userId: string,
  spreadsheetId: string,
  spreadsheetUrl: string
): Promise<void> {
  await executeSql(
    `UPDATE public."User" 
     SET "spreadsheetId" = $1, "spreadsheetUrl" = $2, "updatedAt" = CURRENT_TIMESTAMP 
     WHERE id = $3`,
    [spreadsheetId, spreadsheetUrl, userId]
  );
}

/**
 * Daftarkan atau perbarui nama profil minimal pengguna
 */
export async function registerUserProfile(
  userId: string,
  name: string,
  phone?: string | null
): Promise<UserProfile> {
  const cleanName = name.trim();
  let sql = `UPDATE public."User" SET "name" = $1, "isRegistered" = true, "updatedAt" = CURRENT_TIMESTAMP`;
  const params: any[] = [cleanName];

  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length >= 9) {
      params.push(cleanPhone);
      params.push(`${cleanPhone}@s.whatsapp.net`);
      sql += `, "phoneNumber" = $2, "primaryJid" = $3`;
    }
  }

  params.push(userId);
  sql += ` WHERE id = $${params.length} RETURNING *`;

  const res = await executeSql(sql, params);
  return res.rows[0];
}

