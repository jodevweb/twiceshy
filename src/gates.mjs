// Les vérifications du projet : tests, lint, types.
//
// Une vérification n'est pas un avis : c'est une commande, et son code de
// sortie tranche. L'agent peut écrire « les tests passent », c'est le code de
// sortie qui le dit vraiment.
//
// Détection par fichier de projet, pour couvrir les écosystèmes courants sans
// configuration. Un dépôt qui veut autre chose déclare ses commandes dans
// `.twiceshy/config.json` (`"gates": ["make check"]`) et la détection s'efface.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const has = (root, file) => existsSync(join(root, file));

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

/** Le lanceur de scripts d'un projet Node, d'après son fichier de verrouillage. */
function nodeRunner(root) {
	if (has(root, "pnpm-lock.yaml")) return "pnpm";
	if (has(root, "yarn.lock")) return "yarn";
	if (has(root, "bun.lockb") || has(root, "bun.lock")) return "bun run";
	return "npm run";
}

/** Le script `test` par défaut de `npm init`, qui échoue toujours. */
const NPM_PLACEHOLDER = /no test specified/i;

/**
 * Les scripts d'un `package.json`, dans l'ordre du plus rapide au plus lent :
 * les types et le lint échouent vite, les tests prennent du temps.
 */
function nodeGates(root) {
	const scripts = readJson(join(root, "package.json"))?.scripts ?? {};
	const runner = nodeRunner(root);
	const gates = [];
	const pick = (...names) => names.find((name) => typeof scripts[name] === "string");
	const typecheck = pick("typecheck", "type-check", "check-types", "types", "tsc");
	if (typecheck) gates.push(`${runner} ${typecheck}`);
	else if (has(root, "tsconfig.json") && existsSync(join(root, "node_modules", "typescript"))) {
		gates.push(runner === "npm run" ? "npx tsc --noEmit" : `${runner.split(" ")[0]} exec tsc --noEmit`);
	}
	const lint = pick("lint");
	if (lint) gates.push(`${runner} ${lint}`);
	const test = pick("test:unit", "test");
	if (test && !NPM_PLACEHOLDER.test(scripts[test])) gates.push(`${runner} ${test}`);
	return gates;
}

function pythonGates(root) {
	const python = ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "pytest.ini", "tox.ini"].some((f) =>
		has(root, f),
	);
	if (!python) return [];
	const prefix = has(root, "uv.lock") ? "uv run " : has(root, "poetry.lock") ? "poetry run " : "";
	const gates = [];
	const pyproject = has(root, "pyproject.toml") ? readFileSync(join(root, "pyproject.toml"), "utf8") : "";
	if (/\[tool\.ruff/.test(pyproject) || has(root, "ruff.toml") || has(root, ".ruff.toml")) gates.push(`${prefix}ruff check .`);
	if (/\[tool\.mypy/.test(pyproject) || has(root, "mypy.ini")) gates.push(`${prefix}mypy .`);
	const hasTests = has(root, "tests") || has(root, "test") || has(root, "pytest.ini") || /\[tool\.pytest/.test(pyproject);
	if (hasTests) gates.push(has(root, "manage.py") && !/pytest/.test(pyproject) ? "python manage.py test" : `${prefix}pytest -q`);
	return gates;
}

function phpGates(root) {
	if (!has(root, "composer.json")) return [];
	const scripts = readJson(join(root, "composer.json"))?.scripts ?? {};
	if (scripts.test) return ["composer test"];
	if (has(root, "artisan")) return ["php artisan test"];
	if (has(root, "vendor/bin/phpunit")) return ["vendor/bin/phpunit"];
	return [];
}

function jvmGates(root) {
	if (has(root, "pom.xml")) return [has(root, "mvnw") ? "./mvnw -q test" : "mvn -q test"];
	if (has(root, "build.gradle") || has(root, "build.gradle.kts")) return [has(root, "gradlew") ? "./gradlew test" : "gradle test"];
	return [];
}

/** Les vérifications détectées pour un dépôt, sans rien lancer. */
export function detectGates(root) {
	const gates = [];
	if (has(root, "package.json")) gates.push(...nodeGates(root));
	gates.push(...pythonGates(root));
	if (has(root, "go.mod")) gates.push("go vet ./...", "go test ./...");
	if (has(root, "Cargo.toml")) gates.push("cargo test --quiet");
	gates.push(...phpGates(root));
	gates.push(...jvmGates(root));
	if (has(root, "Gemfile") && has(root, "spec")) gates.push("bundle exec rspec");
	if (has(root, "mix.exs")) gates.push("mix test");
	return gates;
}

/** Les vérifications à lancer : celles déclarées, sinon celles détectées. */
export function gatesFor(root, config) {
	return Array.isArray(config.gates) ? config.gates.filter((g) => typeof g === "string" && g.trim()) : detectGates(root);
}

/** Ce qu'on garde de la sortie d'une vérification : la fin, là où sont les erreurs. */
const MAX_OUTPUT = 6_000;

/**
 * Lance une vérification. Rend `{ command, ok, code, output, timedOut, seconds }`.
 *
 * `CI=1` : vitest, jest et d'autres passent en mode « une fois » au lieu de
 * surveiller les fichiers indéfiniment. Une vérification qui dépasse son délai
 * est arrêtée avec tous ses processus enfants, et compte comme un échec.
 */
export function runGate(root, command, timeoutSeconds = 300) {
	const started = Date.now();
	return new Promise((resolve) => {
		const child = spawn(command, {
			cwd: root,
			shell: true,
			env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
			detached: process.platform !== "win32",
			windowsHide: true,
		});
		let output = "";
		const collect = (chunk) => {
			output += chunk;
			if (output.length > MAX_OUTPUT * 4) output = output.slice(-MAX_OUTPUT * 2);
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child.pid);
		}, timeoutSeconds * 1000);
		const finish = (code) => {
			clearTimeout(timer);
			const clean = output.replace(/\u001b\[[0-9;]*m/g, "").trim();
			resolve({
				command,
				ok: !timedOut && code === 0,
				code,
				timedOut,
				output: clean.length > MAX_OUTPUT ? "[…]\n" + clean.slice(-MAX_OUTPUT) : clean,
				seconds: Math.round((Date.now() - started) / 1000),
			});
		};
		child.on("error", () => finish(127));
		child.on("close", (code) => finish(code ?? 1));
	});
}

function killTree(pid) {
	if (!pid) return;
	try {
		if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true });
		else process.kill(-pid, "SIGKILL");
	} catch {
		// Déjà fini.
	}
}
