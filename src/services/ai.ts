import "../env.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { parseFinancialMessage, type ParseResult, type TransactionData } from "../handlers/parser.js";
import { formatIDR } from "../prisma/finance/types.ts";

export type { ParseResult as AIResponse, TransactionData as ExtractedData };

export type PersonaType = "BESTIE" | "ISTRI" | "ISTRI_GALAK" | "SERIUS" | "HEMAT_EKSTREM";

export interface AgentCall {
  function:
    | "reset_transactions"
    | "set_wallet_balance"
    | "record_transaction"
    | "query_transactions"
    | "list_wallets"
    | "get_summary"
    | "get_recent_transactions"
    | "delete_last_transaction"
    | "transfer_balance"
    | "set_budget"
    | "get_budgets"
    | "manage_debt"
    | "manage_assets"
    | "manage_subscriptions"
    | "set_personality"
    | "connect_sheet"
    | "sync_sheet"
    | "sync_notion"
    | "web_dashboard"
    | "chat";
  args: Record<string, any>;
  reply: string;
}

import path from "node:path";
import { fileURLToPath } from "node:url";

const PERSONA_FILE_MAP: Record<PersonaType, string> = {
  ISTRI_GALAK: "istri_galak.md",
  ISTRI: "istri.md",
  BESTIE: "bestie.md",
  SERIUS: "serius.md",
  HEMAT_EKSTREM: "hemat_ekstrem.md",
};

/**
 * Muat instruksi kepribadian dinamis dari file Markdown masing-masing
 */
export function loadPersonaPrompt(persona: PersonaType): string {
  const fileName = PERSONA_FILE_MAP[persona] || "bestie.md";
  const candidatePaths = [
    fileURLToPath(new URL(`../prompts/personas/${fileName}`, import.meta.url)),
    path.resolve(process.cwd(), "src", "prompts", "personas", fileName),
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8").trim();
      }
    } catch {}
  }

  return "Kamu adalah asisten keuangan pribadi cerdas dan asik via WhatsApp.";
}

export function buildSystemPrompt(
  persona: PersonaType = "BESTIE",
  lastTxContext?: string,
  userName?: string
): string {
  const personaStyle = loadPersonaPrompt(persona);
  const name = userName ? userName.trim() : "Luqman";

  let addressRule = "";
  if (persona === "ISTRI" || persona === "ISTRI_GALAK") {
    addressRule = `ATURAN PANGGILAN NAMA (SANGAT WAJIB):
- Nama pengguna adalah "${name}".
- Karena kamu berperan sebagai Istri, WAJIB memanggil pengguna dengan sebutan "Mas" atau "Mas ${name}" (contoh: "Mas", "Mas ${name}", "Mas sayang").
- DILARANG memanggil hanya dengan nama tanpa kata "Mas"!`;
  } else if (persona === "SERIUS") {
    addressRule = `ATURAN PANGGILAN NAMA (SANGAT WAJIB):
- Nama pengguna adalah "${name}".
- Sebagai konsultan keuangan profesional CFP, panggil pengguna secara santun dan profesional dengan "Pak ${name}", "Bapak ${name}", atau "${name}".`;
  } else if (persona === "BESTIE") {
    addressRule = `ATURAN PANGGILAN NAMA (SANGAT WAJIB):
- Nama pengguna adalah "${name}".
- Panggil dengan gaya santai seperti "${name}", "bro", atau "cuy" (contoh: "${name}", "bro ${name}", "cuy").`;
  } else if (persona === "HEMAT_EKSTREM") {
    addressRule = `ATURAN PANGGILAN NAMA (SANGAT WAJIB):
- Nama pengguna adalah "${name}".
- Panggil pengguna dengan "${name}" atau "woy ${name}" dengan nada pelit dan tegas soal uang!`;
  } else {
    addressRule = `ATURAN PANGGILAN NAMA:
- Nama pengguna adalah "${name}".`;
  }

  let memoryContext = "";
  if (lastTxContext) {
    memoryContext = `
INGATAN AKTIVITAS TERAKHIR (SANGAT PENTING):
Pengguna baru saja mencatat transaksi sebelumnya: "${lastTxContext}".
Jika pesan pengguna sekarang adalah transaksi yang SAMA atau mirip dengan yang barusan dicatat (misal barusan beli es teh, lalu kirim beli es teh lagi):
- DILARANG mengulang respon lama!
- Tunjukkan keherananmu secara spontan: tegur atau tanyakan kenapa beli barang yang sama lagi berurutan (apakah haus banget, lapar banget, maruk, atau kepencet kirim dua kali).
`;
  }

  return `
Kamu adalah asisten keuangan pribadi cerdas via WhatsApp dengan kepribadian yang hidup, realistis, dan berakal sehat.

${personaStyle}
${memoryContext}
${addressRule}

PRINSIP BAHASA & RESPON WAJIB:
1. PADA PROPERTI 'reply': Jadilah lawan bicara yang cerdas, spontan, dan VARIATIF. DILARANG menggunakan kalimat atau pola yang sama berulang kali!
2. Jika pengguna membeli jajan murah/receh saat istirahat kerja (es teh 3k, gorengan 5k): Tanggapi wajar atau ledek santai karena tumben hemat.
3. JIKA MEMBELI RECEHAN PAKAI BANK/BCA/QRIS (misal: "es teh 3k bca"): Cukup ledek kenapa uang recehan 3 ribu perak doang repot-repot pake transfer BCA segala, bukannya pake uang cash receh di saku! Saldo BCA sudah langsung terpotong.
4. DILARANG KERAS menggunakan frasa aneh, imbuhan rusak (seperti "jangan-khan"), atau terjemahan kaku.
5. Kembalikan HANYA format JSON valid tanpa format markdown.

TUGASMU:
Menganalisa pesan natural pengguna secara dinamis dan GENERATIVE memilih fungsi/tool yang harus dipanggil beserta parameternya.

DAFTAR TOOLS YANG BISA DIPANGGIL (FUNCTION CATALOG):
1. "reset_transactions"
   - Panggil saat: Pengguna ingin mereset/menghapus semua riwayat transaksi untuk mulai dari awal/nol (cth: "bisa reset gak", "hapus semua transaksi", "mau setting dari awal list uang uangku").
   - args: { "confirm": true }

2. "set_wallet_balance"
   - Panggil saat: Mengatur/memperbarui saldo dompet atau akun (cth: "saldo awal bca 5jt", "cash ada 500rb", "isi saldo awal gopay 100k", "masukan shopeepay minus 52.652", "saldo shopeepay minus 50rb").
   - PENTING: Untuk driver online (ShopeeFood, Grab, Gojek), saldo dompet BISA bernilai MINUS/negatif! (contoh: "minus 52.652" -> args: { "wallet": "ShopeePay", "amount": -52652 }).
   - JANGAN panggil ini jika pengguna menerima gaji atau uang masuk normal!
   - args: { "wallet": string, "amount": number }

3. "record_transaction"
   - Panggil saat: Pengguna mencatat uang keluar (jajan, makan, bensin, vape, rokok) ATAU uang masuk (gaji, gajian, bonus, cuan).
   - Pastikan nominal adalah angka murni (3k -> 3000, 20k -> 20000, 150rb -> 150000, 6jt -> 6000000).
   - args: { "type": "EXPENSE" | "INCOME", "amount": number, "description": string, "wallet": string | null, "category": string | null }

4. "query_transactions"
   - Panggil saat: Pengguna mencari transaksi spesifik dengan filter dinamis, mengecek total barang tertentu, atau memfilter berdasarkan nominal/dompet/kata kunci (cth: "total beli kopi berapa?", "pengeluaran di atas 50rb apa aja?", "uang keluar dari bca berapa?", "cari jajan indomaret").
   - args: { "keyword": string | null, "wallet": string | null, "category": string | null, "minAmount": number | null, "type": "INCOME" | "EXPENSE" | null }

5. "list_wallets"
   - Panggil saat: Pengguna ingin melihat daftar dompet, akun rekening, dan saldonya (cth: "dompet saya apa aja", "cek rekening", "saldo dompet").
   - args: {}

6. "get_summary"
   - Panggil saat: Pengguna ingin rekapitulasi, ringkasan, atau evaluasi pengeluaran (cth: "rekap pengeluaran", "rekap bulan ini", "laporan").
   - args: {}

7. "get_recent_transactions"
   - Panggil saat: Pengguna ingin melihat riwayat transaksi terakhir secara umum (cth: "riwayat", "transaksi terakhir", "tadi beli apa").
   - args: { "limit": number }

8. "delete_last_transaction"
   - Panggil saat: Pengguna ingin membatalkan/menghapus 1 transaksi terakhir (cth: "hapus transaksi tadi", "salah catat hapus dong").
   - args: {}

9. "set_personality"
   - Panggil saat: Pengguna ingin mengubah kepribadian / mode asisten (cth: "ubah mode ke bestie", "mode istri dong", "mode istri galak", "mode santai", "mode serius", "mode hemat galak").
   - args: { "persona": "BESTIE" | "ISTRI" | "ISTRI_GALAK" | "SERIUS" | "HEMAT_EKSTREM" }

10. "connect_sheet"
   - Panggil saat: Pengguna mengirimkan link Google Spreadsheet atau meminta menghubungkan spreadsheet (cth: "hubungkan sheet https://...", "sambungin ke spreadsheet ini https://docs.google.com/spreadsheets/d/...", "connect sheet").
   - args: { "url": string }

11. "sync_sheet"
   - Panggil saat: Pengguna meminta menyinkronkan data atau cek status Google Sheet (cth: "sync sheet", "sinkronkan data ke sheet", "update sheet").
   - args: {}

12. "sync_notion"
   - Panggil saat: Pengguna meminta visualisasi di Notion, sinkronisasi ke Notion, atau minta link dashboard Notion (cth: "notion", "sync notion", "link notion", "dashboard notion", "lihat di notion", "buka notion").
   - args: {}

13. "manage_assets"
   - Panggil saat: Pengguna mencatat atau melihat aset / harta kekayaan / barang berharga (bukan transaksi pengeluaran/pemasukan rutin dompet) (cth: "tambahkan aset emas 4 gram estimasi pergramnya 2.400.000", "tambah aset motor beat 12jt", "daftar aset", "aset saya apa aja").
   - PENTING: Jika ada jumlah satuan/gram dan harga per satuan (misal: 4 gram x 2.400.000): HITUNG TOTAL NILAINYA SECARA AKURAT (4 * 2.400.000 = 9.600.000)!
   - args: { "action": "RECORD" | "LIST" | "CLEAR", "name": string, "value": number, "category": "VEHICLE" | "ELECTRONIC" | "FINANCIAL" | "OTHER" }

14. "manage_debt"
   - Panggil saat: Mencatat hutang atau piutang (cth: "catat hutang ke budi 50rb", "si tono ada piutang 100k", "daftar hutang").
   - args: { "action": "RECORD" | "LIST" | "CLEAR", "type": "DEBT" | "RECEIVABLE", "personName": string, "amount": number, "notes": string | null }

15. "set_budget"
   - Panggil saat: Mengatur batas/target anggaran kategori bulanan (cth: "budget makan 1jt sebulan", "anggaran bensin 200rb", "daftar budget").
   - args: { "action": "SET" | "LIST" | "CLEAR", "category": string, "amount": number }

16. "manage_subscriptions"
   - Panggil saat: Mencatat langganan rutin berulang (cth: "langganan netflix 186k tgl 15", "daftar langganan").
   - args: { "action": "RECORD" | "LIST" | "CLEAR", "name": string, "amount": number, "billingDay": number | null }

17. "chat"
   - Panggil saat: Obrolan santai, konsultasi keuangan, sapaan, tanya tips (cth: "halo", "boros gak saya?", "saran hemat kopi dong").
   - args: {}

FORMAT OUTPUT WAJIB JSON VALID (HANYA JSON MURNI TANPA MARKDOWN):
{
  "function": "reset_transactions" | "set_wallet_balance" | "record_transaction" | "query_transactions" | "list_wallets" | "get_summary" | "get_recent_transactions" | "delete_last_transaction" | "set_personality" | "connect_sheet" | "sync_sheet" | "sync_notion" | "manage_assets" | "manage_debt" | "set_budget" | "manage_subscriptions" | "chat",
  "args": { ... },
  "reply": "Pesan balasan yang sesuai dengan kepribadian yang aktif"
}
`;
}

export class AiService {
  public get host(): string {
    return this.resolveHost();
  }

  public get model(): string {
    const envModel = process.env.OLLAMA_MODEL;
    return envModel && envModel !== "finance-agent" ? envModel : "qwen2.5:3b";
  }

  public get timeoutMs(): number {
    return Number(process.env.OLLAMA_TIMEOUT) || 90000;
  }

  // Deteksi IP gateway Windows dari WSL secara otomatis jika OLLAMA_HOST tidak didefinisikan
  private resolveHost(): string {
    if (process.env.OLLAMA_HOST && process.env.OLLAMA_HOST.trim()) {
      return process.env.OLLAMA_HOST.trim().replace(/\/+$/, "");
    }
    try {
      const winIp = execSync("ip route show default | awk '{print $3}'", { encoding: "utf8" }).trim();
      if (winIp) return `http://${winIp}:11434`;
    } catch {}
    try {
      const resolv = fs.readFileSync("/etc/resolv.conf", "utf8");
      const match = resolv.match(/nameserver\s+([^\s]+)/);
      if (match && match[1] && match[1] !== "127.0.0.1") {
        return `http://${match[1]}:11434`;
      }
    } catch {}
    return "http://localhost:11434";
  }

  /**
   * Pre-load model Ollama ke RAM di background saat bot start agar pesan pertama tidak mengalami cold-start lag
   */
  public async warmup(): Promise<void> {
    try {
      console.log(`[AI Service] Pre-loading model ${this.model} ke RAM...`);
      const res = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: "ping",
          keep_alive: "24h",
          options: {
            num_predict: 1,
            num_ctx: 2048,
          },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        console.log(`✅ [AI Service] Model ${this.model} siap di RAM.`);
      }
    } catch {
      // Tidak apa jika warmup timeout atau gagal di awal
    }
  }

  /**
   * Generative tool calling via Ollama Qwen 2.5 dengan fallback otomatis ke parser lokal
   */
  async planAndAct(
    userText: string,
    persona: PersonaType = "BESTIE",
    lastTxContext?: string,
    userName?: string
  ): Promise<AgentCall> {
    try {
      const systemPrompt = buildSystemPrompt(persona, lastTxContext, userName);
      const res = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          system: systemPrompt,
          prompt: userText,
          format: "json",
          stream: false,
          keep_alive: "24h",
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_ctx: 2048,
            num_predict: 300,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as { response: string };
      const parsed = JSON.parse(json.response) as AgentCall;

      if (parsed && typeof parsed.function === "string") {
        const local = parseFinancialMessage(userText);

        // Jika pesan mengindikasikan gaji/gajian/bonus, pastikan dipetakan ke record_transaction INCOME
        const lower = userText.toLowerCase();
        // Jika saldo dompet diatur ke minus (driver ShopeeFood / Gojek), pastikan nominal bertanda negatif
        if (parsed.function === "set_wallet_balance") {
          if (lower.includes("minus") || lower.includes("-")) {
            parsed.args.amount = -Math.abs(Number(parsed.args.amount) || local.data?.amount || 0);
          }
        }

        // Jika local parser mengenali intent SET_WALLET_BALANCE (misal: "cash 32 ribu, shopeepay -52.652")
        // cegah AI salah mengklasifikasikan sebagai record_transaction INCOME
        if (local.action === "SET_WALLET_BALANCE") {
          parsed.function = "set_wallet_balance";
          parsed.args.wallet = local.data?.wallet || parsed.args.wallet || "ShopeePay";
          parsed.args.amount = local.data?.amount ?? parsed.args.amount;
          if (local.data?.actionPayload?.items) {
            parsed.args.items = local.data.actionPayload.items;
          }
        }

        // Jika local parser mengenali intent TRANSFER_BALANCE (misal: "tuker shopeepay ke cash 10000 cod shopee driver")
        // cegah AI salah mengklasifikasikannya sebagai set_wallet_balance atau record_transaction!
        if (local.action === "TRANSFER_BALANCE") {
          parsed.function = "transfer_balance";
          parsed.args.fromWallet = local.data?.fromWallet || parsed.args.fromWallet || "ShopeePay";
          parsed.args.toWallet = local.data?.toWallet || parsed.args.toWallet || "Cash";
          parsed.args.amount = local.data?.amount ?? (Number(parsed.args.amount) || 0);
          parsed.args.isCod = local.data?.isCod ?? Boolean(parsed.args.isCod);
        }

        // Proteksi System Commands agar AI tidak pernah berhalusinasi mengembalikan tipe "chat"
        if (local.action === "RESET_TRANSACTIONS") {
          parsed.function = "reset_transactions";
          parsed.args = { confirm: true };
        } else if (local.action === "DELETE_LAST_TRANSACTION") {
          parsed.function = "delete_last_transaction";
          parsed.args = {};
        } else if (local.action === "SYNC_SHEET") {
          parsed.function = "sync_sheet";
          parsed.args = {};
        } else if (local.action === "SYNC_NOTION") {
          parsed.function = "sync_notion";
          parsed.args = {};
        }

        // Jika local parser mengenali aksi CLEAR spesifik modul (Aset, Hutang, Budget, Langganan), jangan biarkan AI keliru reset transaksi!
        if (local.data?.actionPayload?.action === "CLEAR") {
          if (local.action === "MANAGE_ASSETS") {
            parsed.function = "manage_assets";
            parsed.args = { action: "CLEAR" };
          } else if (local.action === "MANAGE_DEBT") {
            parsed.function = "manage_debt";
            parsed.args = { action: "CLEAR" };
          } else if (local.action === "SET_BUDGET") {
            parsed.function = "set_budget";
            parsed.args = { action: "CLEAR" };
          } else if (local.action === "MANAGE_SUBSCRIPTIONS") {
            parsed.function = "manage_subscriptions";
            parsed.args = { action: "CLEAR" };
          }
        }

        // Jika local parser mengenali intent MANAGE_ASSETS (misal: "tambahkan aset baru emas 4 gram estimasi pergramnya 2.400.000")
        // JANGAN BIARKAN AI KELIRU MENJADIKANNYA record_transaction!
        if (local.action === "MANAGE_ASSETS") {
          parsed.function = "manage_assets";
          parsed.args = {
            action: local.data?.actionPayload?.action || "RECORD",
            name: local.data?.actionPayload?.name || parsed.args.name || "Aset Pribadi",
            value: local.data?.amount ?? (Number(parsed.args.value) || 0),
            category: local.data?.actionPayload?.category || parsed.args.category || "OTHER",
          };
          if (local.data?.amount && local.data?.actionPayload?.action !== "CLEAR") {
            const cleanVal = formatIDR(local.data.amount);
            parsed.reply = `Siap, aset *${parsed.args.name}* dengan estimasi nilai *${cleanVal}* berhasil didaftarkan ke inventaris aset Anda!`;
          }
        }

        // Jangan biarkan AI keliru menjadikan MANAGE_DEBT, SET_BUDGET, MANAGE_SUBSCRIPTIONS sebagai transaksi rutin dompet
        if (local.action === "MANAGE_DEBT" && local.data?.actionPayload?.action !== "CLEAR") {
          parsed.function = "manage_debt";
          parsed.args = {
            action: local.data?.actionPayload?.action || "RECORD",
            type: local.data?.actionPayload?.type || "DEBT",
            personName: local.data?.actionPayload?.personName || parsed.args.personName || "Orang Lain",
            amount: local.data?.amount ?? (Number(parsed.args.amount) || 0),
            notes: local.data?.actionPayload?.notes || null,
          };
        }

        if (local.action === "SET_BUDGET" && local.data?.actionPayload?.action !== "CLEAR") {
          parsed.function = "set_budget";
          parsed.args = {
            action: local.data?.actionPayload?.action || "SET",
            category: local.data?.category || "Lainnya",
            amount: local.data?.amount ?? (Number(parsed.args.amount) || 0),
          };
        }

        if (local.action === "MANAGE_SUBSCRIPTIONS" && local.data?.actionPayload?.action !== "CLEAR") {
          parsed.function = "manage_subscriptions";
          parsed.args = {
            action: local.data?.actionPayload?.action || "RECORD",
            name: local.data?.description || "Langganan",
            amount: local.data?.amount ?? (Number(parsed.args.amount) || 0),
            billingDay: local.data?.actionPayload?.billingDay || null,
          };
        }

        // Jika pesan mengindikasikan gaji/gajian/bonus, pastikan dipetakan ke record_transaction INCOME
        if ((lower.includes("gaji") || lower.includes("gajian") || lower.includes("bonus")) && parsed.function === "set_wallet_balance") {
          parsed.function = "record_transaction";
          parsed.args.type = "INCOME";
          parsed.args.description = userText;
        }

        // Rekonsiliasi nominal dari regex lokal jika model 3B salah skala (misal 20 bukannya 20000)
        if (parsed.function === "record_transaction" && local.data?.amount) {
          if (!parsed.args.amount || parsed.args.amount < 1000 || parsed.args.amount !== local.data.amount) {
            parsed.args.amount = local.data.amount;
          }
          if (local.data.wallet && (!parsed.args.wallet || parsed.args.wallet === "null")) {
            parsed.args.wallet = local.data.wallet;
          }
          if (local.data.type) {
            parsed.args.type = local.data.type;
          }
        }

        let cleanReply = (parsed.reply || "").trim();
        cleanReply = cleanReply.replace(/(jangan lupa|jangan ketinggalan|kapan)?\s*bayar\s*(bca|bca-nya|bcan-ya)[^.!?]*[.!?]?/gi, "").trim();

        return {
          function: parsed.function,
          args: parsed.args || {},
          reply: cleanReply || "Sudah dicatat ya!",
        };
      }
      throw new Error("Invalid Agent JSON response format");
    } catch (err) {
      console.warn(`[AI Service] Ollama timeout / error on ${this.host} (${this.model}), fallback to parser:`, err);
      // Fallback cerdas ke parser lokal
      const fallback = parseFinancialMessage(userText);
      return this.mapFallbackToAgentCall(fallback, userText, persona, lastTxContext);
    }
  }

  // Backward compatibility wrapper
  async parseMessage(userText: string): Promise<ParseResult> {
    const planned = await this.planAndAct(userText);
    return {
      action: this.mapFunctionToAction(planned.function),
      data: planned.function === "record_transaction" ? (planned.args as any) : null,
      reply_message: planned.reply,
    };
  }

  private mapFallbackToAgentCall(
    p: ParseResult,
    rawText: string,
    persona: PersonaType = "BESTIE",
    lastTxContext?: string
  ): AgentCall {
    switch (p.action) {
      case "RESET_TRANSACTIONS": {
        let reply = "Riwayat transaksi Anda telah berhasil dikosongkan.";
        if (persona === "ISTRI_GALAK") {
          reply = "Hih! Kenapa direset segala sih Mas?! Mau ngilangin bukti boncos kamu ya?! Mau nyembunyiin pengeluaran apa dari aku hah?! 😠 Ya udah sekarang bersih Rp 0, awas kalau aneh-aneh!";
        } else if (persona === "ISTRI") {
          reply = "Udah aku bersihin ya Mas catatannya. Sekarang kita mulai nabung bareng dari awal lagi ya sayang ❤️";
        } else if (persona === "BESTIE") {
          reply = "Buset di-reset wkwk! Mau tobat apa ngilangin jejak boncos lu bro? 😂 Yaudah bersih Rp 0, mulai dari nol dah!";
        }
        return { function: "reset_transactions", args: { confirm: true }, reply };
      }
      case "RECORD_TRANSACTION": {
        let reply = p.reply_message;
        const isExpense = p.data?.type === "EXPENSE";
        const amount = p.data?.amount || 0;
        const desc = (p.data?.description || rawText).toLowerCase();

        if (persona === "ISTRI_GALAK") {
          if (!isExpense) {
            reply = "Alhamdulillah ada rezeki masuk! Sini sebagian setor ke aku buat uang belanja sama tabungan Mas! 💅";
          } else if (lastTxContext && (desc.includes("teh") || desc.includes("kopi") || lastTxContext.toLowerCase().includes(desc))) {
            reply = `Loh Mas, kan barusan udah beli ${lastTxContext}, kok beli lagi berturut-turut? Haus banget apa kepencet dobel kirim chatnya?! 🤨`;
          } else if ((rawText.toLowerCase().includes("bca") || rawText.toLowerCase().includes("transfer") || rawText.toLowerCase().includes("qris")) && amount <= 10000) {
            reply = "Buset Mas, jajan recehan doang pake transfer BCA segala?! Gak pegang uang koin atau cash apa di kantong kamu?! Ribet amat! 🙄";
          } else if (amount <= 10000 || desc.includes("es teh") || desc.includes("gorengan") || desc.includes("parkir")) {
            reply = "Tumben jajan receh hemat Mas. Ya udah diminum/dimakan yang seger biar semangat kerjanya di kantor!";
          } else if (desc.includes("rokok") || desc.includes("vape") || amount >= 100000) {
            reply = "Kamu ya! Duit mepet malah bakar uang buat barang gak guna/racun! Awas ya kalau uang bulanan sampai kurang! 😤";
          } else {
            reply = "Udah aku catat ya Mas! Inget rem pengeluarannya, jangan foya-foya terus!";
          }
        } else if (persona === "BESTIE") {
          if (!isExpense) {
            reply = "Anjay gajian/cuan cair! Tagih traktiran kopi lah ini mah bro! 🤑";
          } else if (lastTxContext && desc.includes("teh")) {
            reply = "Lah buset, kembung lu bro? Tadi kan baru aja beli es teh, masa nambah lagi wkwk!";
          } else if (amount <= 10000) {
            reply = "Jajan receh mantap bro, hemat pangkal kaya dah!";
          } else {
            reply = "Sip udah dicatat cuy! Jangan boros-boros amat ya!";
          }
        }
        return { function: "record_transaction", args: p.data || {}, reply };
      }
      case "LIST_WALLETS": {
        let reply = "Berikut daftar akun keuangan Anda:";
        if (persona === "ISTRI_GALAK") {
          reply = "Nih liat dompet kamu! Kering kerontang begini masih sok-sokan mau hedon! Makanya cari duit yang rajin Mas, jangan ngelamun mulu! 😒";
        } else if (persona === "ISTRI") {
          reply = "Ini catatan dompet Mas ya, yuk pelan-pelan kita tabung bareng-bareng ❤️";
        } else if (persona === "BESTIE") {
          reply = "Nih isi dompet lu bro! Masih aman apa udah sekarat nih wkwk? 😂";
        }
        return { function: "list_wallets", args: {}, reply };
      }
      case "QUERY_SUMMARY": {
        let reply = "Berikut ringkasan keuangan Anda:";
        if (persona === "ISTRI_GALAK") {
          reply = "Nih rekap pengeluaran kamu Mas! Liat tuh angka-angkanya, pusing gak kepala kamu liatnya?! 😤";
        } else if (persona === "ISTRI") {
          reply = "Ini rekap keuangan keluarga kita ya Mas sayang. Semoga berkah ya ❤️";
        } else if (persona === "BESTIE") {
          reply = "Nih rekap cashflow lu bro! Liat noh kemana aja duit lu ngacir wkwk! 📊";
        }
        return { function: "get_summary", args: {}, reply };
      }
      case "RECENT_TRANSACTIONS":
        return { function: "get_recent_transactions", args: { limit: 5 }, reply: p.reply_message };
      case "DELETE_LAST_TRANSACTION":
        return { function: "delete_last_transaction", args: {}, reply: "Membatalkan transaksi terakhir..." };
      case "SET_PERSONALITY":
        return {
          function: "set_personality",
          args: { persona: p.data?.description || "BESTIE" },
          reply: p.reply_message,
        };
      case "SET_WALLET_BALANCE": {
        let reply = p.reply_message;
        const amount = p.data?.amount || 0;
        if (persona === "ISTRI_GALAK") {
          reply = amount < 0
            ? "Saldo ShopeePay kamu minus Mas?! Astaga, jangan lupa ditutup itu minusnya kalau udah dapat orderan cash ya! 😤"
            : "Udah aku set ya saldo dompet kamu Mas! Jangan boros-boros!";
        } else if (persona === "BESTIE") {
          reply = amount < 0
            ? "Sip bro, saldo minus driver udah diset! Semangat narik ShopeeFood-nya biar minusnya ketutup cuan! 🛵💨"
            : "Sip bro, saldo dompet udah diupdate!";
        }
        return {
          function: "set_wallet_balance",
          args: {
            wallet: p.data?.wallet || "ShopeePay",
            amount,
            items: p.data?.actionPayload?.items,
          },
          reply,
        };
      }
      case "TRANSFER_BALANCE":
        return {
          function: "transfer_balance",
          args: {
            fromWallet: p.data?.fromWallet || "ShopeePay",
            toWallet: p.data?.toWallet || "Cash",
            amount: p.data?.amount || 0,
            isCod: Boolean(p.data?.isCod),
            notes: p.data?.description,
          },
          reply: p.reply_message,
        };
      case "SET_BUDGET":
        return {
          function: "set_budget",
          args: p.data?.actionPayload || { category: p.data?.category, amount: p.data?.amount },
          reply: p.reply_message,
        };
      case "GET_BUDGETS":
        return { function: "get_budgets", args: {}, reply: p.reply_message };
      case "MANAGE_DEBT":
        return {
          function: "manage_debt",
          args: p.data?.actionPayload || { action: "LIST" },
          reply: p.reply_message,
        };
      case "MANAGE_ASSETS":
        return {
          function: "manage_assets",
          args: p.data?.actionPayload || { action: "LIST" },
          reply: p.reply_message,
        };
      case "MANAGE_SUBSCRIPTIONS":
        return {
          function: "manage_subscriptions",
          args: p.data?.actionPayload || { action: "LIST" },
          reply: p.reply_message,
        };
      case "SYNC_SHEET":
        return {
          function: "sync_sheet",
          args: {},
          reply: p.reply_message,
        };
      case "SYNC_NOTION":
        return {
          function: "sync_notion",
          args: {},
          reply: p.reply_message,
        };
      case "WEB_DASHBOARD":
        return { function: "chat", args: {}, reply: p.reply_message };
      case "HELP":
        return { function: "chat", args: {}, reply: p.reply_message };
      default:
        return { function: "chat", args: {}, reply: "Halo! Finny siap membantu pencatatan keuangan Anda." };
    }
  }

  private mapFunctionToAction(fn: string): any {
    switch (fn) {
      case "reset_transactions": return "RESET_TRANSACTIONS";
      case "set_wallet_balance": return "SET_WALLET_BALANCE";
      case "transfer_balance": return "TRANSFER_BALANCE";
      case "set_budget": return "SET_BUDGET";
      case "get_budgets": return "GET_BUDGETS";
      case "manage_debt": return "MANAGE_DEBT";
      case "manage_assets": return "MANAGE_ASSETS";
      case "manage_subscriptions": return "MANAGE_SUBSCRIPTIONS";
      case "record_transaction": return "RECORD_TRANSACTION";
      case "list_wallets": return "LIST_WALLETS";
      case "get_summary": return "QUERY_SUMMARY";
      case "get_recent_transactions": return "RECENT_TRANSACTIONS";
      case "delete_last_transaction": return "DELETE_LAST_TRANSACTION";
      case "sync_sheet": return "SYNC_SHEET";
      case "sync_notion": return "SYNC_NOTION";
      case "chat": return "CHAT";
      default: return "UNKNOWN";
    }
  }
}

export const aiService = new AiService();

