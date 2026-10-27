import { connectDatabase, executeSql } from "../db.ts";

/**
 * Pengaturan Pengguna Personal (UserSetting)
 */
export async function getUserSetting(
  key: string,
  userId?: string,
  defaultValue: string = ""
): Promise<string> {
  await connectDatabase();
  try {
    const sql = userId
      ? `SELECT value FROM public."UserSetting" WHERE key = $1 AND "userId" = $2 LIMIT 1`
      : `SELECT value FROM public."UserSetting" WHERE key = $1 LIMIT 1`;
    const params = userId ? [key, userId] : [key];
    const res = await executeSql(sql, params);
    if (res.rows && res.rows.length > 0) {
      return res.rows[0].value;
    }
  } catch {}
  return defaultValue;
}

export async function setUserSetting(
  key: string,
  value: string,
  userId?: string
): Promise<void> {
  await connectDatabase();
  if (userId) {
    const check = await executeSql(
      `SELECT key FROM public."UserSetting" WHERE key = $1 AND "userId" = $2 LIMIT 1`,
      [key, userId]
    );
    if (check.rows && check.rows.length > 0) {
      await executeSql(
        `UPDATE public."UserSetting" SET value = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2 AND "userId" = $3`,
        [value, key, userId]
      );
    } else {
      await executeSql(
        `INSERT INTO public."UserSetting" ("id", "userId", "key", "value", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, CURRENT_TIMESTAMP)`,
        [userId, key, value]
      );
    }
  } else {
    const check = await executeSql(
      `SELECT key FROM public."UserSetting" WHERE key = $1 AND "userId" IS NULL LIMIT 1`,
      [key]
    );
    if (check.rows && check.rows.length > 0) {
      await executeSql(
        `UPDATE public."UserSetting" SET value = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2 AND "userId" IS NULL`,
        [value, key]
      );
    } else {
      await executeSql(
        `INSERT INTO public."UserSetting" ("id", "key", "value", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, CURRENT_TIMESTAMP)`,
        [key, value]
      );
    }
  }
}
