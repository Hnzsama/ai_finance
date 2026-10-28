import assert from "node:assert/strict";
import { parseFinancialMessage } from "./parser.js";

// Test 1: Pemasukan Driver Singkat
const t1 = parseFinancialMessage("+30000, shopeefood driver");
assert.equal(t1.action, "RECORD_TRANSACTION");
assert.equal(t1.data?.type, "INCOME");
assert.equal(t1.data?.amount, 30000);
assert.equal(t1.data?.category, "Pendapatan Driver ShopeeFood");
console.log("✔ Test 1 passed:", t1.reply_message);

// Test 2: Pengeluaran Kasual 28k pake gopay
const t2 = parseFinancialMessage("kopi kenangan 28k pake gopay");
assert.equal(t2.action, "RECORD_TRANSACTION");
assert.equal(t2.data?.type, "EXPENSE");
assert.equal(t2.data?.amount, 28000);
assert.equal(t2.data?.wallet, "GoPay");
assert.equal(t2.data?.category, "Makanan & Minuman");
console.log("✔ Test 2 passed:", t2.reply_message);

// Test 3: Pemasukan Juta & Bank
const t3 = parseFinancialMessage("gaji bulanan masuk 7.5jt ke bca");
assert.equal(t3.action, "RECORD_TRANSACTION");
assert.equal(t3.data?.type, "INCOME");
assert.equal(t3.data?.amount, 7500000);
assert.equal(t3.data?.wallet, "BCA");
console.log("✔ Test 3 passed:", t3.reply_message);

// Test 4: Query Summary
const t4 = parseFinancialMessage("rekap pengeluaran minggu ini dong");
assert.equal(t4.action, "QUERY_SUMMARY");
console.log("✔ Test 4 passed:", t4.reply_message);

// Test 5: Order COD ShopeeFood (Pindah saldo ShopeePay ke Cash)
const t5 = parseFinancialMessage("dapat orderan cod 35rb");
assert.equal(t5.action, "TRANSFER_BALANCE");
assert.equal(t5.data?.amount, 35000);
assert.equal(t5.data?.fromWallet, "ShopeePay");
assert.equal(t5.data?.toWallet, "Cash");
assert.equal(t5.data?.isCod, true);
console.log("✔ Test 5 passed:", t5.reply_message);

// Test 6: Query Wallets
const t6 = parseFinancialMessage("dompet saya apa aja");
assert.equal(t6.action, "LIST_WALLETS");
console.log("✔ Test 6 passed:", t6.reply_message);

// Test 7: Query Riwayat
const t7 = parseFinancialMessage("riwayat transaksi");
assert.equal(t7.action, "RECENT_TRANSACTIONS");
console.log("✔ Test 7 passed:", t7.reply_message);

// Test 8: Set Budget
const t8 = parseFinancialMessage("set budget makan 500rb");
assert.equal(t8.action, "SET_BUDGET");
assert.equal(t8.data?.amount, 500000);
assert.equal(t8.data?.category, "Makanan & Minuman");
console.log("✔ Test 8 passed:", t8.reply_message);

// Test 9: Menu Bantuan
const t9 = parseFinancialMessage("bantuan");
assert.equal(t9.action, "HELP");
console.log("✔ Test 9 passed:", t9.reply_message);

// Test 10: Multi-Wallet Initial Balance with Minus Driver Balance
const t10 = parseFinancialMessage("cash 32 ribu, shopeepay -52.652");
assert.equal(t10.action, "SET_WALLET_BALANCE");
assert.equal(t10.data?.actionPayload?.items?.length, 2);
assert.equal(t10.data?.actionPayload?.items[0].wallet, "Cash");
assert.equal(t10.data?.actionPayload?.items[0].amount, 32000);
assert.equal(t10.data?.actionPayload?.items[1].wallet, "ShopeePay");
assert.equal(t10.data?.actionPayload?.items[1].amount, -52652);
console.log("✔ Test 10 passed:", t10.reply_message);

console.log("\n🎉 All 10 parser test cases passed perfectly!");
