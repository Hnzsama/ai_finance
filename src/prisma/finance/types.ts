import type { TransactionData } from "../../handlers/parser.js";

export interface SaveTransactionParams {
  data: TransactionData;
  userId?: string;
  userPhone?: string;
  jid?: string;
  deviceType?: string;
  rawText?: string;
}

export interface TransferParams {
  fromWalletName: string;
  toWalletName: string;
  amount: number | bigint;
  adminFee?: number | bigint;
  type?: "TRANSFER" | "COD_SETTLEMENT";
  description?: string;
  userId?: string;
  jid?: string;
}

export interface BudgetParams {
  categoryName: string;
  amount: number | bigint;
  period?: "MONTHLY" | "WEEKLY" | "YEARLY";
  userId?: string;
  jid?: string;
}

export interface DebtParams {
  type: "DEBT" | "RECEIVABLE";
  personName: string;
  amount: number | bigint;
  dueDate?: string;
  description?: string;
  walletName?: string;
  userId?: string;
  jid?: string;
}

export interface AssetParams {
  name: string;
  category?: "VEHICLE" | "ELECTRONIC" | "FINANCIAL" | "OTHER";
  value: number | bigint;
  purchasePrice?: number | bigint;
  purchaseDate?: string;
  notes?: string;
  userId?: string;
  jid?: string;
}

export interface SubscriptionParams {
  name: string;
  amount: number | bigint;
  billingCycle?: "MONTHLY" | "YEARLY";
  billingDay?: number;
  walletName?: string;
  categoryName?: string;
  notes?: string;
  userId?: string;
  jid?: string;
}

export interface QueryTransactionsFilter {
  type?: "INCOME" | "EXPENSE";
  wallet?: string;
  category?: string;
  keyword?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}

export interface WalletSummaryItem {
  id: string;
  name: string;
  isDefault: boolean;
  balanceRaw: bigint;
  balance: string;
  count: number;
}

export interface RecentTransactionItem {
  id: string;
  type: string;
  amount: string;
  description: string;
  wallet: string;
  category: string;
  deviceType: string;
  date: string;
}

export const formatIDR = (n: bigint | number): string =>
  `Rp ${new Intl.NumberFormat("id-ID").format(typeof n === "bigint" ? Number(n) : n)}`;
