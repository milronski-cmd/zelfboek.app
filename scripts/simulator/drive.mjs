// Stuurt JavaScript naar de draaiende Expo-app via Metro's Hermes-debugger (CDP).
// Gebruik: node drive.mjs '<expressie>'  |  node drive.mjs -f bestand.js
// Een expressie die "__async__" teruggeeft (via __t.run) wordt gepolld tot __t._done.
import WebSocket from "ws";
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const expr = args[0] === "-f" ? readFileSync(args[1], "utf8") : args.join(" ");
const targets = await (await fetch("http://localhost:8081/json")).json();
const t = targets.find((x) => /Exponent|Hermes|React/i.test(x.title + x.description));
if (!t) { console.error("geen app-target bij Metro"); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl, { origin: "http://127.0.0.1:8081" });
let id = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m.toString()); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const evaluate = (expression) => new Promise((res, rej) => {
  const myId = ++id; const timer = setTimeout(() => rej(new Error("time-out")), 20000);
  pending.set(myId, (d) => { clearTimeout(timer); if (d.error) rej(new Error(JSON.stringify(d.error))); else if (d.result?.exceptionDetails) rej(new Error("APP-FOUT: " + (d.result.exceptionDetails.exception?.description ?? d.result.exceptionDetails.text))); else res(d.result?.result?.value); });
  ws.send(JSON.stringify({ id: myId, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
});
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
try {
  let v = await evaluate(expr);
  if (v === "__async__") {
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 150));
      const s = await evaluate("__t._done ? JSON.stringify({v: __t._r}) : '__pending__'");
      if (s !== "__pending__") { v = JSON.parse(s).v; break; }
      if (Date.now() - t0 > 150000) throw new Error("async time-out (150 s)");
    }
  }
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { ws.close(); }
