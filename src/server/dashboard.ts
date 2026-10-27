import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeSql } from "../prisma/db.ts";
import { getWalletsSummary } from "../prisma/finance/wallets.ts";
import { getBudgetsSummary } from "../prisma/finance/budgets.ts";
import { getAssetsSummary } from "../prisma/finance/assets.ts";
import { getSubscriptionsSummary } from "../prisma/finance/subscriptions.ts";
import { getDebtsSummary } from "../prisma/finance/debts.ts";
import { formatIDR } from "../prisma/finance/types.ts";
import { syncDashboardToNotion } from "../services/notion.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

function safeJsonStringify(data: any): string {
  return JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function createDashboardServer(port: number = 3000) {
  const server = http.createServer(async (req, res) => {
    // CORS & JSON Helper
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // --- API ENDPOINTS ---

    // 1. GET /api/overview
    if (pathname === "/api/overview" && req.method === "GET") {
      try {
        const userId = parsedUrl.searchParams.get("userId") || undefined;
        const wallets = await getWalletsSummary(userId);
        const budgets = await getBudgetsSummary(userId);
        const assets = await getAssetsSummary(userId);
        const subs = await getSubscriptionsSummary(userId);
        const debts = await getDebtsSummary(userId);

        // Hitung total likuiditas dompet
        let totalLiquidity = 0n;
        for (const w of wallets) {
          totalLiquidity += w.balanceRaw;
        }

        // Hitung total income & expense bulan ini dari Transaction
        const txStatsRes = await executeSql(
          userId
            ? `SELECT type, SUM(amount) as total FROM public."Transaction" WHERE "userId" = $1 GROUP BY type`
            : `SELECT type, SUM(amount) as total FROM public."Transaction" GROUP BY type`,
          userId ? [userId] : []
        );

        let totalIncome = 0n;
        let totalExpense = 0n;
        for (const row of txStatsRes.rows || []) {
          if (row.type === "INCOME") totalIncome += BigInt(row.total || 0);
          if (row.type === "EXPENSE") totalExpense += BigInt(row.total || 0);
        }

        const data = {
          summary: {
            totalLiquidityRaw: totalLiquidity.toString(),
            totalLiquidity: formatIDR(totalLiquidity),
            totalIncomeRaw: totalIncome.toString(),
            totalIncome: formatIDR(totalIncome),
            totalExpenseRaw: totalExpense.toString(),
            totalExpense: formatIDR(totalExpense),
            netSavings: formatIDR(totalIncome - totalExpense),
            totalAssetValue: assets.totalValue,
            totalBudget: budgets.totalBudget,
            totalSpentBudget: budgets.totalSpent,
          },
          wallets,
          budgets: budgets.items,
          assets: assets.items,
          subscriptions: subs.items,
          debts: {
            totalDebt: debts.totalPayable,
            totalReceivable: debts.totalReceivable,
            items: [...debts.debts, ...debts.receivables],
          },
          notionUrl: "https://app.notion.com/p/Smart-Finance-Dashboard-401d8d8d2e9b81afbdb4f103d8800028",
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(safeJsonStringify(data));
      } catch (err: any) {
        console.error("[Dashboard API] Error /api/overview:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    // 2. GET /api/transactions
    if (pathname === "/api/transactions" && req.method === "GET") {
      try {
        const userId = parsedUrl.searchParams.get("userId") || undefined;
        const typeFilter = parsedUrl.searchParams.get("type"); // INCOME | EXPENSE
        const walletFilter = parsedUrl.searchParams.get("wallet");
        const categoryFilter = parsedUrl.searchParams.get("category");
        const search = parsedUrl.searchParams.get("search");

        let sql = `
          SELECT 
            t.id, t.type, t.amount, t.description, t."rawText", t."createdAt",
            w.name as wallet_name, c.name as category_name
          FROM public."Transaction" t
          LEFT JOIN public."Wallet" w ON t."walletId" = w.id
          LEFT JOIN public."Category" c ON t."categoryId" = c.id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (userId) {
          params.push(userId);
          sql += ` AND t."userId" = $${params.length}`;
        }
        if (typeFilter && typeFilter !== "ALL") {
          params.push(typeFilter);
          sql += ` AND t.type = $${params.length}`;
        }
        if (walletFilter && walletFilter !== "ALL") {
          params.push(walletFilter.toLowerCase());
          sql += ` AND LOWER(w.name) = $${params.length}`;
        }
        if (categoryFilter && categoryFilter !== "ALL") {
          params.push(categoryFilter.toLowerCase());
          sql += ` AND LOWER(c.name) = $${params.length}`;
        }
        if (search) {
          params.push(`%${search.toLowerCase()}%`);
          sql += ` AND (LOWER(t.description) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length} OR LOWER(w.name) LIKE $${params.length})`;
        }

        sql += ` ORDER BY t."createdAt" DESC LIMIT 100`;

        const result = await executeSql(sql, params);
        const rows = (result.rows || []).map((r: any) => ({
          id: r.id,
          type: r.type,
          amount: Number(r.amount),
          amountFormatted: formatIDR(BigInt(r.amount)),
          description: r.description,
          rawText: r.rawText,
          walletName: r.wallet_name || "Cash",
          categoryName: r.category_name || "Lainnya",
          createdAt: r.createdAt,
          dateFormatted: new Date(r.createdAt).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(safeJsonStringify({ count: rows.length, transactions: rows }));
      } catch (err: any) {
        console.error("[Dashboard API] Error /api/transactions:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    // 3. POST /api/sync-notion
    if (pathname === "/api/sync-notion" && req.method === "POST") {
      try {
        const syncRes = await syncDashboardToNotion();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(safeJsonStringify(syncRes));
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }
      return;
    }

    // --- STATIC FILES SERVING ---
    let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

    // Mencegah directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      }
    });
  });

  server.listen(port, () => {
    console.log(`🌐 [Web Dashboard] Aktif & dapat diakses di: http://localhost:${port}`);
  });

  return server;
}

// Support running directly via CLI: `npx tsx src/server/dashboard.ts`
if (process.argv[1] && process.argv[1].endsWith("dashboard.ts")) {
  const port = Number(process.env.PORT) || 3000;
  createDashboardServer(port);
}
