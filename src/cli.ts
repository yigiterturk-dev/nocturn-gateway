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
import { jevSkorla, layaIstek, layaSaglik, layaSor, layaSkorla, layaSirala, layaGuard, layaSort, maskele, nobetAt, nobetDurum, sirAl } from "./gateway.js";

const YARDIM = `nocturn-gateway — AI Gateway istemcisi (Jev + Laya)

Kullanım:
  nocturn-gateway skor <soru> <aday...>            Jev olasılıkları (0-1, cevapsız aday: null)
  nocturn-gateway laya saglik                      Laya sağlık kontrolü
  nocturn-gateway laya skorla "<soru>" <aday...>   Laya ile adayları skorla (noul, null=cevapsız)
  nocturn-gateway laya sirala "<soru>" <aday...>   Laya skoruna göre sırala
  nocturn-gateway laya sor <state-json> <questions-json>   Jenerik, kendi soruların
  nocturn-gateway laya guard "<prompt>"            Prompt guardrail riski
  nocturn-gateway laya sort <items-json> <question-json>   Sunucu tarafı sıralama
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
      const [yol, ...kalanlar] = kalan;
      if (yol === "health" || yol === "saglik" || yol === "sağlık") return await layaSaglik();
      // jenerik, triyajsız yüzey — soruyu sen kurarsın
      if (yol === "sor") {
        if (kalanlar.length < 2) throw new Error('kullanım: nocturn-gateway laya sor <state-json> <questions-json>');
        return await layaSor(JSON.parse(kalanlar[0]), JSON.parse(kalanlar[1]));
      }
      if (yol === "skorla" || yol === "skor") {
        const [soru, ...adaylar] = kalanlar;
        if (!soru || adaylar.length === 0) throw new Error('kullanım: nocturn-gateway laya skorla "<soru>" <aday...>');
        const skorlar = await layaSkorla(soru, adaylar);
        return { soru, adaylar, skorlar };
      }
      if (yol === "sirala" || yol === "sırala") {
        const [soru, ...adaylar] = kalanlar;
        if (!soru || adaylar.length === 0) throw new Error('kullanım: nocturn-gateway laya sirala "<soru>" <aday...>');
        return { soru, sonuc: await layaSirala(soru, adaylar) };
      }
      if (yol === "guard") {
        if (!kalanlar[0]) throw new Error('kullanım: nocturn-gateway laya guard "<prompt>"');
        return await layaGuard(kalanlar.join(" "));
      }
      if (yol === "sort") {
        if (kalanlar.length < 2) throw new Error("kullanım: nocturn-gateway laya sort <items-json> <question-json>");
        return await layaSort(JSON.parse(kalanlar[0]), JSON.parse(kalanlar[1]));
      }
      // back-compat: ham uçlar (predict/triage/guard/sort) state+questions ile
      if (yol === "predict" || yol === "triage") {
        if (kalanlar.length < 2) throw new Error("state ve questions JSON argümanları şart");
        return await layaIstek(yol, JSON.parse(kalanlar[0]), JSON.parse(kalanlar[1]));
      }
      throw new Error("kullanım: nocturn-gateway laya <health|sor|skorla|sirala|guard|sort|predict|triage>");
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
