// Le scénario de la démo. Les sorties de Twice Shy (learn, hook) sont recopiées
// des vraies exécutions sur le dépôt de démo `shop` ; les lignes de l'agent
// reconstituent la session, l'erreur ayant été écrite à la main (voir README).
import { writeFileSync } from "node:fs";
const s = [];
let t = 0;
const at = (dt) => (t += dt);
const line = (text, cls = "", dt = 0.35, extra = {}) => s.push({ at: at(dt), type: "line", text, cls, ...extra });
const type = (text, cls = "prompt user", dt = 0.6, speed = 30) => { s.push({ at: at(dt), type: "type", text, cls, speed }); t += text.length / speed; };
const caption = (text, dt = 0) => s.push({ at: at(dt), type: "caption", text });
const clear = (dt = 0) => s.push({ at: at(dt), type: "clear" });

s.push({ at: 0, type: "title", text: "~/shop · claude  (demo repository)" });
caption("1 · learns from your past bugs", 0.2);
type("/twiceshy:learn");
line("Twice Shy · once bitten, twice shy", "bold accent", 0.7);
line("✓ Reading the history · 10 bug fixes found", "green", 0.9);
line("  5 older fixes to learn from, 5 recent ones to test the rules on", "dim");
line("✓ Writing rules from the older fixes · 4 rules proposed", "green", 1.0);
line("✓ Testing each rule on 5 bugs it has never seen", "green", 1.0);
line("", "", 0.4);
line("✓ Money amounts must stay integer cents end to end: convert euro inputs only through money.js helpers, never with inline * 100 or float euro arithmetic.", "bold", 0.5);
line("  kept · would have caught 1 of 5 bugs", "green");
line("✓ Every function that returns cents must round to an integer after any multiplication by a ratio, percent or weight.", "bold", 0.5);
line("  kept · would have caught 2 of 5 bugs", "green");
line("✗ Subtracting a deduction from a total must be clamped so the result cannot go negative.", "dim", 0.5);
line("  dropped · caught 0 of 5 bugs, 1 false alarm", "dim");
line("", "", 0.3);
line("On your last 5 bug fixes, these rules would have caught 3.", "bold green", 0.6);
clear(3.2);

caption("2 · checks your agent every time it says “done”");
type("Add shipping insurance: 2.5% of the order, minimum 0.99 €", "prompt user", 0.5);
line("● Write src/billing/insurance.js", "cyan", 1.0);
line("    return Math.max(0.99 * 100, orderTotalCents * 0.025);", "dim", 0.3);
line("● Bash npm test  →  1 passed", "cyan", 0.9);
line("Done. Tests pass.", "", 0.8);
line("", "", 0.6);
line("Stop hook · Twice Shy: your work is not finished.", "red bold", 0.2);
line("Project rule broken: money amounts must stay integer cents end to end.", "red", 0.5);
line("  src/billing/insurance.js:3  `0.99 * 100` is an inline euro-to-cents conversion", "yellow", 0.3);
line("Project rule broken: every function that returns cents must round to an integer.", "red", 0.6);
line("  src/billing/insurance.js:3  `orderTotalCents * 0.025` is returned unrounded", "yellow", 0.3);
line("  How to fix: use percentOf from money.js, and the integer minimum 99.", "dim", 0.3);
caption("3 · sends it back until it's right", 2.6);
line("● Edit src/billing/insurance.js", "cyan", 0.6);
line("    return Math.max(99, percentOf(orderTotalCents, 2.5));", "dim", 0.3);
line("", "", 0.5);
line("✓ Twice Shy · 1 check, 2 rules · all good", "green bold", 0.6);
clear(3.0);

caption("");
line("", "", 0.1);
line("Twice Shy", "bold accent", 0.1, { cls: "bold accent", html: true, text: '<span style="font-size:46px">Twice Shy</span>' });
line("Once bitten, twice shy. Your agent won't repeat a bug your repo already fixed.", "", 0.5);
line("", "", 0.2);
line("/plugin marketplace add jodevweb/twiceshy", "cyan", 0.5);
line("Claude Code plugin · MIT · any language", "dim", 0.4);
writeFileSync(new URL("./scenario.json", import.meta.url), JSON.stringify(s, null, 1));
console.log("événements", s.length, "durée ~", t.toFixed(1), "s");
