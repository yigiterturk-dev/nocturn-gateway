// canlı smoke test: node test-canli.mjs (AI_GATEWAY_KEY gerekir)
import { layaSaglik, jevSkorla } from "./gateway.ts";
console.log("laya:", await layaSaglik());
const s = await jevSkorla("test sorusu", ["birinci aday metin", "ikinci aday metin"]);
console.log("jev skorları:", s);
