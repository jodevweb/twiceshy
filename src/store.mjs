// Où Twice Shy range ce qu'il sait.
//
// - `.twiceshy/rules.json` et `.twiceshy/config.json`, dans le dépôt : versionnés,
//   donc partagés avec l'équipe et visibles en revue de code.
// - `.git/twiceshy/state.json` : l'état des vérifications de la session en cours
//   (combien d'essais, quel diff a déjà été validé). Propre à la machine, il
//   n'a rien à faire dans l'historique.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gitDir } from "./git.mjs";

function readJson(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, "\t") + "\n");
}

export const rulesPath = (root) => join(root, ".twiceshy", "rules.json");
const configPath = (root) => join(root, ".twiceshy", "config.json");
const statePath = (root) => join(gitDir(root), "twiceshy", "state.json");

/** `{ learnedAt, model, fixes, rules: [...] }`, ou `null` si rien n'a été appris. */
export const readRules = (root) => readJson(rulesPath(root), null);
export const writeRules = (root, value) => writeJson(rulesPath(root), value);

/**
 * La configuration, toute facultative :
 * - `gates` : commandes de vérification ; remplace la détection automatique.
 * - `model` : le modèle du juge (`sonnet` par défaut).
 * - `maxAttempts` : renvois avant de laisser l'agent s'arrêter (3).
 * - `gateTimeoutSeconds` : durée maximale d'une vérification (300).
 * - `enabled` : `false` coupe le hook sans désinstaller le plugin.
 */
export function readConfig(root) {
	return {
		model: "sonnet",
		maxAttempts: 3,
		gateTimeoutSeconds: 300,
		enabled: true,
		...readJson(configPath(root), {}),
	};
}

export const readState = (root) => readJson(statePath(root), {});
export const writeState = (root, value) => writeJson(statePath(root), value);
