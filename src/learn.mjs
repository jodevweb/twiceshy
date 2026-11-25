// `twiceshy learn` : rassembler des règles, puis prouver qu'elles servent.
//
// Les règles viennent des sources déclarées dans `sources/index.mjs` : tes
// bugs passés, tes corrections aux agents, tes décisions écrites, et demain
// d'autres. Ce module ne connaît aucune source par son nom. Il leur donne
// l'historique lu une seule fois, recueille leurs règles, et les fait toutes
// passer le même examen :
//
// - sur des bugs récents qu'elles n'ont jamais vus : les auraient-elles détectés ?
// - sur des commits récents, acceptés et sains : crient-elles au loup ?
//
// Ce qu'on garde dépend de la politique de la source (voir `sources/index.mjs`) :
// une règle que Twice Shy invente doit avoir détecté un bug ; une règle que tu
// as demandée doit seulement ne pas bloquer du code sain ; une décision écrite
// que le code ne suit plus est signalée comme périmée plutôt qu'imposée.

import { codeCommits, findFixesSmart, splitFixes } from "./fixes.mjs";
import { commitDiff, hasHead, repoRoot } from "./git.mjs";
import { adrDir } from "./decisions.mjs";
import { gateLabel, gatesFor } from "./gates.mjs";
import { t } from "./i18n.mjs";
import { ask as askModel, pool } from "./judge.mjs";
import {
	CALIBRATION_SCHEMA,
	CLASSIFY_SCHEMA,
	HEALTHY_SCHEMA,
	REWRITE_SCHEMA,
	calibrationPrompt,
	classifyPrompt,
	healthyPrompt,
	rewritePrompt,
} from "./prompts.mjs";
import { enabledSources } from "./sources/index.mjs";
import { readConfig, rulesPath, writeRules } from "./store.mjs";
import { bold, dim, green, log, red, step, yellow } from "./term.mjs";

/** Correctifs gardés pour le test. Assez pour qu'un score veuille dire quelque chose, sans y passer l'heure. */
const TEST_FIXES = 12;
/** Correctifs montrés au modèle pour écrire les règles. */
const LEARN_FIXES = 14;
/** Commits récents et sains sur lesquels on mesure les fausses alertes. */
const HEALTHY_COMMITS = 8;
/** Appels au juge en parallèle. */
const PARALLEL = 4;
/** Au-delà de cette part de fausses alertes, une règle bloquerait trop souvent pour rien. */
const MAX_FALSE_RATE = 0.2;

/** La part de fausses alertes d'une règle, sur les correctifs et sur les commits sains. */
export function falseRate(score) {
	const tried = score.tried + score.healthyTried;
	return tried === 0 ? 0 : (score.falseAlarms + score.healthyFlags) / tried;
}

/** Le sort d'une règle d'après la politique de sa source et son score : `keep`, `drop` ou `stale`. */
export function verdict(policy, score) {
	const quiet = falseRate(score) <= MAX_FALSE_RATE;
	if (policy === "proven") return score.caught > 0 && quiet ? "keep" : "drop";
	if (policy === "documented") return quiet ? "keep" : "stale";
	return quiet ? "keep" : "drop";
}

/** Les règles normalisées : du texte non vide, des préfixes de chemin propres. */
export function cleanRules(rules) {
	return (rules ?? [])
		.filter((rule) => typeof rule?.text === "string" && rule.text.trim())
		.map((rule) => ({
			...rule,
			text: rule.text.trim(),
			why: String(rule.why ?? "").trim(),
			scope: (Array.isArray(rule.scope) ? rule.scope : [])
				.map((path) => String(path).trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, ""))
				.filter((path) => path && path !== "all" && path !== "*"),
		}));
}

const emptyScore = () => ({ tried: 0, caught: 0, falseAlarms: 0, healthyTried: 0, healthyFlags: 0, caughtFixes: [] });

/** Fait passer l'examen à des règles : bugs jamais vus, puis commits sains. */
async function examine(ctx, rules, fixes, healthy) {
	const scores = rules.map(emptyScore);
	if (rules.length === 0) return scores;
	const jobs = [...fixes.map((item) => ({ isFix: true, item })), ...healthy.map((item) => ({ isFix: false, item }))];
	await pool(jobs, PARALLEL, async ({ isFix, item }) => {
		try {
			const data = await ctx.ask({
				prompt: isFix ? calibrationPrompt(rules, item) : healthyPrompt(rules, item),
				schema: isFix ? CALIBRATION_SCHEMA : HEALTHY_SCHEMA,
				cwd: ctx.root,
				model: ctx.model,
			});
			const seen = new Set();
			for (const answer of data.verdicts ?? []) {
				const score = scores[answer.rule];
				if (!score || seen.has(answer.rule)) continue;
				seen.add(answer.rule);
				if (isFix) {
					score.tried++;
					if (answer.caughtBefore) {
						score.caught++;
						score.caughtFixes.push(item.sha.slice(0, 8));
					}
					if (answer.flagsAfter) score.falseAlarms++;
				} else {
					score.healthyTried++;
					if (answer.flags) score.healthyFlags++;
				}
			}
		} catch {
			// Un juge muet sur un commit : ce commit ne compte pas, plutôt que de
			// compter comme « rien détecté ».
		}
	});
	return scores;
}

/** Ce qu'on affiche sous une règle : sa preuve, selon d'où elle vient. */
function describe(rule, score, fate) {
	const parts = [];
	if (rule.source.occurrences) parts.push(t("correctedTimes", { count: rule.source.occurrences }));
	if (rule.source.ref) parts.push(t("fromRef", { ref: rule.source.ref }));
	if (score.tried > 0 && (rule.source.policy === "proven" || score.caught > 0)) parts.push(t("caught", { caught: score.caught, tried: score.tried }));
	const alarms = score.falseAlarms + score.healthyFlags;
	if (fate === "stale") parts.push(t("staleDecision", { flags: score.healthyFlags, tried: score.healthyTried }));
	else if (alarms > 0) parts.push(t("falseAlarms", { count: alarms }));
	return parts.join(" · ");
}

/** L'historique dont les sources et l'examen ont besoin, lu une seule fois. */
async function readHistory(ctx) {
	// Le tri des sujets de commit est une lecture rapide : le petit modèle suffit.
	const classify = async (commits) => {
		const data = await ctx.ask({ prompt: classifyPrompt(commits), schema: CLASSIFY_SCHEMA, cwd: ctx.root, model: "haiku" });
		return (data.fixes ?? []).filter((index) => Number.isInteger(index));
	};
	const { fixes, scanned } = await findFixesSmart(ctx.root, classify, { scan: 400, max: TEST_FIXES + LEARN_FIXES + 10 });
	const { learnFrom, testOn, leaked } = splitFixes(fixes, { test: TEST_FIXES });
	const withDiff = (list, maxChars) => list.map((fix) => ({ ...fix, diff: commitDiff(ctx.root, fix.sha, maxChars) }));
	const fixShas = new Set(fixes.map((fix) => fix.sha));
	// Un commit « sain » est un commit que personne n'a dû réparer depuis. Un
	// commit qui n'est pas un correctif, mais dont un correctif plus récent
	// retouche les fichiers, était peut-être justement le bug : le compter comme
	// sain ferait passer pour fausse alerte une règle qui avait raison.
	const recent = codeCommits(ctx.root, 120);
	const healthy = [];
	for (let i = 0; i < recent.length && healthy.length < HEALTHY_COMMITS; i++) {
		const commit = recent[i];
		if (fixShas.has(commit.sha)) continue;
		const repairedLater = recent.slice(0, i).some((newer) => fixShas.has(newer.sha) && newer.files.some((file) => commit.files.includes(file)));
		if (!repairedLater) healthy.push(commit);
	}
	return {
		fixes,
		scanned,
		leaked,
		learnFrom,
		testOn,
		learning: withDiff(learnFrom.slice(0, LEARN_FIXES), 6_000),
		testing: fixes.length >= 2 ? withDiff(testOn, 15_000) : [],
		healthy: withDiff(healthy, 10_000),
	};
}

export async function learn(cwd) {
	const started = Date.now();
	const root = repoRoot(cwd);
	if (!root) throw new Error(t("notRepo"));
	if (!hasHead(root)) throw new Error(t("noHead"));
	const config = readConfig(root);
	const costs = { total: 0 };
	const ctx = {
		root,
		config,
		model: config.model,
		ask: async (options) => {
			const { data, cost } = await askModel(options);
			costs.total += cost;
			return data;
		},
	};
	const sources = enabledSources(config);

	log(bold("Twice Shy") + dim(" · once bitten, twice shy"));
	log();

	let done = step(t("scanning"));
	ctx.history = await readHistory(ctx);
	const { history } = ctx;
	done();
	if (history.fixes.length >= 2) log(dim("  " + (history.leaked ? t("leaked") : t("split", { learn: history.learnFrom.length, test: history.testOn.length }))));

	// Toutes les sources travaillent en même temps ; une source en panne ne
	// prive pas les autres de leurs règles.
	done = step(t("writingRules"));
	const collected = await Promise.all(
		sources.map((source) =>
			source.collect(ctx).then(
				(result) => ({ source, ...result }),
				(error) => ({ source, notes: [`${source.id}: ${error.message}`], rules: [] }),
			),
		),
	);
	const rules = collected.flatMap(({ source, rules: found }) =>
		cleanRules(found).map(({ origin, ...rule }) => ({ ...rule, source: { kind: source.id, policy: source.policy, ...(origin ?? {}) } })),
	);
	done(collected.map(({ source, rules: found }) => `${source.id} ${found.length}`).join(" · "));
	for (const { notes } of collected) for (const note of notes ?? []) log(dim("  " + note));

	if (rules.length === 0) {
		log();
		log(yellow(t("summaryNone")));
		writeRules(root, { version: 3, learnedAt: new Date().toISOString(), model: ctx.model, fixesScanned: history.fixes.length, testedOn: 0, caught: 0, rules: [], stale: [] });
		return;
	}

	done = step(t("testing", { count: rules.length, fixes: history.testing.length, healthy: history.healthy.length }));
	const scores = await examine(ctx, rules, history.testing, history.healthy);
	done();

	// Une seule réécriture, et seulement pour les règles que Twice Shy a
	// inventées (`proven`) : les autres disent ce que quelqu'un a demandé, on ne
	// les réinvente pas. Au-delà d'une réécriture, on finirait par tailler des
	// règles pour ces douze bugs-là, et le score ne dirait plus rien de l'avenir.
	const weak = rules
		.map((rule, index) => ({ rule, index, ...scores[index] }))
		.filter((entry) => entry.rule.source.policy === "proven" && verdict("proven", entry) !== "keep");
	if (weak.length > 0 && history.testing.length > 0) {
		done = step(t("rewriting", { count: weak.length }));
		try {
			const data = await ctx.ask({
				prompt: rewritePrompt(weak.map((w) => ({ ...w, falseAlarms: w.falseAlarms + w.healthyFlags })), history.learning),
				schema: REWRITE_SCHEMA,
				cwd: root,
				model: ctx.model,
				tools: "Read,Grep,Glob",
				timeoutMs: 10 * 60_000,
			});
			const rewritten = new Map();
			for (const entry of data.rules ?? []) {
				const original = weak.find((w) => w.index === entry.index);
				const [clean] = cleanRules([entry]);
				if (clean && original) rewritten.set(entry.index, { ...clean, source: original.rule.source });
			}
			if (rewritten.size > 0) {
				const indexes = [...rewritten.keys()];
				const retest = await examine(ctx, indexes.map((i) => rewritten.get(i)), history.testing, history.healthy);
				const gain = (s) => s.caught - s.falseAlarms - s.healthyFlags;
				indexes.forEach((ruleIndex, k) => {
					// La réécriture ne remplace l'originale que si elle fait mieux.
					if (verdict("proven", retest[k]) === "keep" || gain(retest[k]) > gain(scores[ruleIndex])) {
						rules[ruleIndex] = rewritten.get(ruleIndex);
						scores[ruleIndex] = retest[k];
					}
				});
			}
		} catch {
			// La réécriture est un bonus : sans elle, on garde ce qui a fait ses preuves.
		}
		done();
	}

	const kept = [];
	const stale = [];
	for (const source of sources) {
		const entries = rules.map((rule, index) => ({ rule, score: scores[index] })).filter((e) => e.rule.source.kind === source.id);
		if (entries.length === 0) continue;
		log();
		log(bold(source.title()));
		for (const { rule, score } of entries) {
			const fate = verdict(source.policy, score);
			const mark = fate === "keep" ? green("✓") : fate === "stale" ? yellow("!") : red("✗");
			log(`${mark} ${fate === "drop" ? dim(rule.text) : bold(rule.text)}`);
			const status = fate === "keep" ? green(t("kept")) : fate === "stale" ? yellow(t("stale")) : dim(t("dropped"));
			log(`  ${status} · ${describe(rule, score, fate)}`);
			const stored = { ...rule, score };
			if (fate === "keep") kept.push({ id: `r${kept.length + 1}`, ...stored });
			if (fate === "stale") stale.push(stored);
		}
	}

	const caughtSet = new Set(kept.flatMap((rule) => rule.score.caughtFixes));
	log();
	if (kept.length === 0) log(yellow(t("summaryNone")));
	else {
		const bySource = sources
			.map((source) => [source, kept.filter((rule) => rule.source.kind === source.id).length])
			.filter(([, n]) => n > 0)
			.map(([source, n]) => `${n} ${source.label()}`);
		log(bold(green(t("summaryAll", { rules: kept.length, list: bySource.join(", ") }))));
		if (history.testing.length > 0 && !history.leaked && caughtSet.size > 0) log(green(t("summary", { tried: history.testing.length, caught: caughtSet.size })));
	}
	if (stale.length > 0) log(yellow(t("staleSummary", { count: stale.length })));

	writeRules(root, {
		version: 3,
		learnedAt: new Date().toISOString(),
		model: ctx.model,
		fixesScanned: history.fixes.length,
		testedOn: history.testing.length,
		caught: caughtSet.size,
		leaked: history.leaked,
		rules: kept,
		stale,
	});
	log(dim(t("saved", { path: rulesPath(root).replace(root, ".").replace(/\\/g, "/") })));

	const gates = gatesFor(root, config);
	log(dim(gates.length ? t("gatesFound", { list: gates.map(gateLabel).join(" · ") }) : t("gatesNone")));
	if (!adrDir(root) && config.adr !== false) log(dim(t("adrHint")));
	log(dim(t("cost", { cost: costs.total.toFixed(2) }) + " · " + t("duration", { seconds: Math.round((Date.now() - started) / 1000) })));
}
