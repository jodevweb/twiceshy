// Poser une question à Claude, en une fois, avec une réponse structurée.
//
// Twice Shy n'a pas de clé API : il passe par le `claude` déjà installé et
// connecté sur la machine, en mode non interactif (`claude -p`). Trois
// précautions pour cet appel imbriqué :
//
// - `TWICESHY_JUDGE=1` et `disableAllHooks` : le juge est lui-même une session
//   Claude Code. Sans ça, en s'arrêtant, il déclencherait le hook de Twice Shy,
//   qui relancerait un juge, et ainsi de suite.
// - `CLAUDECODE` retiré de l'environnement : la variable dit « tu tournes dans
//   Claude Code », et le hook en hérite.
// - aucune modification possible : le juge lit, il n'écrit jamais.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

let resolved;

const SYSTEM =
	"You are Twice Shy's reviewer. You read code and diffs from a git repository and answer precisely, " +
	"in the requested structured format. You never modify anything. When you may read the repository, " +
	"read only the few files you need: be quick.";

/** Le binaire `claude`, ou une erreur claire s'il n'est pas installé. */
function claudeBinary() {
	if (resolved !== undefined) return resolved;
	if (process.env.TWICESHY_CLAUDE) return (resolved = process.env.TWICESHY_CLAUDE);
	const finder = process.platform === "win32" ? "where" : "which";
	const out = spawnSync(finder, ["claude"], { encoding: "utf8", windowsHide: true });
	const candidates = (out.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	// Sous Windows, l'installeur natif pose `claude.exe` et npm un `claude.cmd`.
	// On préfère l'exécutable : un `.cmd` exige un shell, et ses guillemets
	// abîmeraient le schéma JSON passé en argument.
	resolved =
		candidates.find((path) => /\.exe$/i.test(path)) ??
		candidates.find((path) => existsSync(path)) ??
		null;
	return resolved;
}

/**
 * Pose `prompt` et rend `{ data, cost }`, où `data` respecte `schema`.
 *
 * `tools` : outils en lecture que le juge peut utiliser (`Read,Grep,Glob`),
 * ou rien. `cwd` : le dépôt, pour qu'il puisse le lire.
 */
export function ask({ prompt, schema, cwd, model = "sonnet", tools = "", timeoutMs = 5 * 60_000 }) {
	const binary = claudeBinary();
	if (!binary) {
		return Promise.reject(new Error("`claude` introuvable dans le PATH (Claude Code doit être installé)"));
	}
	const viaShell = /\.(cmd|bat)$/i.test(binary);
	// Une session Claude Code ordinaire charge tout ce que l'utilisateur a
	// installé : ses consignes globales, ses skills, ses serveurs MCP. Pour un
	// juge, c'est du bruit, et c'est cher : mesuré le 25 novembre 2026, un appel
	// passait de 0,074 $ à 0,005 $ en les coupant. Le juge reçoit donc une
	// consigne courte, aucune configuration, aucun skill, aucun MCP.
	const args = [
		"-p",
		"--output-format",
		"json",
		"--no-session-persistence",
		"--permission-mode",
		"default",
		"--system-prompt",
		SYSTEM,
		"--setting-sources",
		"",
		"--disable-slash-commands",
		"--strict-mcp-config",
		"--settings",
		JSON.stringify({ disableAllHooks: true }),
		"--tools",
		tools,
		"--disallowedTools",
		"Write,Edit,MultiEdit,NotebookEdit,Bash",
	];
	if (model) args.push("--model", model);
	// Un juge qui explore le dépôt peut s'y perdre : un plafond par appel évite
	// qu'un `learn` coûte dix fois le prix annoncé.
	if (tools) args.push("--max-budget-usd", "1");
	// Le schéma ne passe pas par un `.cmd` sans dommage : dans ce cas, il est
	// dans le prompt et la réponse est relue comme du JSON dans le texte.
	if (!viaShell) args.push("--json-schema", JSON.stringify(schema));
	const fullPrompt = viaShell
		? `${prompt}\n\nAnswer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(schema)}`
		: prompt;

	const env = { ...process.env, TWICESHY_JUDGE: "1" };
	delete env.CLAUDECODE;
	delete env.CLAUDE_CODE_ENTRYPOINT;

	return new Promise((resolve, reject) => {
		const child = spawn(viaShell ? `"${binary}"` : binary, viaShell ? args.map(quoteForCmd) : args, {
			cwd,
			env,
			shell: viaShell,
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`pas de réponse après ${Math.round(timeoutMs / 1000)} s`));
		}, timeoutMs);
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", () => {
			clearTimeout(timer);
			try {
				resolve(parseResult(stdout));
			} catch (error) {
				reject(new Error(`${error.message}${stderr ? ` · ${stderr.trim().slice(0, 300)}` : ""}`));
			}
		});
		child.stdin.end(fullPrompt);
	});
}

function quoteForCmd(arg) {
	return /[\s"{}&|<>^]/.test(arg) || arg === "" ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** Relit la sortie JSON de `claude -p`. */
export function parseResult(stdout) {
	const text = stdout.trim();
	let envelope;
	try {
		envelope = JSON.parse(text);
	} catch {
		const first = text.indexOf("{");
		envelope = first >= 0 ? JSON.parse(text.slice(first)) : null;
	}
	if (!envelope) throw new Error("réponse illisible");
	if (envelope.is_error) throw new Error(String(envelope.result ?? envelope.subtype ?? "erreur").slice(0, 300));
	const cost = Number(envelope.total_cost_usd ?? 0);
	if (envelope.structured_output && typeof envelope.structured_output === "object") {
		return { data: envelope.structured_output, cost };
	}
	return { data: extractJson(String(envelope.result ?? "")), cost };
}

/** Le premier objet JSON complet d'un texte, éventuellement dans un bloc ```json. */
export function extractJson(text) {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1] : text;
	const first = body.indexOf("{");
	if (first < 0) throw new Error("aucun JSON dans la réponse");
	let depth = 0;
	let inString = false;
	for (let i = first; i < body.length; i++) {
		const c = body[i];
		if (inString) {
			if (c === "\\") i++;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return JSON.parse(body.slice(first, i + 1));
	}
	throw new Error("JSON incomplet dans la réponse");
}

/** Lance des tâches avec au plus `limit` en parallèle, en gardant l'ordre des résultats. */
export async function pool(items, limit, worker) {
	const results = new Array(items.length);
	let next = 0;
	const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(lanes);
	return results;
}
