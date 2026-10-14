import test from "node:test";
import assert from "node:assert/strict";

const ORIJINAL_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = ORIJINAL_FETCH;
});

test("boş aday listesi ağa hiç çıkmadan [] döner", async () => {
  const { jevSkorla } = await import("../dist/gateway.js");
  let cagrildi = 0;
  globalThis.fetch = (async () => {
    cagrildi++;
    throw new Error("ağa çıkılmamalıydı");
  });
  assert.deepEqual(await jevSkorla("soru", [], { key: "test" }), []);
  assert.equal(cagrildi, 0);
});

test("jevSkorla: 0-1 aralığına kırpılır, cevapsız aday NaN döner", async () => {
  const { jevSkorla } = await import("../dist/gateway.js");
  globalThis.fetch = (async (_url, init) => {
    const govde = JSON.parse(String(init.body));
    assert.equal(govde.questions.m0.type, "noul");
    return new Response(
      JSON.stringify({
        answers: {
          m0: { type: "noul", noul: 1.7 },
          m1: { type: "noul", noul: -0.2 },
          // m2 cevapsız
          m3: { type: "baska", noul: 0.9 },
        },
      }),
      { status: 200 },
    );
  });
  const skorlar = await jevSkorla("soru", ["a", "b", "c", "d"], { key: "test" });
  assert.equal(skorlar[0], 1);
  assert.equal(skorlar[1], 0);
  assert.ok(Number.isNaN(skorlar[2]));
  assert.ok(Number.isNaN(skorlar[3]));
});

test("anahtar yoksa ağa çıkmadan hata fırlatır", async () => {
  const { jevSkorla } = await import("../dist/gateway.js");
  globalThis.fetch = (async () => {
    throw new Error("ağa çıkılmamalıydı");
  });
  await assert.rejects(() => jevSkorla("soru", ["a"], { key: " " }), /AI_GATEWAY_KEY/);
});

test("layaIstek doğru yola ve zarfa sarar", async () => {
  const { layaIstek } = await import("../dist/gateway.js");
  let yakalananYol = "";
  globalThis.fetch = (async (url) => {
    yakalananYol = String(url);
    return new Response(JSON.stringify({ karar: "onay" }), { status: 200 });
  });
  const r = await layaIstek("triage", { a: 1 }, { b: 2 }, { key: "test", baseUrl: "https://gw.test/" });
  assert.equal(yakalananYol, "https://gw.test/laya/triage");
  assert.deepEqual(r, { karar: "onay" });
});

test("401 → anlaşılır hata mesajı", async () => {
  const { layaSaglik } = await import("../dist/gateway.js");
  globalThis.fetch = (async () => new Response("yetkisiz", { status: 401 }));
  await assert.rejects(() => layaSaglik({ key: "yanlis" }), /401/);
});

test("layaSor: /laya/predict'e state+questions gider, ham answers döner", async () => {
  const { layaSor } = await import("../dist/gateway.js");
  let yol = "";
  globalThis.fetch = (async (url, init) => {
    yol = String(url);
    const g = JSON.parse(String(init.body));
    assert.deepEqual(g.state, { text: "selam" });
    assert.equal(g.questions.q.type, "choice");
    return new Response(JSON.stringify({ answers: { q: { type: "choice", choice: "satis" } } }), { status: 200 });
  });
  const r = await layaSor({ text: "selam" }, { q: { type: "choice", instructions: "?", criteria: { satis: "x" } } }, { key: "t", baseUrl: "https://gw.test" });
  assert.equal(yol, "https://gw.test/laya/predict");
  assert.equal(r.answers.q.choice, "satis");
});

test("layaSkorla: aday başına tek çağrı, input sırasına hizalı, cevapsız null", async () => {
  const { layaSkorla } = await import("../dist/gateway.js");
  let cagri = 0;
  globalThis.fetch = (async (_url, init) => {
    cagri++;
    const g = JSON.parse(String(init.body));
    const yanit = g.state.text === "a" ? { answers: { m: { type: "noul", noul: 0.9 } } } : { answers: { m: { type: "noul" } } };
    return new Response(JSON.stringify(yanit), { status: 200 });
  });
  const s = await layaSkorla("soru?", ["a", "b"], { key: "t" });
  assert.equal(cagri, 2);
  assert.equal(s[0], 0.9);
  assert.equal(s[1], null);
});

test("layaSirala: skora göre azalan sıralar, null en dibe", async () => {
  const { layaSirala } = await import("../dist/gateway.js");
  globalThis.fetch = (async (_url, init) => {
    const g = JSON.parse(String(init.body));
    const puan = { az: 0.2, cok: 0.8 }[g.state.text];
    const m = puan === undefined ? { type: "noul" } : { type: "noul", noul: puan };
    return new Response(JSON.stringify({ answers: { m } }), { status: 200 });
  });
  const r = await layaSirala("s?", ["az", "cok", "yok"], { key: "t" });
  assert.deepEqual(r.map((x) => x.metin), ["cok", "az", "yok"]);
  assert.equal(r[2].skor, null);
});

test("layaSort: criteria eksikse ağa çıkmadan net hata fırlatır", async () => {
  const { layaSort } = await import("../dist/gateway.js");
  globalThis.fetch = (async () => {
    throw new Error("ağa çıkılmamalıydı");
  });
  await assert.rejects(() => layaSort([{ id: 1, text: "x" }], { type: "score", instructions: "aciliyet?" }, { key: "t" }), /criteria/);
});
