/**
 * nocturn-gateway CLI — her terminalden Jev/Laya tek kapıdan.
 *
 * Kullanım:
 *   nocturn-gateway skor "soru?" "aday 1" "aday 2"
 *   nocturn-gateway laya health
 *   nocturn-gateway laya predict '{"soru":"..."}' '{"m0":{"type":"noul"}}'
 *   nocturn-gateway nobet beat <proje> [iyi|bozuk] [not]
 *   nocturn-gateway nobet durum
 *   nocturn-gateway maske "metin"
 *   nocturn-gateway sir <proje>
 *
 * Ortam: AI_GATEWAY_KEY (şart), AI_GATEWAY_URL (opsiyonel).
 * Çıktı: JSON. Hata → stderr + exit 1.
 */
import { jevSkorla, layaIstek, layaSaglik, maskele, nobetAt, nobetDurum, sirAl } from "./gateway.js";

const YARDIM = `nocturn-gateway — AI Gateway istemcisi (Jev + Laya)

Kullanım:
  nocturn-gateway skor <soru> <aday...>            Jev olasılıkları (0-1, cevapsız aday: null)
  nocturn-gateway laya health                      Laya sağlık kontrolü
  nocturn-gateway laya <predict|triage|guard|sort> <state-json> <questions-json>
  nocturn-gateway nobet beat <proje> [iyi|bozuk] [not]   Kalp atışı gönder
  nocturn-gateway nobet durum                      Nöbet tablosu
  nocturn-gateway maske <metin>                    TCKN/IBAN/telefon/e-posta maskele
  nocturn-gateway sir <proje>                      Proje sırlarını çek

Ortam: AI_GATEWAY_KEY (şart), AI_GATEWAY_URL (varsayılan https://ai.nocturndev.com)`;

type Cikti = Record<string, unknown>;

async function calistir(args: string[]): Promise<Cikti> {
  const [komut, ...kalan] = args;
  switch (komut) {
    case "skor": {
      const [soru, ...adaylar] = kalan;
      if (!soru || adaylar.length === 0) throw new Error('kullanım: nocturn-gateway skor "<soru>" <aday...>');
      const skorlar = await jevSkorla(soru, adaylar);
      return { soru, adaylar, skorlar };
    }
    case "laya": {
      const [yol, ...jsonlar] = kalan;
      if (yol === "health") return await layaSaglik();
      if (yol !== "predict" && yol !== "triage" && yol !== "guard" && yol !== "sort")
        throw new Error("kullanım: nocturn-gateway laya <health|predict|triage|guard|sort> [state-json] [questions-json]");
      if (jsonlar.length < 2) throw new Error("state ve questions JSON argümanları şart");
      return await layaIstek(yol, JSON.parse(jsonlar[0]), JSON.parse(jsonlar[1]));
    }
    case "nobet": {
      const [alt, proje, durum, not_] = kalan;
      if (alt === "durum") return await nobetDurum();
      if (alt === "beat") {
        if (!proje) throw new Error("kullanım: nocturn-gateway nobet beat <proje> [iyi|bozuk] [not]");
        if (durum && durum !== "iyi" && durum !== "bozuk") throw new Error(`durum "iyi" veya "bozuk" olmalı, gelen: ${durum}`);
        return await nobetAt(proje, (durum ?? "iyi") as "iyi" | "bozuk", not_ ?? "");
      }
      throw new Error("kullanım: nocturn-gateway nobet <beat|durum>");
    }
    case "maske": {
      if (!kalan[0]) throw new Error('kullanım: nocturn-gateway maske "<metin>"');
      return await maskele(kalan.join(" "));
    }
    case "sir": {
      if (!kalan[0]) throw new Error("kullanım: nocturn-gateway sir <proje>");
      return await sirAl(kalan[0]);
    }
    default:
      throw new Error(YARDIM);
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.log(YARDIM);
  process.exit(0);
}

try {
  console.log(JSON.stringify(await calistir(args), null, 2));
} catch (e) {
  console.error(`HATA: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
