// Le scénario de la démo. Les sorties de Twice Shy (learn, hook) sont recopiées
// des vraies exécutions sur le dépôt de démo `shop`, version 0.3, et l'ADR est
// celui qu'un agent Haiku a réellement écrit quand le hook l'a renvoyé. Seul le
// bug d'arrondi a été tapé à la main (voir README) : sur un dépôt aussi petit,
// l'agent trouvait la bonne solution tout seul.
import { writeFileSync } from "node:fs";
const s = [];
let t = 0;
const at = (dt) => (t += dt);
const line = (text, cls = "", dt = 0.35, extra = {}) => s.push({ at: at(dt), type: "line", text, cls, ...extra });
const type = (text, cls = "prompt user", dt = 0.6, speed = 30) => { s.push({ at: at(dt), type: "type", text, cls, speed }); t += text.length / speed; };
const caption = (text, dt = 0) => s.push({ at: at(dt), type: "caption", text });
const clear = (dt = 0) => s.push({ at: at(dt), type: "clear" });

s.push({ at: 0, type: "title", text: "~/shop · claude  (demo repository)" });
caption("1 · learns what your project expects", 0.2);
type("/twiceshy:learn");
line("Twice Shy · once bitten, twice shy", "bold accent", 0.7);
line("✓ 10 bug fixes found among 22 commits", "green", 0.8);
line("✓ 2 of your messages read in 1 past session, 1 of them corrected the agent", "green", 0.5);
line("✓ Decisions read: CLAUDE.md, docs/adr/0001-record-architecture-decisions.md", "green", 0.5);
line("✓ Testing 9 rules on 5 recent bugs they never saw and 8 healthy commits", "green", 0.9);
line("", "", 0.3);
line("From your past bugs", "bold accent", 0.4);
line("✓ Money stays integer cents; use toCents / percentOf, never inline * 100", "bold", 0.3);
line("  kept · would have caught 2 of 5 bugs", "green");
line("✗ Subtracting a coupon must clamp the total at zero", "dim", 0.3);
line("  dropped · would have caught 0 of 5 bugs", "dim");
line("From your corrections to agents", "bold accent", 0.5);
line("✓ Display prices with Intl.NumberFormat('fr-FR', EUR), never toFixed + '€'", "bold", 0.3);
line("  kept · you asked for this once", "green");
line("From your written decisions (ADR, CLAUDE.md)", "bold accent", 0.5);
line("✓ A new dependency comes with an ADR in docs/adr/", "bold", 0.3);
line("  kept · from ADR 0001", "green");
line("! Every module under src/billing has a test in test/", "yellow", 0.3);
line("  not enforced · recent commits don't follow it: update the document?", "yellow");
line("", "", 0.3);
line("7 rules checked on every stop. On your last 5 bug fixes, they would have caught 4.", "bold green", 0.5);
clear(3.4);

caption("2 · checks the agent every time it says “done”");
type("Add shipping insurance: 2.5% of the order, minimum 0.99 €", "prompt user", 0.5);
line("● Write src/billing/insurance.js", "cyan", 1.0);
line("    return Math.max(0.99 * 100, orderTotalCents * 0.025);", "dim", 0.3);
line("● Bash npm test  →  all passed", "cyan", 0.9);
line("Done. Tests pass.", "", 0.8);
line("", "", 0.5);
line("Stop hook · Twice Shy: your work is not finished.", "red bold", 0.2);
line("Project rule broken: money stays integer cents, never inline * 100.", "red", 0.5);
line("  src/billing/insurance.js:3  `0.99 * 100`", "yellow", 0.3);
line("  from your past bugs · and from CLAUDE.md", "dim", 0.2);
line("Project rule broken: a function returning cents must round to an integer.", "red", 0.5);
line("  src/billing/insurance.js:3  `orderTotalCents * 0.025` returned without Math.round", "yellow", 0.3);
line("  How to fix: toCents(0.99) and percentOf(orderTotalCents, 2.5) from money.js", "dim", 0.3);
line("● Edit src/billing/insurance.js", "cyan", 1.4);
line("    return Math.max(toCents(0.99), percentOf(orderTotalCents, 2.5));", "dim", 0.3);
line("✓ Twice Shy · 1 check, 7 rules · all good", "green bold", 0.8);
clear(3.0);

caption("3 · a new dependency? the agent writes the ADR");
type("Add dayjs and use it in a new src/orders/eta.js", "prompt user", 0.5);
line("● Edit package.json   + \"dayjs\": \"^1.11.13\"", "cyan", 0.9);
line("● Write src/orders/eta.js", "cyan", 0.5);
line("Done.", "", 0.7);
line("", "", 0.4);
line("Stop hook · Twice Shy: your work is not finished.", "red bold", 0.2);
line("New dependency without a decision record: dayjs", "red", 0.4);
line("  Write an ADR at docs/adr/0002-use-dayjs.md: why dayjs, and why not", "yellow", 0.3);
line("  what the project already uses for the same need.", "yellow", 0.1);
line("● Read src/orders/delivery.js, src/orders/slots.js", "cyan", 1.2);
line("● Write docs/adr/0002-use-dayjs.md", "cyan", 0.5);
line("    ## Alternatives considered", "dim", 0.3);
line("    - Native Date with UTC setters, as in delivery.js: what the project", "dim", 0.15);
line("      already uses. Not chosen: eta.js also needs fixed string formatting.", "dim", 0.15);
line("    - Intl.DateTimeFormat, as in slots.js: no date arithmetic.", "dim", 0.15);
line("✓ Twice Shy · 1 check, 7 rules · all good", "green bold", 0.9);
clear(3.4);

caption("");
line("", "", 0.1);
line("Twice Shy", "bold accent", 0.1, { cls: "bold accent", html: true, text: '<span style="font-size:46px">Twice Shy</span>' });
line("Once bitten, twice shy. Your agent won't repeat a mistake your project already paid for.", "", 0.5);
line("", "", 0.2);
line("/plugin marketplace add jodevweb/twiceshy", "cyan", 0.5);
line("Claude Code plugin · MIT · any language", "dim", 0.4);
writeFileSync(new URL("./scenario.json", import.meta.url), JSON.stringify(s, null, 1));
console.log("événements", s.length, "durée ~", t.toFixed(1), "s");
