// `twiceshy learn` : tirer des règles des bugs déjà corrigés, et prouver qu'elles servent.
//
// 1. Retrouver les correctifs de l'historique.
// 2. Les séparer : les anciens pour écrire les règles, les récents pour les tester.
// 3. Tester chaque règle dans les deux sens : détecte-t-elle le bug, crie-t-elle
//    au loup sur le code corrigé ?
// 4. Réécrire une fois celles qui échouent, les retester, supprimer celles qui
//    échouent encore.
//
// Personne n'a à lire de rapport : ce qui est gardé est ce qui a fait ses
// preuves sur des bugs que la règle n'avait jamais vus.

import { commitDiff, hasHead, repoRoot } from "./git.mjs";
import { findFixesSmart, splitFixes } from "./fixes.mjs";
import { gatesFor } from "./gates.mjs";
import { t } from "./i18n.mjs";
import { ask, pool } from "./judge.mjs";
import {
	CALIBRATION_SCHEMA,
	CLASSIFY_SCHEMA,
	PROPOSE_SCHEMA,
	REWRITE_SCHEMA,
	calibrationPrompt,
	classifyPrompt,
	proposePrompt,
	rewritePrompt,
} from "./prompts.mjs";
import { readConfig, rulesPath, writeRules } from "./store.mjs";
import { bold, dim, green, log, red, step, yellow } from "./term.mjs";

/** Correctifs gardés pour le test. Assez pour qu'un score veuille dire quelque chose, sans y passer l'heure. */
const TEST_FIXES = 12;
/** Correctifs montrés au modèle pour écrire les règles. */
const LEARN_FIXES = 14;
/** Appels au juge en parallèle. */
const PARALLEL = 4;

/**
 * Une règle se garde si elle a détecté au moins un bug qu'elle n'avait pas vu,
 * et si ses fausses alertes restent rares : une règle qui bloque du code sain
 * une fois sur quatre coûte plus qu'elle ne rapporte.
 */
export function worthKeeping(score) {
	if (score.tried === 0 || score.caught === 0) return false;
	return score.falseAlarms <= score.caught && score.falseAlarms / score.tried <= 0.25;
}

/** Les règles normalisées : du texte non vide, des préfixes de chemin propres. */
export function cleanRules(rules) {
	return (rules ?? [])
		.filter((rule) => typeof rule?.text === "string" && rule.text.trim())
		.map((rule) => ({
			text: rule.text.trim(),
			why: String(rule.why ?? "").trim(),
			scope: (Array.isArray(rule.scope) ? rule.scope : [])
				.map((path) => String(path).trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, ""))
				.filter((path) => path && path !== "all" && path !== "*"),
		}));
}

/** Teste des règles sur des correctifs. Rend un score par règle, et ce que chacune a détecté. */
async function calibrate(root, rules, fixes, model, costs) {
	const scores = rules.map(() => ({ tried: 0, caught: 0, falseAlarms: 0, caughtFixes: [] }));
	await pool(fixes, PARALLEL, async (fix) => {
		try {
			const { data, cost } = await ask({ prompt: calibrationPrompt(rules, fix), schema: CALIBRATION_SCHEMA, cwd: root, model });
			costs.total += cost;
			const answered = new Set();
			for (const verdict of data.verdicts ?? []) {
				const score = scores[verdict.rule];
				if (!score || answered.has(verdict.rule)) continue;
				answered.add(verdict.rule);
				score.tried++;
				if (verdict.caughtBefore) {
					score.caught++;
					score.caughtFixes.push(fix.sha.slice(0, 8));
				}
				if (verdict.flagsAfter) score.falseAlarms++;
			}
		} catch {
			// Un juge muet sur un correctif : ce correctif ne compte pas, plutôt que
			// de compter comme « rien détecté ».
		}
	});
	return scores;
}

function describe(score) {
	const parts = [t("caught", { caught: score.caught, tried: score.tried })];
	if (score.falseAlarms) parts.push(t("falseAlarms", { count: score.falseAlarms }));
	return parts.join(", ");
}

export async function learn(cwd) {
	const started = Date.now();
	const root = repoRoot(cwd);
	if (!root) throw new Error(t("notRepo"));
	if (!hasHead(root)) throw new Error(t("noHead"));
	const config = readConfig(root);
	const model = config.model;
	const costs = { total: 0 };

	log(bold("Twice Shy") + dim(" · once bitten, twice shy"));
	log();

	let done = step(t("scanning"));
	// Le tri des sujets est une lecture rapide : le petit modèle suffit.
	const classify = async (commits) => {
		const { data, cost } = await ask({ prompt: classifyPrompt(commits), schema: CLASSIFY_SCHEMA, cwd: root, model: "haiku" });
		costs.total += cost;
		return (data.fixes ?? []).filter((index) => Number.isInteger(index));
	};
	const { fixes, scanned } = await findFixesSmart(root, classify, { scan: 400, max: TEST_FIXES + LEARN_FIXES + 10 });
	done(t("foundFixes", { count: fixes.length, scan: scanned }));
	if (fixes.length < 2) {
		log(yellow(t("notEnoughFixes", { count: fixes.length })));
		return;
	}

	const { learnFrom, testOn, leaked } = splitFixes(fixes, { test: TEST_FIXES });
	if (leaked) log(yellow("  " + t("leaked")));
	else log(dim("  " + t("split", { learn: learnFrom.length, test: testOn.length })));

	const withDiff = (list, maxChars) => list.map((fix) => ({ ...fix, diff: commitDiff(root, fix.sha, maxChars) }));
	const learning = withDiff(learnFrom.slice(0, LEARN_FIXES), 6_000);
	const testing = withDiff(testOn, 15_000);

	done = step(t("proposing"));
	const proposal = await ask({
		prompt: proposePrompt(learning),
		schema: PROPOSE_SCHEMA,
		cwd: root,
		model,
		tools: "Read,Grep,Glob",
		timeoutMs: 10 * 60_000,
	});
	costs.total += proposal.cost;
	let rules = cleanRules(proposal.data.rules).slice(0, 8);
	done(t("proposed", { count: rules.length }));

	done = step(t("testing", { count: testing.length }));
	let scores = await calibrate(root, rules, testing, model, costs);
	done();

	// Une seule réécriture : au-delà, on finirait par écrire des règles taillées
	// pour ces douze bugs-là, et le score ne dirait plus rien de l'avenir.
	const weak = rules.map((rule, index) => ({ rule, index, ...scores[index] })).filter((entry) => !worthKeeping(entry));
	if (weak.length > 0) {
		done = step(t("rewriting", { count: weak.length }));
		try {
			const rewrite = await ask({
				prompt: rewritePrompt(weak, learning),
				schema: REWRITE_SCHEMA,
				cwd: root,
				model,
				tools: "Read,Grep,Glob",
				timeoutMs: 10 * 60_000,
			});
			costs.total += rewrite.cost;
			const rewritten = new Map();
			for (const entry of rewrite.data.rules ?? []) {
				const [clean] = cleanRules([entry]);
				if (clean && weak.some((w) => w.index === entry.index)) rewritten.set(entry.index, clean);
			}
			if (rewritten.size > 0) {
				const indexes = [...rewritten.keys()];
				const retest = await calibrate(root, indexes.map((i) => rewritten.get(i)), testing, model, costs);
				indexes.forEach((ruleIndex, k) => {
					// La réécriture ne remplace l'originale que si elle fait mieux.
					const before = scores[ruleIndex];
					const after = retest[k];
					if (worthKeeping(after) || after.caught - after.falseAlarms > before.caught - before.falseAlarms) {
						rules[ruleIndex] = rewritten.get(ruleIndex);
						scores[ruleIndex] = after;
					}
				});
			}
		} catch {
			// La réécriture est un bonus : sans elle, on garde ce qui a fait ses preuves.
		}
		done();
	}

	log();
	const kept = [];
	rules.forEach((rule, index) => {
		const score = scores[index];
		const keep = worthKeeping(score);
		const mark = keep ? green("✓") : red("✗");
		const status = keep ? green(t("kept")) : dim(t("dropped"));
		log(`${mark} ${keep ? bold(rule.text) : dim(rule.text)}`);
		log(`  ${status} · ${describe(score)}${rule.scope.length ? dim(" · " + rule.scope.join(", ")) : ""}`);
		if (keep) {
			kept.push({
				id: `r${kept.length + 1}`,
				...rule,
				score: { tried: score.tried, caught: score.caught, falseAlarms: score.falseAlarms, caughtFixes: score.caughtFixes },
			});
		}
	});

	const tried = testing.length;
	const caughtSet = new Set(kept.flatMap((rule) => rule.score.caughtFixes));
	log();
	if (kept.length > 0) log(bold(green(t("summary", { tried, caught: caughtSet.size }))));
	else log(yellow(t("summaryNone")));

	writeRules(root, {
		version: 1,
		learnedAt: new Date().toISOString(),
		model,
		fixesScanned: fixes.length,
		testedOn: tried,
		caught: caughtSet.size,
		leaked,
		rules: kept,
	});
	log(dim(t("saved", { path: rulesPath(root).replace(root, ".").replace(/\\/g, "/") })));

	const gates = gatesFor(root, config);
	log(dim(gates.length ? t("gatesFound", { list: gates.join(" · ") }) : t("gatesNone")));
	log(dim(t("cost", { cost: costs.total.toFixed(2) }) + " · " + t("duration", { seconds: Math.round((Date.now() - started) / 1000) })));
}
