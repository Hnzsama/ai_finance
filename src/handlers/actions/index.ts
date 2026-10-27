import { handleManageAssets } from "./asset.action.ts";
import { handleGetBudgets, handleSetBudget } from "./budget.action.ts";
import { handleManageDebt } from "./debt.action.ts";
import { handleSetPersonality } from "./personality.action.ts";
import { handleConnectSheet, handleSyncSheet } from "./sheet.action.ts";
import { handleSyncNotion } from "./notion.action.ts";
import { handleManageSubscriptions } from "./subscription.action.ts";
import {
  handleDeleteLastTransaction,
  handleGetRecentTransactions,
  handleGetSummary,
  handleQueryTransactions,
  handleRecordTransaction,
  handleResetTransactions,
} from "./transaction.action.ts";
import type { ActionContext } from "./types.ts";
import {
  handleListWallets,
  handleSetWalletBalance,
  handleTransferBalance,
} from "./wallet.action.ts";

export * from "./types.ts";

/**
 * Master Action Dispatcher: Menghubungkan fungsi AI tool ke handler domain spesifik
 */
export async function dispatchAction(fn: string, ctx: ActionContext): Promise<void> {
  switch (fn) {
    case "sync_notion":
      return handleSyncNotion(ctx);
    case "connect_sheet":
      return handleConnectSheet(ctx);
    case "sync_sheet":
      return handleSyncSheet(ctx);
    case "reset_transactions":
      return handleResetTransactions(ctx);
    case "set_wallet_balance":
      return handleSetWalletBalance(ctx);
    case "record_transaction":
      return handleRecordTransaction(ctx);
    case "transfer_balance":
      return handleTransferBalance(ctx);
    case "set_budget":
      return handleSetBudget(ctx);
    case "get_budgets":
      return handleGetBudgets(ctx);
    case "manage_debt":
      return handleManageDebt(ctx);
    case "manage_assets":
      return handleManageAssets(ctx);
    case "manage_subscriptions":
      return handleManageSubscriptions(ctx);
    case "query_transactions":
      return handleQueryTransactions(ctx);
    case "list_wallets":
      return handleListWallets(ctx);
    case "get_summary":
      return handleGetSummary(ctx);
    case "get_recent_transactions":
      return handleGetRecentTransactions(ctx);
    case "delete_last_transaction":
      return handleDeleteLastTransaction(ctx);
    case "set_personality":
      return handleSetPersonality(ctx);
    case "chat":
    default: {
      const { sock, msg, remoteJid, switchNotice, plan } = ctx;
      await sock.sendMessage(
        remoteJid,
        { text: switchNotice + (plan.reply || "Finny siap membantu keuangan Anda!") },
        { quoted: msg }
      );
      break;
    }
  }
}
