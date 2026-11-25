import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCode, looksLikeFix, splitFixes } from "../src/fixes.mjs";
import { detectGates, gateConcerns } from "../src/gates.mjs";
import { extractJson, parseResult } from "../src/judge.mjs";
import { cleanRules, verdict } from "../src/learn.mjs";
import { applicableRules } from "../src/check.mjs";
import { newDependencies } from "../src/deps.mjs";
import { nextAdrPath, readDecisions } from "../src/decisions.mjs";
import { sessionKey } from "../src/sources/sessions-reader.mjs";
import { SOURCES } from "../src/sources/index.mjs";

function project(files) {
	const dir = mkdtempSync(join(tmpdir(), "twiceshy-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(dir, path, ".."), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
	return dir;
}

const commands = (gates) => gates.map((gate) => (gate.dir ? `${gate.dir}: ${gate.command}` : gate.command));

test("un sujet de correctif se reconnaît, en anglais comme en français", () => {
	for (const subject of ["fix: null total", "fix(api): retry", "Fixes #42 rounding", "hotfix login", "Corrige l'arrondi", 'Revert "add cache"']) {
		assert.ok(looksLikeFix(subject), subject);
	}
	for (const subject of ["feat: add prefix option", "chore: suffix", "docs: explain fixtures"]) {
		assert.ok(!looksLikeFix(subject), subject);
	}
});

test("la doc et les verrous ne sont pas du code", () => {
	assert.ok(isCode("src/billing/invoice.ts"));
	assert.ok(!isCode("README.md"));
	assert.ok(!isCode("pnpm-lock.yaml"));
	assert.ok(!isCode("src/locales/fr/app.json"));
});

test("les correctifs récents servent au test, les anciens à l'apprentissage", () => {
	const fixes = Array.from({ length: 30 }, (_, i) => ({ sha: String(i) }));
	const { testOn, learnFrom, leaked } = splitFixes(fixes, { test: 12 });
	assert.equal(testOn.length, 12);
	assert.equal(testOn[0].sha, "0");
	assert.equal(learnFrom[0].sha, "12");
	assert.ok(!leaked);
	assert.ok(splitFixes(fixes.slice(0, 3)).leaked);
	assert.equal(splitFixes(fixes.slice(0, 6), { test: 12 }).testOn.length, 3);
});

test("le sort d'une règle dépend de la politique de sa source", () => {
	const score = (caught, falseAlarms, healthyFlags = 0) => ({ tried: 12, caught, falseAlarms, healthyTried: 8, healthyFlags });
	assert.equal(verdict("proven", score(3, 1)), "keep");
	assert.equal(verdict("proven", score(0, 0)), "drop");
	assert.equal(verdict("proven", score(2, 4, 2)), "drop");
	assert.equal(verdict("requested", score(0, 0)), "keep");
	assert.equal(verdict("requested", score(0, 2, 3)), "drop");
	assert.equal(verdict("documented", score(0, 0, 1)), "keep");
	assert.equal(verdict("documented", score(0, 0, 6)), "stale");
});

test("chaque source respecte le contrat", () => {
	const ids = new Set();
	for (const source of SOURCES) {
		assert.ok(source.id && !ids.has(source.id), source.id);
		ids.add(source.id);
		assert.ok(["proven", "requested", "documented"].includes(source.policy), source.id);
		assert.equal(typeof source.collect, "function");
		assert.equal(typeof source.title(), "string");
	}
});

test("les portées de règles sont normalisées", () => {
	const [rule] = cleanRules([{ text: " Money only ", why: "x", scope: ["./src/billing/", "all", "src\\api"] }]);
	assert.deepEqual(rule.scope, ["src/billing", "src/api"]);
	assert.equal(rule.text, "Money only");
	assert.equal(cleanRules([{ text: "" }]).length, 0);
});

test("une règle ne s'applique qu'aux fichiers de sa portée", () => {
	const rules = [{ text: "a", scope: ["src/billing"] }, { text: "b", scope: [] }];
	assert.deepEqual(applicableRules(rules, ["src/api/x.ts"]).map((r) => r.text), ["b"]);
	assert.deepEqual(applicableRules(rules, ["src\\billing\\x.ts"]).map((r) => r.text), ["a", "b"]);
});

test("la réponse du juge se relit, structurée ou en texte", () => {
	assert.deepEqual(parseResult(JSON.stringify({ structured_output: { ok: true }, total_cost_usd: 0.1 })), { data: { ok: true }, cost: 0.1 });
	assert.deepEqual(parseResult(JSON.stringify({ result: 'Voici :\n```json\n{"a": "}"}\n```' })).data, { a: "}" });
	assert.throws(() => parseResult(JSON.stringify({ is_error: true, result: "quota" })), /quota/);
	assert.deepEqual(extractJson('bla {"x": {"y": 1}} bla'), { x: { y: 1 } });
});

test("les vérifications se détectent selon la stack", () => {
	assert.deepEqual(
		commands(detectGates(project({ "package.json": JSON.stringify({ scripts: { lint: "eslint .", test: "vitest" } }), "pnpm-lock.yaml": "" }))),
		["pnpm lint", "pnpm test"],
	);
	assert.deepEqual(commands(detectGates(project({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }))), []);
	assert.deepEqual(commands(detectGates(project({ "pyproject.toml": "[tool.ruff]\n[tool.pytest.ini_options]\n", "uv.lock": "" }))), ["uv run ruff check .", "uv run pytest -q"]);
	assert.deepEqual(commands(detectGates(project({ "go.mod": "module x" }))), ["go vet ./...", "go test ./..."]);
	assert.deepEqual(commands(detectGates(project({ "Cargo.toml": "" }))), ["cargo test --quiet"]);
	assert.deepEqual(commands(detectGates(project({ "composer.json": "{}", artisan: "" }))), ["php artisan test"]);
	assert.deepEqual(commands(detectGates(project({ "pom.xml": "" }))), ["mvn -q test"]);
	assert.deepEqual(commands(detectGates(project({ "manage.py": "", "requirements.txt": "", "tests/x.py": "" }))), ["python manage.py test"]);
});

test("les sous-projets ont leurs propres vérifications, lancées seulement s'ils changent", () => {
	const dir = project({
		"requirements.txt": "",
		"server/requirements.txt": "",
		"server/tests/test_a.py": "",
		"web/package.json": JSON.stringify({ scripts: { lint: "eslint ." } }),
	});
	const gates = detectGates(dir);
	assert.deepEqual(commands(gates), ["server: pytest -q", "web: npm run lint"]);
	assert.ok(gateConcerns(gates[0], ["server/app/main.py"]));
	assert.ok(!gateConcerns(gates[0], ["web/src/App.tsx"]));
});

test("une nouvelle dépendance se repère, quel que soit le format, mais pas une montée de version", () => {
	assert.deepEqual(
		newDependencies("package.json", '{"scripts":{"test":"x"},"dependencies":{"react":"^18"}}', '{"scripts":{"test":"y"},"dependencies":{"react":"^19","dayjs":"^1"}}'),
		["dayjs"],
	);
	assert.deepEqual(newDependencies("server/requirements.txt", "flask==3.0\n", "flask==3.1\nhttpx[http2]>=0.27\n"), ["httpx"]);
	assert.deepEqual(
		newDependencies("pyproject.toml", '[project]\nname = "x"\ndependencies = ["flask>=3"]\n', '[project]\nname = "x"\ndependencies = ["flask>=3", "httpx>=0.27"]\n'),
		["httpx"],
	);
	assert.deepEqual(
		newDependencies("Cargo.toml", '[package]\nname = "x"\nversion = "1.0.0"\n[dependencies]\nserde = "1"\n', '[package]\nname = "x"\nversion = "1.0.0"\n[dependencies]\nserde = "1"\ntokio = { version = "1" }\n'),
		["tokio"],
	);
	assert.deepEqual(newDependencies("go.mod", "require (\n\tgithub.com/a/b v1.0.0\n)\n", "require (\n\tgithub.com/a/b v1.1.0\n\tgithub.com/c/d v0.2.0\n)\n"), ["github.com/c/d"]);
	assert.deepEqual(newDependencies("src/app.js", "", "x"), []);
});

test("les ADR se numérotent à la suite, et se lisent avec les consignes aux agents", () => {
	const dir = project({
		"docs/adr/0000-template.md": "# T",
		"docs/adr/0001-first.md": "# 1. First",
		"docs/adr/0007-x.md": "# 7. X",
		"CLAUDE.md": "Use pnpm.",
		"docs/conventions.md": "# Conventions",
	});
	assert.equal(nextAdrPath(dir, "Use Dayjs for dates"), "docs/adr/0008-use-dayjs-for-dates.md");
	assert.deepEqual(
		readDecisions(dir).map((d) => d.path),
		["CLAUDE.md", "docs/adr/0001-first.md", "docs/adr/0007-x.md"],
	);
	assert.deepEqual(
		readDecisions(dir, ["./docs/conventions.md"]).map((d) => d.path).at(-1),
		"docs/conventions.md",
	);
});

test("le dossier de sessions de Claude Code se retrouve depuis le chemin du projet", () => {
	assert.equal(sessionKey("D:/work/my-app"), "D--work-my-app");
	assert.equal(sessionKey("/home/me/my.app"), "-home-me-my-app");
});
