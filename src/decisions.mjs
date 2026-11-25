// Tes décisions écrites : les ADR, et les consignes laissées aux agents.
//
// Un ADR (Architecture Decision Record) dit pourquoi le projet a fait un choix.
// `CLAUDE.md` ou `AGENTS.md` disent à l'agent ce qu'il doit respecter. Les deux
// ont le même défaut : ce sont des textes, et rien ne vérifie que le code les
// suit. Twice Shy en tire des règles vérifiables, et signale les décisions que
// le code ne suit plus.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Les dossiers où les équipes rangent leurs ADR, d'après les outils et les usages courants. */
export const ADR_DIRS = [
	"docs/adr",
	"docs/adrs",
	"docs/decisions",
	"docs/architecture/decisions",
	"doc/adr",
	"doc/architecture/decisions",
	"adr",
	"adrs",
	"architecture/decisions",
	"decisions",
];

/** Les consignes aux agents que Twice Shy sait lire. */
const AGENT_FILES = ["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md", ".cursorrules", "GEMINI.md"];

/** Ce qu'un seul document peut peser : au-delà, c'est un manuel, pas une décision. */
const MAX_DOC_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;

/** Le premier dossier d'ADR présent dans le dépôt, ou `null`. */
export function adrDir(root) {
	return ADR_DIRS.find((dir) => {
		try {
			return statSync(join(root, dir)).isDirectory();
		} catch {
			return false;
		}
	}) ?? null;
}

/** Les fichiers d'ADR, hors modèles et index. */
export function adrFiles(root) {
	const dir = adrDir(root);
	if (!dir) return [];
	return readdirSync(join(root, dir))
		.filter((name) => /\.(md|markdown|txt|rst)$/i.test(name))
		.filter((name) => !/^(readme|index|template)/i.test(name) && !/^0+-/.test(name))
		.sort()
		.map((name) => `${dir}/${name}`);
}

/** Le titre d'un ADR : sa première ligne de titre, sinon son nom de fichier. */
function titleOf(path, content) {
	const heading = content.split("\n").find((line) => /^#\s+/.test(line));
	return heading ? heading.replace(/^#+\s*/, "").trim() : path.split("/").pop();
}

/** Tes décisions écrites : `[{ ref, path, content }]`, plus les documents déclarés par le dépôt. */
export function readDecisions(root, extra = []) {
	const docs = [];
	let total = 0;
	const add = (path, ref) => {
		if (total >= MAX_TOTAL_CHARS || !existsSync(join(root, path))) return;
		const content = readFileSync(join(root, path), "utf8").slice(0, MAX_DOC_CHARS);
		if (!content.trim()) return;
		total += content.length;
		docs.push({ ref: ref ?? titleOf(path, content), path, content });
	};
	for (const file of AGENT_FILES) add(file, file);
	for (const file of adrFiles(root)) add(file);
	for (const file of extra) if (typeof file === "string") add(file.replace(/\\/g, "/").replace(/^\.\//, ""));
	return docs;
}

/** Le prochain numéro d'ADR, et le nom de fichier proposé pour un titre. */
export function nextAdrPath(root, title) {
	const dir = adrDir(root) ?? "docs/adr";
	let highest = 0;
	try {
		for (const name of readdirSync(join(root, dir))) {
			const match = name.match(/^(\d+)/);
			if (match) highest = Math.max(highest, Number(match[1]));
		}
	} catch {
		// Pas encore de dossier : ce sera le premier.
	}
	const slug = title
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
	return `${dir}/${String(highest + 1).padStart(4, "0")}-${slug}.md`;
}
