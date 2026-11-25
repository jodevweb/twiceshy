// Tes corrections dans les sessions Claude Code passées.
//
// Beaucoup de développeurs ne retouchent plus le code à la main : ils
// corrigent l'agent en lui parlant. « Non, passe par le service, pas par
// fetch. » « Encore un any, je t'ai dit de typer. » Ces phrases sont des règles
// que personne n'a écrites, et l'agent suivant les ignore.
//
// Claude Code garde chaque session dans `~/.claude/projects/<dossier>/*.jsonl`,
// le dossier portant le chemin du projet où chaque caractère qui n'est ni une
// lettre ni un chiffre devient `-`. On y lit tes messages, avec la fin de la
// réponse de l'agent qui les précède, pour savoir ce que tu corrigeais.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const projectsDir = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

/** Le nom du dossier de sessions d'un projet, tel que Claude Code le forme. */
export const sessionKey = (root) => root.replace(/[^a-zA-Z0-9]/g, "-");

/** Sessions lues au plus : les plus récentes disent le mieux ce que tu attends aujourd'hui. */
const MAX_SESSIONS = 60;
/** Messages gardés au plus, les plus récents d'abord. */
const MAX_MESSAGES = 400;

/** Le texte d'un message, qu'il soit une chaîne ou une liste de blocs. */
function textOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

/**
 * Un message humain digne d'intérêt : ni une commande, ni une sortie d'outil,
 * ni un rappel injecté par le système (ceux-là commencent par une balise).
 */
function isHumanText(text) {
	const trimmed = text.trim();
	return trimmed.length >= 6 && trimmed.length <= 4000 && !trimmed.startsWith("<") && !trimmed.startsWith("Caveat:");
}

/**
 * Tes messages dans les sessions passées de ce projet, du plus récent au plus
 * ancien : `[{ text, before, date, session }]`, où `before` est la fin de ce que
 * l'agent venait de dire.
 */
export function readSessions(root) {
	const base = projectsDir();
	if (!existsSync(base)) return [];
	const key = sessionKey(root).toLowerCase();
	// Les worktrees d'un projet ont leur propre dossier, dont le nom commence par celui du projet.
	const dirs = readdirSync(base).filter((name) => {
		const lower = name.toLowerCase();
		return lower === key || lower.startsWith(key + "-");
	});
	const files = dirs
		.flatMap((dir) => {
			try {
				return readdirSync(join(base, dir))
					.filter((name) => name.endsWith(".jsonl"))
					.map((name) => join(base, dir, name));
			} catch {
				return [];
			}
		})
		.map((path) => ({ path, mtime: statSync(path).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, MAX_SESSIONS);

	const messages = [];
	for (const { path } of files) {
		let lastAgent = "";
		const session = path.split(/[\\/]/).pop().replace(/\.jsonl$/, "");
		const lines = readFileSync(path, "utf8").split("\n");
		const fromFile = [];
		for (const line of lines) {
			if (!line) continue;
			let entry;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			if (entry.type === "assistant") {
				const text = textOf(entry.message?.content);
				if (text.trim()) lastAgent = text;
				continue;
			}
			if (entry.type !== "user" || entry.isMeta || entry.isSidechain) continue;
			const text = textOf(entry.message?.content);
			if (!isHumanText(text)) continue;
			fromFile.push({
				text: text.trim().slice(0, 600),
				before: lastAgent.trim().slice(-400),
				date: String(entry.timestamp ?? "").slice(0, 10),
				session,
			});
		}
		messages.push(...fromFile.reverse());
		if (messages.length >= MAX_MESSAGES) break;
	}
	return messages.slice(0, MAX_MESSAGES);
}
