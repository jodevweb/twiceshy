// Vérifier le travail en cours : les vérifications du projet, les règles
// apprises, et les décisions que l'agent a prises sans les écrire.
//
// Utilisé par le hook `Stop` (l'agent dit « fini ») et par `twiceshy check`.

import { createHash } from "node:crypto";
import { adrDir, nextAdrPath } from "./decisions.mjs";
import { addedDependencies } from "./deps.mjs";
import { isCode } from "./fixes.mjs";
import { workingChange } from "./git.mjs";
import { gateConcerns, gatesFor, runGate } from "./gates.mjs";
import { t } from "./i18n.mjs";
import { ask } from "./judge.mjs";
import { CHECK_SCHEMA, checkPrompt } from "./prompts.mjs";
import { readConfig, readRules } from "./store.mjs";

/** Au-delà, le diff est coupé : le juge lit le début, qui suffit à repérer un motif. */
const MAX_DIFF = 60_000;

/** Les règles qui concernent au moins un des fichiers modifiés. */
export function applicableRules(rules, files) {
	const paths = files.map((file) => file.replace(/\\/g, "/"));
	return rules.filter((rule) => !rule.scope?.length || rule.scope.some((prefix) => paths.some((path) => path.startsWith(prefix))));
}

export const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/**
 * Faut-il exiger un ADR pour une nouvelle dépendance ? `adr` vaut `"auto"` par
 * défaut : oui si le dépôt a un dossier d'ADR, sinon non. Imposer des ADR à une
 * équipe qui n'en écrit pas, ce serait bloquer l'agent pour une habitude que
 * personne n'a choisie ; `/twiceshy:adr` crée le dossier et active la règle.
 */
export function adrRequired(root, config) {
	if (config.adr === true) return true;
	if (config.adr === false) return false;
	return adrDir(root) !== null;
}

/**
 * Les dépendances ajoutées sans ADR. Un ADR ajouté ou modifié dans le même
 * changement, qui nomme la dépendance, suffit.
 */
export function undocumentedDependencies(root, change, config) {
	if (!adrRequired(root, config)) return [];
	const deps = addedDependencies(root, change.files);
	if (deps.length === 0) return [];
	const dir = adrDir(root) ?? "docs/adr";
	const adrText = change.diff
		.split(/^diff --git /m)
		.filter((chunk) => chunk.includes(` b/${dir}/`))
		.join("\n")
		.toLowerCase();
	return deps.filter((dep) => !adrText.includes(dep.name.toLowerCase()));
}

/**
 * Vérifie le dépôt tel qu'il est maintenant.
 *
 * Rend `{ skipped, hash, gates, broken, deps, rulesChecked, judgeError }` :
 * - `skipped` : rien à vérifier (aucun changement de code) ;
 * - `gates` : chaque vérification lancée, avec son résultat ;
 * - `broken` : les règles non respectées, avec la preuve et la correction ;
 * - `deps` : les dépendances ajoutées sans ADR, et où l'écrire.
 */
export async function checkRepo(root, { onProgress } = {}) {
	const config = readConfig(root);
	const change = workingChange(root);
	const codeFiles = change.files.filter(isCode);
	const hash = hashOf(change.diff);
	const depsMissing = undocumentedDependencies(root, change, config);
	if (codeFiles.length === 0 && depsMissing.length === 0) return { skipped: true, hash, gates: [], broken: [], deps: null, rulesChecked: 0 };

	const gates = [];
	for (const gate of gatesFor(root, config).filter((g) => gateConcerns(g, change.files))) {
		onProgress?.(gate.dir ? `${gate.dir}: ${gate.command}` : gate.command);
		const result = await runGate(root, gate, config.gateTimeoutSeconds);
		gates.push(result);
		// Les types ou le lint en échec : inutile d'attendre la suite de tests,
		// l'agent a déjà de quoi corriger.
		if (!result.ok) break;
	}

	const learned = readRules(root);
	const rules = applicableRules(learned?.rules ?? [], codeFiles);
	let broken = [];
	let judgeError = null;
	if (rules.length > 0) {
		onProgress?.("rules");
		const diff = change.diff.length > MAX_DIFF ? change.diff.slice(0, MAX_DIFF) + "\n[…]\n" : change.diff;
		try {
			const { data } = await ask({ prompt: checkPrompt(rules, diff), schema: CHECK_SCHEMA, cwd: root, model: config.model });
			broken = (data.verdicts ?? [])
				.filter((verdict) => verdict.broken && rules[verdict.rule])
				.map((verdict) => ({ rule: rules[verdict.rule], evidence: verdict.evidence, hint: verdict.hint }));
		} catch (error) {
			judgeError = error.message;
		}
	}

	const deps =
		depsMissing.length > 0
			? { list: depsMissing.map((dep) => dep.name), path: nextAdrPath(root, `use ${depsMissing.map((dep) => dep.name).join(" ")}`) }
			: null;
	return { skipped: false, hash, gates, broken, deps, rulesChecked: rules.length, judgeError };
}

export const failed = (result) => result.gates.some((gate) => !gate.ok) || result.broken.length > 0 || Boolean(result.deps);

/** D'où vient une règle, en une ligne : c'est ce qui la rend légitime aux yeux de l'agent. */
function originOf(rule) {
	if (rule.source?.kind === "decisions") return t("fromRef", { ref: rule.source.ref });
	if (rule.source?.kind === "corrections") return rule.source.quote ? `« ${rule.source.quote} »` : "";
	return rule.why ? t("ruleWhy", { why: rule.why }) : "";
}

/** Le message renvoyé à l'agent : ce qui ne va pas, la preuve, comment corriger. */
export function agentReport(result) {
	const lines = [t("blockedTitle"), t("blockedIntro"), ""];
	for (const gate of result.gates.filter((g) => !g.ok)) {
		lines.push(
			gate.timedOut ? t("gateTimeout", { command: gate.command, seconds: gate.seconds }) : t("gateFailed", { command: gate.command, code: gate.code }),
		);
		if (gate.output) lines.push("```", gate.output, "```");
		lines.push("");
	}
	for (const item of result.broken) {
		lines.push(t("ruleBroken", { text: item.rule.text }));
		if (item.evidence) lines.push(`  ${item.evidence}`);
		const origin = originOf(item.rule);
		if (origin) lines.push(`  ${origin}`);
		if (item.hint) lines.push("  " + t("fixHint", { hint: item.hint }));
		lines.push("");
	}
	if (result.deps) {
		const list = result.deps.list.join(", ");
		lines.push(t("depsTitle", { list }));
		lines.push("  " + t("depsAsk", { path: result.deps.path, list }));
		lines.push("");
	}
	lines.push(t("blockedOutro"));
	return lines.join("\n");
}

/** Une ligne pour l'humain : ce qui reste en échec. */
export function shortProblems(result) {
	return [
		...result.gates.filter((g) => !g.ok).map((g) => g.command),
		...result.broken.map((item) => item.rule.text),
		...(result.deps ? [t("depsTitle", { list: result.deps.list.join(", ") })] : []),
	].join(" · ");
}
