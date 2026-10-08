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
    """Adayları TEK çağrıda noul ile skorla. Dizi input sırasına hizalı; cevapsız aday None."""
    if not adaylar:
        return []
    state: dict = {}
    questions: dict = {}
    for i, metin in enumerate(adaylar):
        state[f"aday_{i}"] = str(metin)[:metin_uzunluk]
        questions[f"m{i}"] = {
            "type": "noul",
            "instructions": (
                f'aday_{i} alanındaki metin, "{soru}" sorusuna DOĞRUDAN karşılık geliyor mu? '
                "Aynı konuda olması yetmez; sorulan şeyi bu metin karşılamalıdır."
            ),
        }
    yanit = laya_sor(state, questions, timeout)
    cikti = []
    for i in range(len(adaylar)):
        c = (yanit.get("answers") or {}).get(f"m{i}") or {}
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
    """Laya sort ucu: listeyi verdiğin skor/choice sorusuyla sunucuda sıralar."""
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
