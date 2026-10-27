import assert from "node:assert/strict";
import {
  getAssetsSummary,
  getBudgetsSummary,
  getDebtsSummary,
  getFinancialSummary,
  getSubscriptionsSummary,
  getWalletsSummary,
  payDebt,
  recordAsset,
  recordDebt,
  recordSubscription,
  saveTransaction,
  setCategoryBudget,
  setWalletInitialBalance,
  transferBalance,
} from "./index.ts";

async function runFinanceTests() {
  console.log("🧪 Memulai pengujian modul finance terstruktur...");

  const testUserId = "test-user-" + Date.now();

  // 1. Test Inisialisasi Saldo Dompet
  const initBCA = await setWalletInitialBalance("BCA", 1_500_000, testUserId);
  assert.equal(initBCA.wallet, "BCA");
  assert.equal(initBCA.targetBalance, "Rp 1.500.000");

  const initShopee = await setWalletInitialBalance("ShopeePay", 300_000, testUserId);
  assert.equal(initShopee.wallet, "ShopeePay");
  assert.equal(initShopee.targetBalance, "Rp 300.000");

  console.log("✔ Test 1 passed: Inisialisasi saldo BCA & ShopeePay");

  // 2. Test Simpan Transaksi Pemasukan & Pengeluaran
  const txIncome = await saveTransaction({
    data: {
      type: "INCOME",
      amount: 250_000,
      description: "Project freelance web scraping",
      category: "Pendapatan Freelance",
      wallet: "BCA",
    },
    userId: testUserId,
  });
  assert.equal(txIncome.transaction.type, "INCOME");
  assert.equal(txIncome.wallet.name, "BCA");

  const txExpense = await saveTransaction({
    data: {
      type: "EXPENSE",
      amount: 25_000,
      description: "Bensin pertalite motor beat",
      category: "Operasional ShopeeFood & Bensin",
      wallet: "Cash",
    },
    userId: testUserId,
  });
  assert.equal(txExpense.transaction.type, "EXPENSE");
  console.log("✔ Test 2 passed: Pencatatan transaksi personal");

  // 3. Test Transfer & COD Settlement
  // Driver terima pesanan COD Rp 45.000: Saldo ShopeePay berkurang Rp 45.000, Cash bertambah Rp 45.000!
  const codSettlement = await transferBalance({
    fromWalletName: "ShopeePay",
    toWalletName: "Cash",
    amount: 45_000,
    type: "COD_SETTLEMENT",
    userId: testUserId,
  });
  assert.equal(codSettlement.type, "COD_SETTLEMENT");
  assert.equal(codSettlement.fromWallet.name, "ShopeePay");
  assert.equal(codSettlement.toWallet.name, "Cash");
  console.log("✔ Test 3 passed: Settlement order COD (ShopeePay -> Cash)");

  // 4. Test Saldo Dompet setelah transaksi & COD
  const wallets = await getWalletsSummary(testUserId);
  const shopeeW = wallets.find((w) => w.name === "ShopeePay");
  const cashW = wallets.find((w) => w.name === "Cash");

  assert.ok(shopeeW);
  assert.ok(cashW);
  // ShopeePay: 300.000 - 45.000 = 255.000
  assert.equal(shopeeW?.balance, "Rp 255.000");
  // Cash: -25.000 (bensin) + 45.000 (COD) = +20.000
  assert.equal(cashW?.balance, "Rp 20.000");
  console.log("✔ Test 4 passed: Rekonsiliasi saldo dompet akurat pasca transfer & COD");

  // 5. Test Budgeting
  await setCategoryBudget({
    categoryName: "Operasional ShopeeFood & Bensin",
    amount: 350_000,
    period: "MONTHLY",
    userId: testUserId,
  });

  const budgets = await getBudgetsSummary(testUserId);
  assert.equal(budgets.count, 1);
  const bensinBudget = budgets.items[0];
  assert.equal(bensinBudget.category, "Operasional ShopeeFood & Bensin");
  assert.equal(bensinBudget.limit, "Rp 350.000");
  assert.equal(bensinBudget.spent, "Rp 25.000");
  assert.equal(bensinBudget.remaining, "Rp 325.000");
  assert.equal(bensinBudget.status, "SAFE");
  console.log("✔ Test 5 passed: Pengaturan & kalkulasi budget kategori");

  // 6. Test Hutang & Piutang
  const debt = await recordDebt({
    type: "RECEIVABLE", // Piutang (orang lain hutang ke kita)
    personName: "Budi Teman Kuliah",
    amount: 50_000,
    description: "Talangan makan warteg pas nugas",
    userId: testUserId,
  });
  assert.equal(debt.type, "RECEIVABLE");
  assert.equal(debt.status, "UNPAID");

  const debtSummary1 = await getDebtsSummary(testUserId);
  assert.equal(debtSummary1.receivables.length, 1);
  assert.equal(debtSummary1.totalReceivable, "Rp 50.000");

  // Budi bayar sebagian 30.000
  const payRes = await payDebt({
    personName: "Budi",
    amount: 30_000,
    userId: testUserId,
  });
  assert.equal(payRes?.status, "PARTIAL");
  assert.equal(payRes?.remainingAmount, "Rp 20.000");

  const debtSummary2 = await getDebtsSummary(testUserId);
  assert.equal(debtSummary2.totalReceivable, "Rp 20.000");
  console.log("✔ Test 6 passed: Pencatatan, cicilan, dan buku hutang/piutang");

  // 7. Test Aset
  await recordAsset({
    name: "Motor Honda Beat FI 2021",
    category: "VEHICLE",
    value: 12_500_000,
    notes: "Kendaraan narik ShopeeFood & ngampus",
    userId: testUserId,
  });
  const assets = await getAssetsSummary(testUserId);
  assert.equal(assets.count, 1);
  assert.equal(assets.totalValue, "Rp 12.500.000");
  console.log("✔ Test 7 passed: Pencatatan aset & valuasi harta");

  // 8. Test Subscription / Langganan
  await recordSubscription({
    name: "Spotify Student",
    amount: 27_500,
    billingCycle: "MONTHLY",
    billingDay: 15,
    walletName: "ShopeePay",
    userId: testUserId,
  });
  const subs = await getSubscriptionsSummary(testUserId);
  assert.equal(subs.count, 1);
  assert.equal(subs.monthlyTotal, "Rp 27.500");
  console.log("✔ Test 8 passed: Pendaftaran langganan & total komitmen bulanan");

  console.log("\n🎉 Seluruh 8 pengujian modul modular finance sukses 100%!");
}

runFinanceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test gagal:", err);
    process.exit(1);
  });
