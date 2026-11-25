// Vérifier le travail en cours : les vérifications du projet, puis les règles apprises.
//
// Utilisé par le hook `Stop` (l'agent dit « fini ») et par `twiceshy check`.

import { createHash } from "node:crypto";
import { isCode } from "./fixes.mjs";
import { workingChange } from "./git.mjs";
import { gatesFor, runGate } from "./gates.mjs";
import { t } from "./i18n.mjs";
import { ask } from "./judge.mjs";
import { CHECK_SCHEMA, checkPrompt } from "./prompts.mjs";
import { readConfig, readRules } from "./store.mjs";

/** Au-delà, le diff est coupé : le juge lit le début, qui suffit à repérer un motif. */
const MAX_DIFF = 60_000;

/** Les règles qui concernent au moins un des fichiers modifiés. */
export function applicableRules(rules, files) {
	const paths = files.map((file) => file.replace(/\\/g, "/"));
	return rules.filter((rule) => {
		if (!rule.scope?.length) return true;
		return rule.scope.some((prefix) => paths.some((path) => path.startsWith(prefix)));
	});
}

export const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/**
 * Vérifie le dépôt tel qu'il est maintenant.
 *
 * Rend `{ skipped, hash, gates, broken, rulesChecked, judgeError }` :
 * - `skipped` : rien à vérifier (aucun changement de code) ;
 * - `gates` : chaque vérification lancée, avec son résultat ;
 * - `broken` : les règles non respectées, avec la preuve et la correction.
 */
export async function checkRepo(root, { onProgress } = {}) {
	const config = readConfig(root);
	const change = workingChange(root);
	const codeFiles = change.files.filter(isCode);
	const hash = hashOf(change.diff);
	if (codeFiles.length === 0) return { skipped: true, hash, gates: [], broken: [], rulesChecked: 0 };

	const gates = [];
	for (const command of gatesFor(root, config)) {
		onProgress?.(command);
		const result = await runGate(root, command, config.gateTimeoutSeconds);
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

	return { skipped: false, hash, gates, broken, rulesChecked: rules.length, judgeError };
}

export const failed = (result) => result.gates.some((gate) => !gate.ok) || result.broken.length > 0;

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
		if (item.rule.why) lines.push("  " + t("ruleWhy", { why: item.rule.why }));
		if (item.hint) lines.push("  " + t("fixHint", { hint: item.hint }));
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
	].join(" · ");
}
