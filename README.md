# nocturn-gateway

AI Gateway istemcisi — **Jev** (LLM skorlama) + **Laya** (karar motoru) tüm
Nocturn projelerine tek kapıdan: `ai.nocturndev.com`.

- Sıfır bağımlılık (TS: fetch, PY: urllib)
- Jev anahtarı istemcide TAŞINMAZ — gateway'de kalır
- Cevapsız aday `0` değil `NaN`/`None` döner (sessiz yanlış bilgi yok)

## TypeScript

```bash
npm i nocturn-gateway
export AI_GATEWAY_KEY=...
```

```ts
import { jevSkorla, layaSaglik, layaSor, layaSkorla, layaSirala } from "nocturn-gateway";

const skorlar = await jevSkorla("bu madde iade hakkını düzenliyor mu?", adayMetinler);
console.log(await layaSaglik()); // { status: "ok", model: "convaiinnovations/laya" }

// Laya: hazır şema/triyaj dayatmaz — soruyu sen kurarsın
const cevap = await layaSor(
  { text: "Ürün 3 gündür açılmıyor" },
  { duygu: { type: "choice", instructions: "Baskın duygu?", criteria: { ofke: "kizgin", notr: "notr" } } },
);
const puanlar = await layaSkorla("Para iadesi talebi mi?", metinler);        // TEK çağrı, hizalı, cevapsız = null
const sirali = await layaSirala("Aciliyet?", metinler);                      // skora göre azalan
```

## CLI — her terminalde

```bash
npx nocturn-gateway skor "bu madde iade hakkını düzenliyor mu?" "Madde 12..." "Madde 7..."
npx nocturn-gateway laya saglik
npx nocturn-gateway laya skorla "Para iadesi talebi mi?" "İade istiyorum" "Kargoya verildi"
npx nocturn-gateway laya sirala "Aciliyet?" "Acil!" "Normal"
npx nocturn-gateway laya sor '{"text":"..."}' '{"q":{"type":"noul","instructions":"..."}}'
npx nocturn-gateway nobet durum
npx nocturn-gateway maske "TCKN 12345678901"
npx nocturn-gateway sir legafetch
```

Ortam: `AI_GATEWAY_KEY` (şart), `AI_GATEWAY_URL` (varsayılan https://ai.nocturndev.com).
Çıktı JSON; hata → exit 1 (CI gate olarak kullanılabilir).

## Python

```python
from gateway import jev_skorla, laya_saglik, laya_sor, laya_skorla, laya_sirala
skorlar = jev_skorla("bu madde iade hakkını düzenliyor mu?", aday_metinler)
print(laya_saglik())
print(laya_skorla("Para iadesi talebi mi?", adaylar))   # cevapsız aday None
print(laya_sor({"text": "..."}, {"duygu": {"type": "noul", "instructions": "..."}}))
```

Python CLI (stdlib, TS ikiziyle aynı komutlar):

```bash
AI_GATEWAY_KEY=... python3 gateway.py laya saglik
AI_GATEWAY_KEY=... python3 gateway.py laya skorla "Para iadesi talebi mi?" "İade istiyorum"
AI_GATEWAY_KEY=... python3 gateway.py skor "soru?" "aday 1" "aday 2"
```
