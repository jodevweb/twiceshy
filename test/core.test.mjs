import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCode, looksLikeFix, splitFixes } from "../src/fixes.mjs";
import { detectGates } from "../src/gates.mjs";
import { extractJson, parseResult } from "../src/judge.mjs";
import { cleanRules, worthKeeping } from "../src/learn.mjs";
import { applicableRules } from "../src/check.mjs";

test("un sujet de correctif se reconnaît, en anglais comme en français", () => {
	for (const subject of ["fix: null total", "fix(api): retry", "Fixes #42 rounding", "hotfix login", "Corrige l'arrondi", "Revert \"add cache\""]) {
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

test("une règle se garde si elle détecte sans crier au loup", () => {
	assert.ok(worthKeeping({ tried: 12, caught: 3, falseAlarms: 1 }));
	assert.ok(!worthKeeping({ tried: 12, caught: 0, falseAlarms: 0 }));
	assert.ok(!worthKeeping({ tried: 12, caught: 2, falseAlarms: 4 }));
	assert.ok(!worthKeeping({ tried: 0, caught: 0, falseAlarms: 0 }));
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

function project(files) {
	const dir = mkdtempSync(join(tmpdir(), "twiceshy-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(dir, path, ".."), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
	return dir;
}

test("les vérifications se détectent selon la stack", () => {
	assert.deepEqual(
		detectGates(project({ "package.json": JSON.stringify({ scripts: { lint: "eslint .", test: "vitest" } }), "pnpm-lock.yaml": "" })),
		["pnpm lint", "pnpm test"],
	);
	assert.deepEqual(detectGates(project({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) })), []);
	assert.deepEqual(detectGates(project({ "pyproject.toml": "[tool.ruff]\n[tool.pytest.ini_options]\n", "uv.lock": "" })), ["uv run ruff check .", "uv run pytest -q"]);
	assert.deepEqual(detectGates(project({ "go.mod": "module x" })), ["go vet ./...", "go test ./..."]);
	assert.deepEqual(detectGates(project({ "Cargo.toml": "" })), ["cargo test --quiet"]);
	assert.deepEqual(detectGates(project({ "composer.json": "{}", artisan: "" })), ["php artisan test"]);
	assert.deepEqual(detectGates(project({ "pom.xml": "" })), ["mvn -q test"]);
	assert.deepEqual(detectGates(project({ "manage.py": "", "requirements.txt": "", "tests/x.py": "" })), ["python manage.py test"]);
});
