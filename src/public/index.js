/**
 * SMART FINANCE — CLIENT-SIDE DASHBOARD LOGIC
 */

let charts = {
  wallets: null,
  categories: null,
  cashflow: null,
};

let currentOverviewData = null;
let notionDashboardUrl = "https://app.notion.com/p/Smart-Finance-Dashboard-401d8d8d2e9b81afbdb4f103d8800028";

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initFilters();
  initActions();
  loadAllData();
});

// ============================================================================
// TAB NAVIGATION
// ============================================================================
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      switchTab(targetId);
    });
  });

  // Switch tab via inline links
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-switch-tab]");
    if (link) {
      e.preventDefault();
      const targetId = link.getAttribute("data-switch-tab");
      switchTab(targetId);
    }
  });
}

function switchTab(targetId) {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-tab") === targetId);
  });

  tabContents.forEach((c) => {
    c.classList.toggle("active", c.id === targetId);
  });

  // Jika pindah ke tab transaksi, load ulang transaksi dengan filter aktif
  if (targetId === "tab-transactions") {
    loadTransactions();
  }
}

// ============================================================================
// DATA FETCHING & POPULATION
// ============================================================================
async function loadAllData() {
  await Promise.all([loadOverview(), loadTransactions()]);
}

async function loadOverview() {
  try {
    const res = await fetch("/api/overview");
    if (!res.ok) throw new Error("Gagal mengambil data overview");
    const data = await res.json();
    currentOverviewData = data;

    if (data.notionUrl) {
      notionDashboardUrl = data.notionUrl;
    }

    renderKPIs(data);
    renderCharts(data);
    renderWallets(data.wallets);
    renderBudgets(data.budgets);
    renderAssetsAndDebts(data);
  } catch (err) {
    console.error("Error loadOverview:", err);
  }
}

function renderKPIs(data) {
  const { summary, wallets } = data;

  document.getElementById("kpi-liquidity").textContent = summary.totalLiquidity;
  document.getElementById("kpi-assets").textContent = summary.totalAssetValue;
  document.getElementById("kpi-budget").textContent = summary.totalBudget;
  document.getElementById("kpi-receivable").textContent = data.debts.totalReceivable;

  const activeCount = wallets.filter((w) => w.balanceRaw > 0n || ["cash", "shopeepay", "gopay", "krom bank"].includes(w.name.toLowerCase())).length;
  document.getElementById("kpi-wallets-count").textContent = `${activeCount} Dompet Aktif`;
}

// ============================================================================
// CHARTS (Chart.js)
// ============================================================================
function renderCharts(data) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js belum siap");
    return;
  }

  // 1. Chart Distribusi Dompet
  const activeWallets = data.wallets.filter((w) => w.balanceRaw > 0n || ["cash", "shopeepay", "gopay", "krom bank"].includes(w.name.toLowerCase()));
  const walletLabels = activeWallets.map((w) => w.name);
  const walletValues = activeWallets.map((w) => Number(w.balanceRaw));

  const ctxWallets = document.getElementById("chart-wallets")?.getContext("2d");
  if (ctxWallets) {
    if (charts.wallets) charts.wallets.destroy();
    charts.wallets = new Chart(ctxWallets, {
      type: "doughnut",
      data: {
        labels: walletLabels,
        datasets: [
          {
            data: walletValues,
            backgroundColor: ["#10b981", "#f97316", "#06b6d4", "#a855f7", "#6366f1", "#f59e0b"],
            borderWidth: 2,
            borderColor: "#090d16",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#94a3b8", font: { family: "Plus Jakarta Sans" } } },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: Rp ${item.parsed.toLocaleString("id-ID")}`,
            },
          },
        },
      },
    });
  }

  // 2. Chart Kategori Pengeluaran
  const budgetLabels = data.budgets.map((b) => b.category);
  const budgetValues = data.budgets.map((b) => {
    const raw = b.budget.replace(/[^0-9]/g, "");
    return Number(raw) || 100000;
  });

  const ctxCategories = document.getElementById("chart-categories")?.getContext("2d");
  if (ctxCategories) {
    if (charts.categories) charts.categories.destroy();
    charts.categories = new Chart(ctxCategories, {
      type: "polarArea",
      data: {
        labels: budgetLabels,
        datasets: [
          {
            data: budgetValues,
            backgroundColor: [
              "rgba(249, 115, 22, 0.7)",
              "rgba(244, 63, 94, 0.7)",
              "rgba(168, 85, 247, 0.7)",
              "rgba(59, 130, 246, 0.7)",
              "rgba(16, 185, 129, 0.7)",
              "rgba(245, 158, 11, 0.7)",
              "rgba(6, 182, 212, 0.7)",
            ],
            borderColor: "#090d16",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#94a3b8", font: { family: "Plus Jakarta Sans", size: 11 } } },
        },
        scales: {
          r: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { display: false } },
        },
      },
    });
  }

  // 3. Chart Arus Kas Cashflow
  const totalInc = Number(data.summary.totalIncomeRaw || 0);
  const totalExp = Number(data.summary.totalExpenseRaw || 0);

  const ctxCashflow = document.getElementById("chart-cashflow")?.getContext("2d");
  if (ctxCashflow) {
    if (charts.cashflow) charts.cashflow.destroy();
    charts.cashflow = new Chart(ctxCashflow, {
      type: "bar",
      data: {
        labels: ["Pemasukan Total", "Pengeluaran Total", "Total Likuiditas Saldo"],
        datasets: [
          {
            label: "Arus Kas (IDR)",
            data: [totalInc, totalExp, Number(data.summary.totalLiquidityRaw || 0)],
            backgroundColor: ["#10b981", "#f43f5e", "#6366f1"],
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` Rp ${item.parsed.y.toLocaleString("id-ID")}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
          y: {
            ticks: {
              color: "#94a3b8",
              callback: (v) => `Rp ${(v / 1000000).toFixed(1)}M`,
            },
            grid: { color: "rgba(255, 255, 255, 0.05)" },
          },
        },
      },
    });
  }
}

// ============================================================================
// RENDER WALLETS & BUDGETS & ASSETS
// ============================================================================
function renderWallets(wallets) {
  const miniContainer = document.getElementById("wallets-mini-list");
  const fullContainer = document.getElementById("wallets-grid");

  if (miniContainer) miniContainer.innerHTML = "";
  if (fullContainer) fullContainer.innerHTML = "";

  wallets.forEach((w) => {
    // Mini list in Tab 1
    if (miniContainer && (w.balanceRaw > 0n || ["cash", "shopeepay", "gopay", "krom bank"].includes(w.name.toLowerCase()))) {
      const miniEl = document.createElement("div");
      miniEl.className = "mini-wallet-item";
      miniEl.innerHTML = `
        <span class="mini-wallet-name">👛 ${w.name}</span>
        <span class="mini-wallet-balance">${w.balance}</span>
      `;
      miniContainer.appendChild(miniEl);
    }

    // Full card in Tab 3
    if (fullContainer) {
      const cardEl = document.createElement("div");
      cardEl.className = "wallet-card";
      cardEl.innerHTML = `
        <div class="wallet-card-header">
          <div class="wallet-chip"></div>
          <span class="badge ${w.isDefault ? "badge-success" : "badge-info"}">${w.isDefault ? "Default" : "Aktif"}</span>
        </div>
        <div class="wallet-card-balance">${w.balance}</div>
        <div class="wallet-card-name">${w.name}</div>
      `;
      fullContainer.appendChild(cardEl);
    }
  });
}

function renderBudgets(budgets) {
  const container = document.getElementById("budgets-grid");
  if (!container) return;
  container.innerHTML = "";

  budgets.forEach((b) => {
    const percent = b.percent || 0;
    let statusClass = "fill-safe";
    let badgeClass = "badge-success";

    if (percent > 90) {
      statusClass = "fill-danger";
      badgeClass = "badge-danger";
    } else if (percent > 70) {
      statusClass = "fill-warn";
      badgeClass = "badge-gold";
    }

    const el = document.createElement("div");
    el.className = "budget-card";
    el.innerHTML = `
      <div class="budget-card-top">
        <span class="budget-cat-name">${b.category}</span>
        <span class="badge ${badgeClass}">${percent}% Terpakai</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${statusClass}" style="width: ${Math.min(percent, 100)}%;"></div>
      </div>
      <div class="budget-numbers">
        <span>Terpakai: <strong>${b.spent}</strong></span>
        <span>Batas: <strong>${b.budget}</strong></span>
      </div>
    `;
    container.appendChild(el);
  });
}

function renderAssetsAndDebts(data) {
  const assetsContainer = document.getElementById("assets-list");
  const subsContainer = document.getElementById("subs-list");
  const debtsContainer = document.getElementById("debts-list");

  if (assetsContainer) {
    assetsContainer.innerHTML = "";
    data.assets.forEach((a) => {
      const el = document.createElement("div");
      el.className = "asset-card";
      el.innerHTML = `
        <div class="asset-info">
          <h4>${a.name}</h4>
          <p>${a.notes || a.category}</p>
        </div>
        <div class="asset-val">${a.value}</div>
      `;
      assetsContainer.appendChild(el);
    });
  }

  if (subsContainer) {
    subsContainer.innerHTML = "";
    data.subscriptions.forEach((s) => {
      const el = document.createElement("div");
      el.className = "sub-card";
      el.innerHTML = `
        <div class="sub-info">
          <h4>${s.name}</h4>
          <p>Siklus: ${s.billingCycle} • Dompet: ${s.walletName || "ShopeePay"}</p>
        </div>
        <div class="sub-val" style="color: var(--accent-indigo);">${s.amount}</div>
      `;
      subsContainer.appendChild(el);
    });
  }

  if (debtsContainer) {
    debtsContainer.innerHTML = "";
    data.debts.items.forEach((d) => {
      const isReceivable = d.type === "RECEIVABLE";
      const el = document.createElement("div");
      el.className = "debt-card";
      el.innerHTML = `
        <div class="debt-info">
          <h4>${d.personName}</h4>
          <p>${isReceivable ? "Piutang (Teman berhutang ke kita)" : "Hutang kita"} • ${d.description || ""}</p>
        </div>
        <div class="debt-val" style="color: ${isReceivable ? "var(--accent-emerald)" : "var(--accent-rose)"};">
          ${d.amount}
        </div>
      `;
      debtsContainer.appendChild(el);
    });
  }
}

// ============================================================================
// TAB 2: ADVANCED TABLE & FILTER
// ============================================================================
let allLoadedTransactions = [];

async function loadTransactions() {
  const searchInput = document.getElementById("filter-search-input")?.value.trim() || "";
  const typeFilter = document.getElementById("filter-type")?.value || "ALL";
  const walletFilter = document.getElementById("filter-wallet")?.value || "ALL";
  const categoryFilter = document.getElementById("filter-category")?.value || "ALL";

  const params = new URLSearchParams();
  if (searchInput) params.append("search", searchInput);
  if (typeFilter !== "ALL") params.append("type", typeFilter);
  if (walletFilter !== "ALL") params.append("wallet", walletFilter);
  if (categoryFilter !== "ALL") params.append("category", categoryFilter);

  try {
    const res = await fetch(`/api/transactions?${params.toString()}`);
    if (!res.ok) throw new Error("Gagal mengambil data transaksi");
    const data = await res.json();
    allLoadedTransactions = data.transactions || [];

    renderTable(allLoadedTransactions);
    renderRecentMini(allLoadedTransactions.slice(0, 5));
  } catch (err) {
    console.error("Error loadTransactions:", err);
  }
}

function renderTable(transactions) {
  const tbody = document.getElementById("transactions-tbody");
  const emptyState = document.getElementById("table-empty");
  const countText = document.getElementById("table-count-text");

  if (!tbody) return;
  tbody.innerHTML = "";

  if (transactions.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    if (countText) countText.textContent = "Menampilkan 0 transaksi";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (countText) countText.textContent = `Menampilkan ${transactions.length} transaksi`;

  transactions.forEach((tx) => {
    const isIncome = tx.type === "INCOME";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tx.dateFormatted}</td>
      <td><strong>${tx.description}</strong></td>
      <td>
        <span class="badge ${isIncome ? "badge-success" : "badge-danger"}">
          ${isIncome ? "Pemasukan" : "Pengeluaran"}
        </span>
      </td>
      <td>${tx.categoryName}</td>
      <td><span class="badge badge-info">${tx.walletName}</span></td>
      <td class="text-right ${isIncome ? "text-income" : "text-expense"}">
        <strong>${isIncome ? "+" : "-"}${tx.amountFormatted}</strong>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecentMini(recentTxs) {
  const container = document.getElementById("recent-mini-list");
  if (!container) return;
  container.innerHTML = "";

  if (recentTxs.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.85rem;">Belum ada riwayat transaksi.</div>`;
    return;
  }

  recentTxs.forEach((tx) => {
    const isIncome = tx.type === "INCOME";
    const el = document.createElement("div");
    el.className = "recent-item";
    el.innerHTML = `
      <div class="recent-item-info">
        <span class="recent-item-desc">${tx.description}</span>
        <span class="recent-item-meta">${tx.walletName} • ${tx.dateFormatted}</span>
      </div>
      <span class="recent-item-amount ${isIncome ? "text-income" : "text-expense"}">
        ${isIncome ? "+" : "-"}${tx.amountFormatted}
      </span>
    `;
    container.appendChild(el);
  });
}

function initFilters() {
  const searchInput = document.getElementById("filter-search-input");
  const typeSelect = document.getElementById("filter-type");
  const walletSelect = document.getElementById("filter-wallet");
  const categorySelect = document.getElementById("filter-category");
  const resetBtn = document.getElementById("btn-reset-filter");

  let debounceTimer = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadTransactions();
    }, 250);
  });

  typeSelect?.addEventListener("change", () => loadTransactions());
  walletSelect?.addEventListener("change", () => loadTransactions());
  categorySelect?.addEventListener("change", () => loadTransactions());

  resetBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (typeSelect) typeSelect.value = "ALL";
    if (walletSelect) walletSelect.value = "ALL";
    if (categorySelect) categorySelect.value = "ALL";
    loadTransactions();
  });
}

// ============================================================================
// ACTIONS (EXPORT CSV, REFRESH, NOTION LINK)
// ============================================================================
function initActions() {
  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    loadAllData();
  });

  document.getElementById("btn-sync-notion")?.addEventListener("click", () => {
    window.open(notionDashboardUrl, "_blank");
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    exportToCsv(allLoadedTransactions);
  });
}

function exportToCsv(transactions) {
  if (transactions.length === 0) {
    alert("Tidak ada data transaksi untuk diexport!");
    return;
  }

  const headers = ["ID", "Tanggal", "Tipe", "Deskripsi", "Kategori", "Dompet", "Nominal (IDR)"];
  const rows = transactions.map((t) => [
    t.id,
    `"${t.dateFormatted}"`,
    t.type,
    `"${t.description.replace(/"/g, '""')}"`,
    `"${t.categoryName}"`,
    `"${t.walletName}"`,
    t.amount,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Smart_Finance_Transactions_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
