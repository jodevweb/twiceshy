// Les dépendances qu'un changement ajoute.
//
// Ajouter une dépendance est la décision d'architecture la plus fréquente
// d'un agent, et la moins expliquée : la bibliothèque arrive dans le
// manifeste, personne ne sait pourquoi celle-là, ni ce qu'on avait déjà pour
// le même besoin. C'est le moment où un ADR sert le plus, et c'est un signal
// objectif.
//
// On compare la liste des dépendances du manifeste au dernier commit et
// maintenant, plutôt que de lire les lignes du diff : un agent qui réécrit un
// `package.json` sur une seule ligne ne doit pas passer entre les mailles.
// Une version changée n'est pas une nouvelle dépendance.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.mjs";

function jsonKeys(content, sections, ignore = () => false) {
	try {
		const data = JSON.parse(content);
		return sections.flatMap((section) => Object.keys(data?.[section] ?? {})).filter((name) => !ignore(name));
	} catch {
		return [];
	}
}

const matches = (content, pattern) => [...content.matchAll(pattern)].map((m) => m[1]);

/** Les dépendances déclarées dans un manifeste, d'après son nom et son contenu. */
const EXTRACTORS = [
	{ file: /(^|\/)package\.json$/, names: (c) => jsonKeys(c, ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) },
	{ file: /(^|\/)composer\.json$/, names: (c) => jsonKeys(c, ["require", "require-dev"], (n) => n === "php" || n.startsWith("ext-")) },
	{ file: /(^|\/)requirements[^/]*\.txt$/, names: (c) => matches(c, /^\s*([A-Za-z0-9][\w.-]*)\s*(?:\[[^\]]*\])?\s*(?:[=<>!~]=?.*)?$/gm) },
	{
		file: /(^|\/)pyproject\.toml$/,
		names: (c) => [
			// PEP 621 : des chaînes dans des listes (`dependencies = ["httpx>=0.27"]`).
			...matches(c, /["']([A-Za-z0-9][\w.-]*)\s*(?:\[[^\]]*\])?\s*(?:[=<>!~]=?[^"']*)?["']\s*,?/g).filter((n) => !/^\d/.test(n)),
			// Poetry : `httpx = "^0.27"` dans une section de dépendances.
			...sectionNames(c, /^\[tool\.poetry\.(?:[\w.-]+\.)?dependencies\]/),
		].filter((n) => n !== "python"),
	},
	{ file: /(^|\/)go\.mod$/, names: (c) => matches(c, /^\s*(?:require\s+)?([\w.-]+\.[a-z]{2,}\/[\w./-]+)\s+v\d/gm) },
	{ file: /(^|\/)Cargo\.toml$/, names: (c) => sectionNames(c, /^\[(?:[\w.-]+\.)?(?:dev-|build-)?dependencies\]/) },
	{ file: /(^|\/)Gemfile$/, names: (c) => matches(c, /^\s*gem\s+["']([\w.-]+)["']/gm) },
];

/** Les clés `nom = …` des sections TOML dont l'en-tête correspond. */
function sectionNames(content, header) {
	const names = [];
	let inside = false;
	for (const line of content.split("\n")) {
		if (/^\s*\[/.test(line)) {
			inside = header.test(line.trim());
			continue;
		}
		const match = inside && line.match(/^\s*([A-Za-z0-9][\w-]*)\s*=/);
		if (match) names.push(match[1]);
	}
	return names;
}

/** Les dépendances d'un manifeste, ou `null` si ce fichier n'en est pas un. */
export function dependenciesOf(file, content) {
	const extractor = EXTRACTORS.find((entry) => entry.file.test(file.replace(/\\/g, "/")));
	return extractor ? new Set(extractor.names(content ?? "").map((name) => name.toLowerCase())) : null;
}

/** Les dépendances ajoutées entre deux versions d'un manifeste. */
export function newDependencies(file, before, after) {
	const old = dependenciesOf(file, before);
	const now = dependenciesOf(file, after);
	if (!now) return [];
	return [...now].filter((name) => !old.has(name));
}

/** Les dépendances ajoutées dans le dépôt depuis le dernier commit : `[{ name, manifest }]`. */
export function addedDependencies(root, files) {
	const added = [];
	for (const file of files) {
		if (!dependenciesOf(file, "")) continue;
		const before = git(root, ["show", `HEAD:${file.replace(/\\/g, "/")}`]) ?? "";
		let after = "";
		try {
			after = readFileSync(join(root, file), "utf8");
		} catch {
			continue;
		}
		for (const name of newDependencies(file, before, after)) added.push({ name, manifest: file });
	}
	return added;
}
