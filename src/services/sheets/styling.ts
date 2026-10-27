import { getSheetsClient } from "./client.ts";

/**
 * Template Styling Universal untuk Sub-Tab (Banner, KPI Cards, Header & Data Rows)
 */
export async function applySubTabStyling(
  spreadsheetId: string,
  sheetId: number,
  tableHeaderRowIndex: number,
  dataRowCount: number,
  currencyColIndices: number[],
  colWidths: { index: number; width: number }[]
): Promise<void> {
  const sheets = getSheetsClient();
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // 1. Column widths
          ...colWidths.map((cw) => ({
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: cw.index,
                endIndex: cw.index + 1,
              },
              properties: { pixelSize: cw.width },
              fields: "pixelSize",
            },
          })),

          // 2. Banner Row 1 (Title)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colWidths.length },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.05, green: 0.08, blue: 0.14 },
                  textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: "CENTER",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
            },
          },

          // 3. Banner Row 2 (Subtitle)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: colWidths.length },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 },
                  textFormat: { fontSize: 9, foregroundColor: { red: 0.6, green: 0.65, blue: 0.75 } },
                  horizontalAlignment: "CENTER",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
            },
          },

          // 4. KPI Card Titles (Row 4, index 3)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.94, green: 0.96, blue: 1.0 },
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.18, green: 0.22, blue: 0.45 } },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.92, green: 0.99, blue: 0.95 },
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.02, green: 0.4, blue: 0.25 } },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 5, endColumnIndex: 7 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.96, green: 0.95, blue: 1.0 },
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.4, green: 0.15, blue: 0.6 } },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },

          // 5. KPI Card Values (Row 5, index 4)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.94, green: 0.96, blue: 1.0 },
                  textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 0.18, green: 0.22, blue: 0.45 } },
                  numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 3, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.92, green: 0.99, blue: 0.95 },
                  textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 0.02, green: 0.4, blue: 0.25 } },
                  numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 7 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.96, green: 0.95, blue: 1.0 },
                  textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 0.4, green: 0.15, blue: 0.6 } },
                  numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,numberFormat)",
            },
          },

          // 6. Table Header (Row 7, index tableHeaderRowIndex - 1)
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: tableHeaderRowIndex - 1,
                endRowIndex: tableHeaderRowIndex,
                startColumnIndex: 0,
                endColumnIndex: colWidths.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.08, green: 0.11, blue: 0.18 },
                  textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: "CENTER",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
            },
          },

          // 7. Format currency columns in data rows
          ...currencyColIndices.map((colIdx) => ({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: tableHeaderRowIndex,
                endRowIndex: tableHeaderRowIndex + Math.max(dataRowCount, 50),
                startColumnIndex: colIdx,
                endColumnIndex: colIdx + 1,
              },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: "CURRENCY", pattern: '"Rp "#,##0' },
                  textFormat: { bold: true },
                  horizontalAlignment: "RIGHT",
                },
              },
              fields: "userEnteredFormat(numberFormat,textFormat,horizontalAlignment)",
            },
          })),

          // 8. Align column 0 (NO) center
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: tableHeaderRowIndex,
                endRowIndex: tableHeaderRowIndex + Math.max(dataRowCount, 50),
                startColumnIndex: 0,
                endColumnIndex: 1,
              },
              cell: {
                userEnteredFormat: { horizontalAlignment: "CENTER" },
              },
              fields: "userEnteredFormat(horizontalAlignment)",
            },
          },
        ],
      },
    });
  } catch (err) {
    console.warn(`[GoogleSheets] Notice styling tab (sheetId: ${sheetId}):`, err);
  }
}
