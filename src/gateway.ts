/**
 * nocturn-gateway — AI Gateway istemcisi (Jev + Laya), sıfır bağımlılık.
 *
 * Kullanım:
 *   import { jevSkorla, layaSkorla, layaSor } from "nocturn-gateway";
 *   const skorlar = await jevSkorla("bu madde soruyu karşılar mı?", adayMetinler);
 *
 * Ortam: AI_GATEWAY_URL (varsayılan https://ai.nocturndev.com) + AI_GATEWAY_KEY.
 * Gateway tarafı: X-Gateway-Key kapısı — anahtar yoksa 401; Jev anahtarı
 * gateway'dedir, istemci TAŞIMAZ.
 */

const BASE = (process.env.AI_GATEWAY_URL ?? "https://ai.nocturndev.com").replace(/\/+$/, "");
const KEY = (process.env.AI_GATEWAY_KEY ?? "").trim();

export interface GatewayAyar {
  baseUrl?: string;
  key?: string;
  timeoutMs?: number;
}

function cfg(a?: GatewayAyar) {
  const key = (a?.key ?? KEY).trim();
  if (!key) throw new Error("AI_GATEWAY_KEY boş — gateway anahtarı yok");
  return {
    base: (a?.baseUrl ?? BASE).replace(/\/+$/, ""),
    key,
    timeout: a?.timeoutMs ?? 30_000,
  };
}

async function istek<T>(yol: string, govde: unknown, a?: GatewayAyar): Promise<T> {
  const { base, key, timeout } = cfg(a);
  const ctl = new AbortController();
  const z = setTimeout(() => ctl.abort(), a?.timeoutMs ?? 30_000);
  try {
    const r = await fetch(`${base}${yol}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Gateway-Key": key },
      body: JSON.stringify(govde),
      signal: ctl.signal,
    });
    if (r.status === 401) throw new Error("Gateway 401 — AI_GATEWAY_KEY eksik/yanlış");
    if (!r.ok) throw new Error(`Gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(z);
  }
}

export interface NoulYanit {
  model?: string;
  answers: Record<string, { type: "noul"; noul: number }>;
  usage?: { input_tokens: number; output_tokens: number };
}

/**
 * Jev: soru + aday metinler → her aday için 0-1 olasılık dizisi.
 * (legafetch/jev_mevzuat.py sözleşmesi — tek çağrıda tüm adaylar.)
 * Jev aritmetik yapmaz: yalnız metin gider; eşik İSTEMCİDEDİR.
 */
export async function jevSkorla(
  soru: string,
  adaylar: string[],
  a?: GatewayAyar & { model?: string; talimat?: string; metinUzunluk?: number },
): Promise<number[]> {
  if (adaylar.length === 0) return [];
  const state: Record<string, unknown> = { soru };
  const questions: Record<string, { type: "noul"; instructions: string }> = {};
  adaylar.forEach((metin, i) => {
    state[`aday_${i}`] = metin.slice(0, a?.metinUzunluk ?? 700);
    questions[`m${i}`] = {
      type: "noul",
      instructions:
        a?.talimat ??
        `aday_${i} alanındaki metin, soru alanındaki soruya DOĞRUDAN cevap oluşturuyor mu? ` +
          `Aynı konuda olması yetmez; sorulan ihtiyacı bu metin karşılamalıdır.`,
    };
  });
  const yanit = await istek<NoulYanit>("/jev/v1/systemone", { model: a?.model ?? "jev-latest", state, questions }, a);
  return adaylar.map((_, i) => {
    const cev = yanit.answers?.[`m${i}`];
    return cev?.type === "noul" && typeof cev.noul === "number"
      ? Math.min(1, Math.max(0, cev.noul))
      : Number.NaN; // cevapsız aday — çağıran karar verir (0 sanma!)
  });
}

export interface LayaKarar {
  [alan: string]: unknown;
}

/** Laya decision service — /predict /triage /guard /sort aynı sözleşme (state+questions). */
export function layaIstek(yol: "predict" | "triage" | "guard" | "sort", state: Record<string, unknown>, questions: Record<string, unknown>, a?: GatewayAyar): Promise<LayaKarar> {
  return istek<LayaKarar>(`/laya/${yol}`, { state, questions }, a);
}

// ——— Jenerik Laya yüzeyi — hazır şema/triyaj dayatmaz; soruyu sen kurarsın ———

/** Laya'nın tek soruya dönebildiği cevap tipleri. */
export type LayaSoruTipi = "noul" | "choice" | "score";

export interface LayaSoru {
  type: LayaSoruTipi;
  instructions: string;
  /** choice için zorunlu: {anahtar: "açıklama"} */
  criteria?: Record<string, string> | string[];
}

/** Tek bir sorunun cevabı — tip'e göre alanlardan biri dolu döner. */
export interface LayaCevap {
  type: LayaSoruTipi | "gate";
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  [alan: string]: unknown;
}

export interface LayaSonuc {
  latency_ms?: number;
  answers: Record<string, LayaCevap>;
  [alan: string]: unknown;
}

/**
 * Jenerik Laya çağrısı: state alanların + vereceğin SORULAR → cevaplar.
 * Eşik/sıralama mantığı buraya gömülmez; ham cevap döner. (predict ucu.)
 */
export async function layaSor(
  state: Record<string, unknown>,
  questions: Record<string, LayaSoru>,
  a?: GatewayAyar,
): Promise<LayaSonuc> {
  return istek<LayaSonuc>("/laya/predict", { state, questions }, a);
}

/**
 * Laya ile skorla: `metin_al` ile state'e yazılan metinleri TEK çağrıda sorar.
 * Dönen dizi input sırasına hizalı; cevapsız/tip uyuşmayan aday `null`.
 * noul → 0-1 skor, score → ham puan, choice → etiket. Eşik KARARI istemcide.
 */
export async function layaSkorla(
  soru: string,
  adaylar: string[],
  a?: GatewayAyar & { metinUzunluk?: number },
): Promise<Array<number | null>> {
  if (adaylar.length === 0) return [];
  const state: Record<string, unknown> = {};
  const questions: Record<string, LayaSoru> = {};
  adaylar.forEach((metin, i) => {
    state[`aday_${i}`] = metin.slice(0, a?.metinUzunluk ?? 700);
    questions[`m${i}`] = {
      type: "noul",
      instructions:
        `aday_${i} alanındaki metin, "${soru}" sorusuna DOĞRUDAN karşılık geliyor mu? ` +
        `Aynı konuda olması yetmez; sorulan şeyi bu metin karşılamalıdır.`,
    };
  });
  const sonuc = await layaSor(state, questions, a);
  return adaylar.map((_, i) => {
    const c = sonuc.answers?.[`m${i}`];
    const deger = c?.noul ?? c?.score;
    return typeof deger === "number" ? deger : null;
  });
}

/** Laya ile sırala: adayları tek kriterle (noul/score) puana göre yeniden dizer. */
export async function layaSirala(
  soru: string,
  adaylar: string[],
  a?: GatewayAyar & { metinUzunluk?: number; azalan?: boolean },
): Promise<Array<{ metin: string; skor: number | null; index: number }>> {
  const skorlar = await layaSkorla(soru, adaylar, a);
  const azalan = a?.azalan ?? true;
  return adaylar
    .map((metin, index) => ({ metin, skor: skorlar[index], index }))
    .sort((x, y) => {
      const sx = x.skor ?? Number.NEGATIVE_INFINITY;
      const sy = y.skor ?? Number.NEGATIVE_INFINITY;
      return azalan ? sy - sx : sx - sy;
    });
}

/**
 * Laya guard: prompt'un güvenli/uygun olup olmadığını noul riskleriyle skorlar.
 * `engelle` eşiği sunucudaki GUARD_THRESHOLD ile verilir (cevapta döner).
 */
export async function layaGuard(prompt: string, a?: GatewayAyar): Promise<LayaSonuc> {
  return istek<LayaSonuc>("/laya/guard", { prompt }, a);
}

/** Laya sort ucu: listeyi verdiğin skor/choice sorusuyla sıralar (sunucu tarafı sıralama). */
export async function layaSort(
  items: Array<{ id?: unknown; text: string }>,
  question: LayaSoru,
  a?: GatewayAyar & { order?: "asc" | "desc" },
): Promise<LayaKarar> {
  return istek<LayaKarar>("/laya/sort", { items, question, order: a?.order ?? "desc" }, a);
}

/** Laya sağlık kontrolü — GET; gateway + tünel + model hepsi ayakta mı? */
export async function layaSaglik(a?: GatewayAyar): Promise<{ status: string; model: string; checkpoint: string }> {
  const { base, key, timeout } = cfg(a);
  const ctl = new AbortController();
  const z = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${base}/laya/health`, { headers: { "X-Gateway-Key": key }, signal: ctl.signal });
    if (!r.ok) throw new Error(`Laya health ${r.status}`);
    return (await r.json()) as { status: string; model: string; checkpoint: string };
  } finally {
    clearTimeout(z);
  }
}

/** Nöbet: kalp atışı gönder (proje dakikada bir çağırır; gelmezse "SESSİZ"). */
export async function nobetAt(proje: string, durum: "iyi" | "bozuk" = "iyi", not = "", a?: GatewayAyar): Promise<{ ok: boolean }> {
  return istek<{ ok: boolean }>("/nobet/beat", { proje, durum, not }, { ...a, timeoutMs: 10_000 });
}

/** Nöbet tablosu: hangi proje canlı, hangisi SESSİZ. */
export async function nobetDurum(a?: GatewayAyar): Promise<{ simdi: number; projeler: Array<{ proje: string; sure_sn: number; durum: string; ses: string; not: string }> }> {
  const { base, key, timeout } = cfg(a);
  const r = await fetch(`${base}/nobet/durum`, { headers: { "X-Gateway-Key": key }, signal: AbortSignal.timeout(timeout) });
  return (await r.json()) as never;
}

/** KVKK maskeleme: metindeki TCKN/IBAN/telefon/e-posta/ad-soyad maskelenir. */
export async function maskele(metin: string, a?: GatewayAyar): Promise<{ masked: string }> {
  return istek<{ masked: string }>("/maske", { metin }, { ...a, timeoutMs: 10_000 });
}

/** Sır kasası: projenin sırlarını gateway'den çek (boot'ta). */
export async function sirAl(proje: string, a?: GatewayAyar): Promise<Record<string, string>> {
  const { base, key, timeout } = cfg(a);
  const r = await fetch(`${base}/sir/${encodeURIComponent(proje)}`, { headers: { "X-Gateway-Key": key }, signal: AbortSignal.timeout(timeout) });
  return (await r.json()) as Record<string, string>;
}
