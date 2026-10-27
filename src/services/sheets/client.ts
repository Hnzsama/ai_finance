import { google, sheets_v4 } from "googleapis";

let sheetsClientInstance: sheets_v4.Sheets | null = null;

export function getClientEmail(): string {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "my-bendahara@manminmun.iam.gserviceaccount.com";
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClientInstance) return sheetsClientInstance;

  const clientEmail = getClientEmail();
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClientInstance = google.sheets({ version: "v4", auth });
  return sheetsClientInstance;
}

/**
 * Ekstraksi Spreadsheet ID dari berbagai format URL Google Sheets atau ID langsung
 */
export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9-_]{30,60}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Cek validitas dan akses izin edit Service Account terhadap Spreadsheet
 */
export async function verifyAccess(spreadsheetId: string): Promise<{
  valid: boolean;
  title?: string;
  sheets?: string[];
  error?: string;
}> {
  try {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const title = meta.data.properties?.title || "Spreadsheet Finansial";
    const sheetTitles = (meta.data.sheets || []).map((s) => s.properties?.title || "");
    return { valid: true, title, sheets: sheetTitles };
  } catch (err: any) {
    const msg = err.message || "Akses ditolak";
    return { valid: false, error: msg };
  }
}

/**
 * Pastikan tab/lembar kerja tertentu sudah ada di Spreadsheet
 */
export async function ensureTabExists(
  spreadsheetId: string,
  tabName: string,
  rowCount: number = 300,
  columnCount: number = 10,
  frozenRowCount: number = 7
): Promise<number | undefined> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === tabName);
  if (existing) {
    return existing.properties?.sheetId ?? undefined;
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: {
                rowCount,
                columnCount,
                frozenRowCount,
              },
            },
          },
        },
      ],
    },
  });

  return res.data.replies?.[0].addSheet?.properties?.sheetId ?? undefined;
}
