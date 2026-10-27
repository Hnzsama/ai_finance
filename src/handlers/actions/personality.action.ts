import { setUserSetting } from "../../prisma/finance.ts";
import type { PersonaType } from "../../services/ai.js";
import type { ActionContext } from "./types.ts";

export async function handleSetPersonality(ctx: ActionContext): Promise<void> {
  const { sock, msg, remoteJid, user, switchNotice, plan, rawText } = ctx;
  try {
    const rawP = `${plan.args.persona || ""} ${rawText}`.toUpperCase();
    let nextPersona: PersonaType = "BESTIE";
    if (rawP.includes("GALAK") || rawP.includes("ISTRI_GALAK") || (rawP.includes("ISTRI") && rawP.includes("GALAK"))) {
      nextPersona = "ISTRI_GALAK";
    } else if (rawP.includes("ISTRI") || rawP.includes("WIFE") || rawP.includes("PASANGAN")) {
      nextPersona = "ISTRI";
    } else if (rawP.includes("SERIUS") || rawP.includes("PRO") || rawP.includes("FORMAL") || rawP.includes("CFP")) {
      nextPersona = "SERIUS";
    } else if (rawP.includes("HEMAT") || rawP.includes("PELIT")) {
      nextPersona = "HEMAT_EKSTREM";
    } else {
      nextPersona = "BESTIE";
    }

    await setUserSetting("persona", nextPersona, user.id);

    let confirmation = "";
    if (nextPersona === "ISTRI_GALAK") {
      confirmation = `Hmph! Mode Istri Galak aktif ya! 😤 Pokoknya mulai sekarang jangan coba-coba jajan aneh-aneh di luar sepengetahuan aku! Kalau mau beli kopi atau belanja yang gak penting, siap-siap aku omelin tiap hari! Duit bulanan jangan lupa disetor ke aku ya Mas! 💅`;
    } else if (nextPersona === "ISTRI") {
      confirmation = `Siap Mas sayang! Mulai sekarang aku bakal jagain catatan keuangan keluarga kita dengan penuh perhatian dan kasih sayang ya ❤️ Kalau Mas mau jajan atau beli sesuatu bilang aku ya!`;
    } else if (nextPersona === "BESTIE") {
      confirmation = `Sip bro! Mode bestie aktif! Lu mau jajan apa aja lapor gue ya cuy, biar kita gak boncos bareng wkwk! 👊`;
    } else if (nextPersona === "SERIUS") {
      confirmation = `Baik. Mode Konsultan Keuangan Profesional (CFP) telah diaktifkan. Saya siap menyajikan data analitis dan membantu evaluasi finansial Anda secara objektif.`;
    } else if (nextPersona === "HEMAT_EKSTREM") {
      confirmation = `Mode Hemat Ekstrem aktif! Lu jangan coba-coba laper mata lagi ya! Tiap rupiah bakal gue tanyain urgensinya! Simpen duit lu! 😤`;
    }

    const finalReply = `${confirmation}\n\n🎭 _Mode aktif sekarang: ${nextPersona}_`;
    await sock.sendMessage(remoteJid, { text: switchNotice + finalReply }, { quoted: msg });
  } catch (err) {
    console.error("[Database] Gagal mengubah kepribadian:", err);
    await sock.sendMessage(remoteJid, { text: "⚠️ Gagal mengubah mode kepribadian." }, { quoted: msg });
  }
}
