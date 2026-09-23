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
