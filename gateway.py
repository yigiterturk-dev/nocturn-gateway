"""
nocturn-gateway — AI Gateway istemcisi (Jev + Laya), Python ikizi. Stdlib only.

Kullanım (Flask/vs):
    from gateway import jev_skorla, laya_istek
    skorlar = jev_skorla("bu madde soruyu karşılar mı?", aday_metinler)

Ortam: AI_GATEWAY_URL (varsayılan https://ai.nocturndev.com) + AI_GATEWAY_KEY.
"""
import json
import os
import urllib.error
import urllib.request

JEV_MODEL = "jev-latest"


def _cfg():
    base = (os.environ.get("AI_GATEWAY_URL") or "https://ai.nocturndev.com").rstrip("/")
    key = (os.environ.get("AI_GATEWAY_KEY") or "").strip()
    if not key:
        raise RuntimeError("AI_GATEWAY_KEY boş — gateway anahtarı yok")
    return base, key


def _istek(yol: str, govde: dict, timeout: int = 30) -> dict:
    base, key = _cfg()
    req = urllib.request.Request(
        f"{base}{yol}",
        data=json.dumps(govde).encode(),
        headers={"Content-Type": "application/json", "X-Gateway-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Gateway 401 — AI_GATEWAY_KEY eksik/yanlış") from e
        raise


def jev_skorla(soru: str, adaylar: list, talimat: str | None = None, metin_uzunluk: int = 700) -> list:
    """Jev: soru + aday metinler → 0-1 olasılık dizisi (cevapsız aday = None)."""
    if not adaylar:
        return []
    state = {"soru": soru}
    questions = {}
    for i, metin in enumerate(adaylar):
        state[f"aday_{i}"] = str(metin)[:metin_uzunluk]
        questions[f"m{i}"] = {
            "type": "noul",
            "instructions": talimat or (
                f"aday_{i} alanındaki metin, soru alanındaki soruya DOĞRUDAN cevap "
                "oluşturuyor mu? Aynı konuda olması yetmez."
            ),
        }
    yanit = _istek("/jev/v1/systemone", {"model": JEV_MODEL, "state": state, "questions": questions})
    cikti = []
    for i in range(len(adaylar)):
        a = (yanit.get("answers") or {}).get(f"m{i}") or {}
        cikti.append(float(a["noul"]) if a.get("type") == "noul" and isinstance(a.get("noul"), (int, float)) else None)
    return cikti


def laya_istek(yol: str, state: dict, questions: dict, timeout: int = 30) -> dict:
    """Laya decision service: predict / triage / guard / sort."""
    return _istek(f"/laya/{yol}", {"state": state, "questions": questions}, timeout)


def laya_saglik(timeout: int = 15) -> dict:
    import urllib.request
    base, key = _cfg()
    req = urllib.request.Request(f"{base}/laya/health", headers={"X-Gateway-Key": key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# ——— Jenerik Laya yüzeyi — hazır şema/triyaj dayatmaz; soruyu sen kurarsın ———


def laya_sor(state: dict, questions: dict, timeout: int = 30) -> dict:
    """Jenerik Laya çağrısı (predict ucu): state + questions → answers. Ham cevap döner."""
    return laya_istek("predict", state, questions, timeout)


def laya_skorla(soru: str, adaylar: list, metin_uzunluk: int = 700, timeout: int = 30) -> list:
    """Her adayı AYRI çağrıda noul ile skorla. Dizi input sırasına hizalı; cevapsız aday None.

    Laya modeli tek çağrıda çok `state` alanını güvenilir bağlayamıyor; sunucunun
    kendi /sort ucu da kayıt başına tek çağrı yapar. Aynı yöntem.
    """
    if not adaylar:
        return []
    cikti = []
    for metin in adaylar:
        yanit = laya_sor(
            {"text": str(metin)[:metin_uzunluk]},
            {"m": {"type": "noul", "instructions": f'Bu metin şu soruya DOĞRUDAN karşılık geliyor mu: "{soru}"'}},
            timeout,
        )
        c = (yanit.get("answers") or {}).get("m") or {}
        deger = c.get("noul") if isinstance(c.get("noul"), (int, float)) else c.get("score")
        cikti.append(float(deger) if isinstance(deger, (int, float)) else None)
    return cikti


def laya_sirala(soru: str, adaylar: list, metin_uzunluk: int = 700, azalan: bool = True, timeout: int = 30) -> list:
    """Adayları Laya skoruna göre yeniden sırala: [{metin, skor, index}] döner."""
    skorlar = laya_skorla(soru, adaylar, metin_uzunluk, timeout)
    sirali = [{"metin": m, "skor": skorlar[i], "index": i} for i, m in enumerate(adaylar)]
    sirali.sort(key=lambda t: (t["skor"] if t["skor"] is not None else float("-inf")), reverse=azalan)
    return sirali


def laya_guard(prompt: str, timeout: int = 30) -> dict:
    """Laya guard: prompt risklerini noul ile skorla. Cevapta 'engelle' + eşik döner."""
    return _istek("/laya/guard", {"prompt": prompt}, timeout)


def laya_sort(items: list, question: dict, order: str = "desc", timeout: int = 60) -> dict:
    """Laya sort ucu: listeyi verdiğin skor/choice sorusuyla sunucuda sıralar.

    criteria şart: score → ["acil değil","yakın zamanda","kritik"], choice → {etiket: "açıklama"}.
    Eksikse sunucu 500 döner; burada net hata veriyoruz.
    """
    if not question or not question.get("criteria"):
        raise RuntimeError(
            f'laya sort: "{question.get("type", "?") if question else "?"}" sorusu için criteria şart '
            '(score → skor ölçeği, choice → {etiket:"açıklama"}).'
        )
    return _istek("/laya/sort", {"items": items, "question": question, "order": order}, timeout)


def nobet_at(proje: str, durum: str = "iyi", not_: str = "", timeout: int = 10) -> dict:
    return _istek("/nobet/beat", {"proje": proje, "durum": durum, "not": not_}, timeout)


def nobet_durum(timeout: int = 15) -> dict:
    base, key = _cfg()
    req = urllib.request.Request(f"{base}/nobet/durum", headers={"X-Gateway-Key": key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def maskele(metin: str, timeout: int = 10) -> dict:
    return _istek("/maske", {"metin": metin}, timeout)


def sir_al(proje: str, timeout: int = 15) -> dict:
    base, key = _cfg()
    req = urllib.request.Request(f"{base}/sir/{proje}", headers={"X-Gateway-Key": key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _cli(argv: list) -> dict:
    """nocturn-gateway CLI — TS ikiziyle aynı komutlar (triyajsız jenerik yüzey)."""
    komut, *kalan = argv
    if komut == "skor":
        soru, *adaylar = kalan
        if not soru or not adaylar:
            raise SystemExit('kullanım: nocturn-gateway skor "<soru>" <aday...>')
        return {"soru": soru, "adaylar": adaylar, "skorlar": jev_skorla(soru, adaylar)}
    if komut == "laya":
        yol, *rest = kalan
        if yol in ("health", "saglik", "sağlık"):
            return laya_saglik()
        if yol == "sor":
            return laya_sor(json.loads(rest[0]), json.loads(rest[1]))
        if yol in ("skorla", "skor"):
            return {"soru": rest[0], "adaylar": rest[1:], "skorlar": laya_skorla(rest[0], rest[1:])}
        if yol in ("sirala", "sırala"):
            return {"soru": rest[0], "sonuc": laya_sirala(rest[0], rest[1:])}
        if yol == "guard":
            return laya_guard(" ".join(rest))
        if yol == "sort":
            return laya_sort(json.loads(rest[0]), json.loads(rest[1]))
        if yol in ("predict", "triage"):
            return laya_istek(yol, json.loads(rest[0]), json.loads(rest[1]))
        raise SystemExit("kullanım: nocturn-gateway laya <health|sor|skorla|sirala|guard|sort|predict|triage>")
    if komut == "nobet":
        alt, *rest = kalan
        if alt == "durum":
            return nobet_durum()
        if alt == "beat":
            if not rest:
                raise SystemExit("kullanım: nocturn-gateway nobet beat <proje> [iyi|bozuk] [not]")
            return nobet_at(rest[0], rest[1] if len(rest) > 1 else "iyi", " ".join(rest[2:]))
        raise SystemExit("kullanım: nocturn-gateway nobet <beat|durum>")
    if komut == "maske":
        return maskele(" ".join(kalan))
    if komut == "sir":
        if not kalan:
            raise SystemExit("kullanım: nocturn-gateway sir <proje>")
        return sir_al(kalan[0])
    raise SystemExit(__doc__)


if __name__ == "__main__":
    import sys
    print(json.dumps(_cli(sys.argv[1:]), ensure_ascii=False, indent=2))
