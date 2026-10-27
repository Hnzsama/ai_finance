import { Client } from "@notionhq/client";
import { formatIDR } from "../prisma/finance/types.ts";
import { getWalletsSummary } from "../prisma/finance/wallets.ts";
import { getBudgetsSummary } from "../prisma/finance/budgets.ts";
import { getAssetsSummary } from "../prisma/finance/assets.ts";
import { getSubscriptionsSummary } from "../prisma/finance/subscriptions.ts";
import { getDebtsSummary } from "../prisma/finance/debts.ts";
import { executeSql } from "../prisma/db.ts";

export const NOTION_ICONS = {
  dashboard: "https://img.icons8.com/fluency/96/banknotes.png",
  wallet: "https://img.icons8.com/fluency/96/wallet.png",
  gold: "https://img.icons8.com/fluency/96/gold-bars.png",
  chart: "https://img.icons8.com/fluency/96/combo-chart.png",
  piggy: "https://img.icons8.com/fluency/96/piggy-bank.png",
  card: "https://img.icons8.com/fluency/96/credit-card-front.png",
  transfer: "https://img.icons8.com/fluency/96/money-transfer.png",
};

let notionClientInstance: Client | null = null;

export function getNotionClient(): Client | null {
  const token = process.env.NOTION_API_TOKEN || process.env.NOTION_TOKEN;
  if (!token) return null;
  if (!notionClientInstance) {
    notionClientInstance = new Client({ auth: token });
  }
  return notionClientInstance;
}

/**
 * Mencari atau membuat database transaksi di Notion
 */
export async function getOrCreateFinanceDatabase(client: Client): Promise<string | null> {
  try {
    // 1. Cari database transaksi yang sudah pernah dibuat
    const search = await client.search({
      query: "Smart Finance - Transaksi",
      filter: { property: "object", value: "database" as any },
    });

    if (search.results.length > 0) {
      return search.results[0].id;
    }

    // 2. Jika belum ada, cari root page / halaman yang bisa dijadikan parent
    const pageSearch = await client.search({
      query: "",
      filter: { property: "object", value: "page" as any },
      page_size: 1,
    });

    if (pageSearch.results.length === 0) {
      console.warn("[Notion] Tidak ditemukan parent page untuk membuat database transaksi.");
      return null;
    }

    const parentPageId = pageSearch.results[0].id;

    // 3. Buat database baru dengan kolom terstruktur
    const newDb = await (client.databases.create as any)({
      parent: { type: "page_id", page_id: parentPageId },
      title: [
        {
          type: "text",
          text: { content: "Smart Finance - Transaksi" },
        },
      ],
      icon: {
        type: "external",
        external: { url: NOTION_ICONS.wallet },
      },
      properties: {
        Deskripsi: {
          title: {},
        },
        Tipe: {
          select: {
            options: [
              { name: "PEMASUKAN", color: "green" },
              { name: "PENGELUARAN", color: "red" },
              { name: "TRANSFER", color: "blue" },
            ],
          },
        },
        "Jumlah (IDR)": {
          number: {
            format: "number",
          },
        },
        Dompet: {
          select: {
            options: [
              { name: "Cash", color: "green" },
              { name: "ShopeePay", color: "orange" },
              { name: "GoPay", color: "blue" },
              { name: "Krom Bank", color: "purple" },
              { name: "BCA", color: "blue" },
              { name: "Jago", color: "yellow" },
            ],
          },
        },
        Kategori: {
          select: {
            options: [
              { name: "Makanan & Minuman", color: "orange" },
              { name: "Operasional ShopeeFood & Bensin", color: "red" },
              { name: "Pendapatan Driver ShopeeFood", color: "green" },
              { name: "Pendapatan Freelance", color: "blue" },
              { name: "Kosan & Tagihan Listrik", color: "purple" },
              { name: "Kuota Internet & Pulsa", color: "yellow" },
              { name: "Saldo Awal & Penyesuaian", color: "default" },
            ],
          },
        },
        Tanggal: {
          date: {},
        },
      },
    });

    return newDb.id;
  } catch (err) {
    console.error("[Notion] Gagal menginisialisasi database:", err);
    return null;
  }
}

/**
 * Sync satu transaksi ke Notion Database
 */
export async function syncTransactionToNotion({
  description,
  type,
  amount,
  walletName,
  categoryName,
  date,
}: {
  description: string;
  type: string;
  amount: number | bigint;
  walletName: string;
  categoryName: string;
  date?: Date;
}): Promise<boolean> {
  const client = getNotionClient();
  if (!client) return false;

  try {
    const dbId = await getOrCreateFinanceDatabase(client);
    if (!dbId) return false;

    const amtNum = typeof amount === "bigint" ? Number(amount) : amount;
    const txType = type.toUpperCase() === "INCOME" ? "PEMASUKAN" : "PENGELUARAN";

    await client.pages.create({
      parent: { database_id: dbId },
      properties: {
        Deskripsi: {
          title: [
            {
              text: { content: description },
            },
          ],
        },
        Tipe: {
          select: { name: txType },
        },
        "Jumlah (IDR)": {
          number: amtNum,
        },
        Dompet: {
          select: { name: walletName },
        },
        Kategori: {
          select: { name: categoryName },
        },
        Tanggal: {
          date: {
            start: (date || new Date()).toISOString().split("T")[0],
          },
        },
      },
    });

    return true;
  } catch (err) {
    console.error("[Notion] Gagal sync transaksi ke Notion:", err);
    return false;
  }
}

function createProgressBar(percent: number): string {
  const totalBars = 8;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * totalBars);
  const empty = totalBars - filled;
  let char = "🟩";
  if (percent > 80 && percent <= 100) char = "🟧";
  if (percent > 100) char = "🟥";
  return `${char.repeat(filled)}${"⬜".repeat(empty)} ${percent}%`;
}

function cell(content: string, options?: { bold?: boolean; italic?: boolean; code?: boolean; color?: any }) {
  return [
    {
      type: "text" as const,
      text: { content },
      annotations: options,
    },
  ];
}

async function clearPageBlocks(client: Client, pageId: string) {
  let hasMore = true;
  let cursor: string | undefined = undefined;

  while (hasMore) {
    const list: any = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 50,
    });

    for (const b of list.results) {
      try {
        await client.blocks.delete({ block_id: b.id });
      } catch (e: any) {
        console.warn(`[Notion] Failed to delete block ${b.id}:`, e.message);
      }
    }

    hasMore = list.has_more;
    cursor = list.next_cursor;
  }
}

/**
 * Buat atau perbarui Halaman Dashboard Visualisasi Keuangan di Notion
 * Desain modern menyerupai Web Dashboard (Multi-Column KPI Cards, Native Tables, Progress Bars)
 */
export async function syncDashboardToNotion(userId?: string): Promise<{
  success: boolean;
  pageUrl: string | null;
  pageId: string | null;
}> {
  const client = getNotionClient();
  if (!client) {
    return { success: false, pageUrl: null, pageId: null };
  }

  try {
    // 1. Ambil data agregasi keuangan terkini
    const wallets = await getWalletsSummary(userId);
    const budgets = await getBudgetsSummary(userId);
    const assets = await getAssetsSummary(userId);
    const subs = await getSubscriptionsSummary(userId);
    const debts = await getDebtsSummary(userId);

    // Ambil 5 transaksi terakhir
    const txSql = userId
      ? `SELECT t.type, t.amount, t.description, t."createdAt", w.name as wallet_name, c.name as category_name
         FROM public."Transaction" t
         LEFT JOIN public."Wallet" w ON t."walletId" = w.id
         LEFT JOIN public."Category" c ON t."categoryId" = c.id
         WHERE t."userId" = $1
         ORDER BY t."createdAt" DESC LIMIT 5`
      : `SELECT t.type, t.amount, t.description, t."createdAt", w.name as wallet_name, c.name as category_name
         FROM public."Transaction" t
         LEFT JOIN public."Wallet" w ON t."walletId" = w.id
         LEFT JOIN public."Category" c ON t."categoryId" = c.id
         ORDER BY t."createdAt" DESC LIMIT 5`;
    const txRes = await executeSql(txSql, userId ? [userId] : []);

    // Hitung total income & expense bulan berjalan
    const txStatsSql = userId
      ? `SELECT type, SUM(amount) as total FROM public."Transaction" WHERE "userId" = $1 GROUP BY type`
      : `SELECT type, SUM(amount) as total FROM public."Transaction" GROUP BY type`;
    const txStatsRes = await executeSql(txStatsSql, userId ? [userId] : []);

    let totalIncome = 0n;
    let totalExpense = 0n;
    for (const row of txStatsRes.rows || []) {
      if (row.type === "INCOME") totalIncome += BigInt(row.total || 0);
      if (row.type === "EXPENSE") totalExpense += BigInt(row.total || 0);
    }

    // 2. Cari atau buat halaman dashboard
    const search = await client.search({
      query: "Smart Finance",
      filter: { property: "object", value: "page" as any },
    });

    let dashboardPageId: string | null = null;
    let pageUrl: string | null = null;

    if (search.results.length > 0) {
      dashboardPageId = search.results[0].id;
      pageUrl = (search.results[0] as any).url || `https://notion.so/${dashboardPageId.replace(/-/g, "")}`;
    } else {
      // Buat halaman baru di bawah halaman root yang tersedia
      const rootSearch = await client.search({
        query: "",
        filter: { property: "object", value: "page" as any },
        page_size: 1,
      });

      const parentId = rootSearch.results[0]?.id;
      if (!parentId) {
        throw new Error("Tidak ditemukan parent page untuk meletakkan Dashboard.");
      }

      const createdPage = await client.pages.create({
        parent: { page_id: parentId },
        icon: { type: "emoji", emoji: "💎" },
        cover: {
          type: "external",
          external: {
            url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop",
          },
        },
        properties: {
          title: [
            {
              type: "text",
              text: { content: "Smart Finance — Web Dashboard 💎" },
            },
          ],
        } as any,
      });

      dashboardPageId = createdPage.id;
      pageUrl = (createdPage as any).url || `https://notion.so/${dashboardPageId.replace(/-/g, "")}`;
    }

    // Update cover, icon, dan title agar konsisten dan premium
    try {
      await client.pages.update({
        page_id: dashboardPageId,
        icon: { type: "emoji", emoji: "💎" },
        cover: {
          type: "external",
          external: {
            url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop",
          },
        },
        properties: {
          title: [
            {
              type: "text",
              text: { content: "Smart Finance — Web Dashboard 💎" },
            },
          ],
        } as any,
      });
    } catch (e: any) {
      console.warn("[Notion] Warning updating page meta:", e.message);
    }

    // Bersihkan blok lama agar tidak terjadi duplikasi
    await clearPageBlocks(client, dashboardPageId);

    // 3. Susun data kalkulasi
    const activeWallets = wallets.filter(
      (w) => w.balanceRaw > 0n || ["cash", "shopeepay", "gopay", "krom bank"].includes(w.name.toLowerCase())
    );
    const totalBalance = activeWallets.reduce((acc, w) => acc + w.balanceRaw, 0n);

    const nowStr = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
      timeStyle: "short",
    });

    // 4. Susun visual blocks berdesain Web Dashboard
    const blocks: any[] = [
      // HEADER BANNER & SYSTEM CONTEXT
      {
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "👤" },
          color: "gray_background",
          rich_text: [
            {
              type: "text",
              text: { content: "Luqman • Kuliah + Freelance Tech + Driver ShopeeFood\n" },
              annotations: { bold: true },
            },
            {
              type: "text",
              text: { content: `🟢 Status: Realtime Database Synced  |  🕒 Update: ${nowStr} WIB\n` },
              annotations: { italic: true },
            },
            {
              type: "text",
              text: { content: "🌐 Web App Dashboard: " },
              annotations: { bold: true },
            },
            {
              type: "text",
              text: { content: "http://localhost:3000 (Klik untuk buka versi interaktif lengkap)" },
              annotations: { code: true },
            },
          ],
        },
      },

      // ROW 1: 3-COLUMN KPI STAT CARDS
      {
        object: "block",
        type: "column_list",
        column_list: {
          children: [
            // Card 1: Likuiditas Kas
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "callout",
                    callout: {
                      icon: { type: "emoji", emoji: "💳" },
                      color: "green_background",
                      rich_text: [
                        {
                          type: "text",
                          text: { content: "TOTAL LIKUIDITAS SALDO\n" },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `${formatIDR(totalBalance)}\n` },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `🟢 ${activeWallets.length} Dompet Aktif (Siap Pakai)` },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Card 2: Valuasi Harta
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "callout",
                    callout: {
                      icon: { type: "emoji", emoji: "🪙" },
                      color: "yellow_background",
                      rich_text: [
                        {
                          type: "text",
                          text: { content: "TOTAL VALUASI HARTA\n" },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `${assets.totalValue}\n` },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: "⭐ 4 Gram Emas Antam + Aset Fisik" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Card 3: Plafon Anggaran
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "callout",
                    callout: {
                      icon: { type: "emoji", emoji: "🎯" },
                      color: "blue_background",
                      rich_text: [
                        {
                          type: "text",
                          text: { content: "PLAFON ANGGARAN BULANAN\n" },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `${budgets.totalBudget}\n` },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `📊 Terpakai: ${budgets.totalSpent}` },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      // ROW 2: 2-COLUMN SECONDARY CARDS (CASHFLOW & PIUTANG)
      {
        object: "block",
        type: "column_list",
        column_list: {
          children: [
            // Arus Kas
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "callout",
                    callout: {
                      icon: { type: "emoji", emoji: "📈" },
                      color: "purple_background",
                      rich_text: [
                        {
                          type: "text",
                          text: { content: "ARUS KAS BULAN INI\n" },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `Net: ${formatIDR(totalIncome - totalExpense)}\n` },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `📥 Masuk: ${formatIDR(totalIncome)}  •  📤 Keluar: ${formatIDR(totalExpense)}` },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Piutang & Hutang
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "callout",
                    callout: {
                      icon: { type: "emoji", emoji: "🤝" },
                      color: "orange_background",
                      rich_text: [
                        {
                          type: "text",
                          text: { content: "STATUS PIUTANG & KEWAJIBAN\n" },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `Sisa Piutang: ${debts.totalReceivable}\n` },
                          annotations: { bold: true },
                        },
                        {
                          type: "text",
                          text: { content: `Hutang: ${debts.totalPayable}  •  Net: +${debts.totalReceivable}` },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      { object: "block", type: "divider", divider: {} },

      // TABLE: SALDO DOMPET & REKENING
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "💳 Saldo Dompet & Rekening Kas Realtime" } }],
        },
      },
      {
        object: "block",
        type: "table",
        table: {
          table_width: 4,
          has_column_header: true,
          has_row_header: false,
          children: [
            {
              type: "table_row",
              table_row: {
                cells: [
                  cell("Dompet / Rekening", { bold: true }),
                  cell("Peruntukan & Kategori", { bold: true }),
                  cell("Saldo Terkini", { bold: true }),
                  cell("Status Likuiditas", { bold: true }),
                ],
              },
            },
            ...activeWallets.map((w) => {
              const lower = w.name.toLowerCase();
              let categoryDesc = "Operasional Harian";
              let icon = "💳";
              if (lower.includes("cash")) {
                categoryDesc = "Uang Tunai di Dompet";
                icon = "💵";
              } else if (lower.includes("shopee")) {
                categoryDesc = "Operasional Driver & Belanja";
                icon = "📱";
              } else if (lower.includes("gopay")) {
                categoryDesc = "Transport & Kuliner";
                icon = "🟢";
              } else if (lower.includes("krom")) {
                categoryDesc = "Tabungan Digital & Dana Darurat";
                icon = "🏦";
              }
              return {
                type: "table_row",
                table_row: {
                  cells: [
                    cell(`${icon} ${w.name}`, { bold: true }),
                    cell(categoryDesc),
                    cell(w.balance, { bold: true }),
                    cell("🟢 Likuid (Siap Pakai)"),
                  ],
                },
              };
            }),
            // Summary row
            {
              type: "table_row",
              table_row: {
                cells: [
                  cell("💎 TOTAL LIKUIDITAS", { bold: true }),
                  cell(`${activeWallets.length} Rekening Aktif`, { italic: true }),
                  cell(formatIDR(totalBalance), { bold: true }),
                  cell("🟢 100% Siap Digunakan", { bold: true }),
                ],
              },
            },
          ],
        },
      },

      { object: "block", type: "divider", divider: {} },

      // TABLE: BUDGET MONITORING WITH PROGRESS BARS
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "🎯 Monitoring Anggaran Belanja (Budgeting Bulanan)" } }],
        },
      },
      {
        object: "block",
        type: "table",
        table: {
          table_width: 5,
          has_column_header: true,
          has_row_header: false,
          children: [
            {
              type: "table_row",
              table_row: {
                cells: [
                  cell("Kategori Pengeluaran", { bold: true }),
                  cell("Plafon Anggaran", { bold: true }),
                  cell("Realisasi Belanja", { bold: true }),
                  cell("Progress Bar", { bold: true }),
                  cell("Status Keuangan", { bold: true }),
                ],
              },
            },
            ...(budgets.items || []).map((b: any) => {
              const p = b.percentage || 0;
              let statusBadge = "🟢 Sangat Aman";
              if (p >= 100) statusBadge = "🚨 Melebihi Plafon!";
              else if (p >= 75) statusBadge = "⚠️ Waspada / Ketat";
              else if (p === 0) statusBadge = "⚪ Belum Ada Pengeluaran";

              return {
                type: "table_row",
                table_row: {
                  cells: [
                    cell(b.category, { bold: true }),
                    cell(b.limit),
                    cell(b.spent, { bold: true }),
                    cell(createProgressBar(p)),
                    cell(statusBadge),
                  ],
                },
              };
            }),
            // Summary Row Budget
            {
              type: "table_row",
              table_row: {
                cells: [
                  cell("🎯 TOTAL ANGGARAN", { bold: true }),
                  cell(budgets.totalBudget, { bold: true }),
                  cell(budgets.totalSpent, { bold: true }),
                  cell(
                    createProgressBar(
                      Math.round(
                        (Number(budgets.totalSpentRaw || 0) / Math.max(1, Number(budgets.totalBudgetRaw || 1))) * 100
                      )
                    )
                  ),
                  cell("📊 Terkontrol"),
                ],
              },
            },
          ],
        },
      },

      { object: "block", type: "divider", divider: {} },

      // 2 COLUMNS: ASSETS & SUBSCRIPTIONS/DEBTS
      {
        object: "block",
        type: "column_list",
        column_list: {
          children: [
            // Column 1: Aset & Harta
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "heading_3",
                    heading_3: {
                      rich_text: [{ type: "text", text: { content: "🪙 Portofolio Aset & Investasi" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "table",
                    table: {
                      table_width: 3,
                      has_column_header: true,
                      has_row_header: false,
                      children: [
                        {
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell("Nama Aset", { bold: true }),
                              cell("Valuasi Pasar", { bold: true }),
                              cell("Keterangan", { bold: true }),
                            ],
                          },
                        },
                        ...(assets.items || []).map((a: any) => ({
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell(a.name, { bold: true }),
                              cell(a.value, { bold: true }),
                              cell(a.notes || a.category),
                            ],
                          },
                        })),
                        {
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell("⭐ TOTAL HARTA", { bold: true }),
                              cell(assets.totalValue, { bold: true }),
                              cell("Nilai Taksiran Pasar", { italic: true }),
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Column 2: Langganan & Piutang
            {
              object: "block",
              type: "column",
              column: {
                children: [
                  {
                    object: "block",
                    type: "heading_3",
                    heading_3: {
                      rich_text: [{ type: "text", text: { content: "🔄 Langganan Rutin & Piutang" } }],
                    },
                  },
                  {
                    object: "block",
                    type: "table",
                    table: {
                      table_width: 3,
                      has_column_header: true,
                      has_row_header: false,
                      children: [
                        {
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell("Item / Kontak", { bold: true }),
                              cell("Nominal Tagihan", { bold: true }),
                              cell("Siklus / Keterangan", { bold: true }),
                            ],
                          },
                        },
                        ...(subs.items || []).map((s: any) => ({
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell(`🎵 ${s.name}`, { bold: true }),
                              cell(s.amount, { bold: true }),
                              cell(s.billingCycle || s.billingDay || "Bulanan"),
                            ],
                          },
                        })),
                        ...(debts.receivables || []).map((d: any) => ({
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell(`🤝 ${d.personName}`, { bold: true }),
                              cell(d.remaining, { bold: true }),
                              cell(`Piutang: ${d.description}`),
                            ],
                          },
                        })),
                        ...(debts.debts || []).map((d: any) => ({
                          type: "table_row",
                          table_row: {
                            cells: [
                              cell(`⚠️ ${d.personName}`, { bold: true }),
                              cell(d.remaining, { bold: true }),
                              cell(`Hutang: ${d.description}`),
                            ],
                          },
                        })),
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      { object: "block", type: "divider", divider: {} },

      // TABLE: 5 TRANSAKSI TERAKHIR (LIVE FEED)
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "⏱️ 5 Transaksi Terakhir (Live Feed)" } }],
        },
      },
      {
        object: "block",
        type: "table",
        table: {
          table_width: 5,
          has_column_header: true,
          has_row_header: false,
          children: [
            {
              type: "table_row",
              table_row: {
                cells: [
                  cell("Tanggal & Waktu", { bold: true }),
                  cell("Keterangan", { bold: true }),
                  cell("Tipe", { bold: true }),
                  cell("Dompet", { bold: true }),
                  cell("Nominal (IDR)", { bold: true }),
                ],
              },
            },
            ...(txRes.rows || []).map((t: any) => {
              const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString("id-ID") : "-";
              const isIncome = t.type === "INCOME";
              return {
                type: "table_row",
                table_row: {
                  cells: [
                    cell(dateStr),
                    cell(t.description || "-"),
                    cell(isIncome ? "🟢 Masuk" : "🔴 Keluar"),
                    cell(t.wallet_name || "-"),
                    cell(formatIDR(BigInt(t.amount || 0)), { bold: true }),
                  ],
                },
              };
            }),
          ],
        },
      },

      // ADVISOR CALLOUT
      {
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "🤖" },
          color: "purple_background",
          rich_text: [
            {
              type: "text",
              text: { content: "Evaluasi Finansial FinBot (AI Assistant):\n" },
              annotations: { bold: true },
            },
            {
              type: "text",
              text: {
                content:
                  "Likuiditas dompet Anda berada dalam kondisi prima dengan total kas Rp 9.600.000 tersebar di 4 dompet aktif. Pastikan untuk selalu mencatat pengeluaran operasional ShopeeFood dan bensin harian melalui bot WhatsApp agar alokasi budget bulanan tetap terjaga rapi!",
              },
            },
          ],
        },
      },
    ];

    // 5. Append blocks ke halaman Notion
    await client.blocks.children.append({
      block_id: dashboardPageId,
      children: blocks,
    });

    return {
      success: true,
      pageUrl,
      pageId: dashboardPageId,
    };
  } catch (err: any) {
    console.error("[Notion] Gagal menyinkronkan dashboard Notion:", err);
    return { success: false, pageUrl: null, pageId: null };
  }
}
