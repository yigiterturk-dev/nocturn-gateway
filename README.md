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
import { jevSkorla, layaSaglik } from "nocturn-gateway";

const skorlar = await jevSkorla("bu madde iade hakkını düzenliyor mu?", adayMetinler);
console.log(await layaSaglik()); // { status: "ok", model: "convaiinnovations/laya" }
```

## CLI — her terminalde

```bash
npx nocturn-gateway skor "bu madde iade hakkını düzenliyor mu?" "Madde 12..." "Madde 7..."
npx nocturn-gateway laya health
npx nocturn-gateway nobet durum
npx nocturn-gateway maske "TCKN 12345678901"
npx nocturn-gateway sir legafetch
```

Ortam: `AI_GATEWAY_KEY` (şart), `AI_GATEWAY_URL` (varsayılan https://ai.nocturndev.com).
Çıktı JSON; hata → exit 1 (CI gate olarak kullanılabilir).

## Python

```python
from gateway import jev_skorla, laya_saglik
skorlar = jev_skorla("bu madde iade hakkını düzenliyor mu?", aday_metinler)
print(laya_saglik())
```
