import { executeSql } from "../db.ts";

/**
 * Helper: Ambil atau buat Kategori personal user
 */
export async function getOrCreateCategory(
  categoryName: string,
  type: "INCOME" | "EXPENSE" = "EXPENSE",
  userId?: string,
  jid?: string
): Promise<{ id: string; name: string; type: string }> {
  const clean = categoryName.trim();
  if (userId) {
    const res = await executeSql(
      'SELECT id, name, type FROM public."Category" WHERE "userId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
      [userId, clean]
    );
    if (res.rows && res.rows.length > 0) {
      return { id: res.rows[0].id, name: res.rows[0].name, type: res.rows[0].type };
    }
    const newId = crypto.randomUUID();
    await executeSql(
      `INSERT INTO public."Category" ("id", "userId", "jid", "name", "type", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newId, userId, jid || null, clean, type]
    );
    return { id: newId, name: clean, type };
  } else {
    const res = await executeSql(
      'SELECT id, name, type FROM public."Category" WHERE "userId" IS NULL AND LOWER(name) = LOWER($1) LIMIT 1',
      [clean]
    );
    if (res.rows && res.rows.length > 0) {
      return { id: res.rows[0].id, name: res.rows[0].name, type: res.rows[0].type };
    }
    const newId = crypto.randomUUID();
    await executeSql(
      `INSERT INTO public."Category" ("id", "name", "type", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newId, clean, type]
    );
    return { id: newId, name: clean, type };
  }
}
