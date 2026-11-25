#!/usr/bin/env node
// Twice Shy : once bitten, twice shy.
//
//   twiceshy learn      tirer des règles du dépôt et les mettre à l'épreuve
//   twiceshy check      vérifier le travail en cours, comme le ferait le hook
//   twiceshy status     ce que Twice Shy sait de ce dépôt
//   twiceshy adr [init] les ADR du dépôt ; `init` crée le dossier et son modèle
//   twiceshy hook       le hook `Stop` de Claude Code (lit son JSON sur l'entrée standard)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { learn } from "../src/learn.mjs";
import { agentReport, checkRepo, failed } from "../src/check.mjs";
import { adrDir, adrFiles } from "../src/decisions.mjs";
import { stopHook } from "../src/hook.mjs";
import { repoRoot } from "../src/git.mjs";
import { gateLabel, gatesFor } from "../src/gates.mjs";
import { t, LANG } from "../src/i18n.mjs";
import { SOURCES } from "../src/sources/index.mjs";
import { readConfig, readRules } from "../src/store.mjs";
import { bold, dim, green, log, red, step, yellow } from "../src/term.mjs";

const HELP = `Twice Shy · once bitten, twice shy

  twiceshy learn       learn rules from your bugs, corrections and decisions, and test them
  twiceshy check       check the current changes, like the Stop hook does
  twiceshy status      what Twice Shy knows about this repository
  twiceshy adr [init]  list the ADRs; init creates the folder and a template
  twiceshy hook        Claude Code Stop hook (reads its JSON on stdin)
`;

function rootOf(cwd) {
	const root = repoRoot(cwd);
	if (!root) throw new Error(t("notRepo"));
	return root;
}

async function status(cwd) {
	const root = rootOf(cwd);
	const learned = readRules(root);
	log(bold(t("status", { repo: root.replace(/\\/g, "/").split("/").pop() })));
	if (!learned?.rules?.length) log(dim(t("statusNoRules")));
	else {
		log(dim(t("statusLearned", { date: learned.learnedAt.slice(0, 10), fixes: learned.fixesScanned, model: learned.model })));
		if (learned.testedOn && learned.caught) log(green(t("summary", { tried: learned.testedOn, caught: learned.caught })));
		for (const source of SOURCES) {
			const rules = learned.rules.filter((rule) => (rule.source?.kind ?? "bugs") === source.id);
			if (rules.length === 0) continue;
			log();
			log(bold(source.title()));
			for (const rule of rules) {
				log(`${green("✓")} ${rule.text}`);
				const proof = [];
				if (rule.source?.occurrences) proof.push(t("correctedTimes", { count: rule.source.occurrences }));
				if (rule.source?.ref) proof.push(t("fromRef", { ref: rule.source.ref }));
				if (rule.score?.caught) proof.push(t("caught", { caught: rule.score.caught, tried: rule.score.tried }));
				if (rule.scope?.length) proof.push(rule.scope.join(", "));
				if (proof.length) log(dim(`  ${proof.join(" · ")}`));
			}
		}
		for (const rule of learned.stale ?? []) log(yellow(`! ${rule.text} · ${t("stale")}${rule.source?.ref ? " · " + t("fromRef", { ref: rule.source.ref }) : ""}`));
	}
	log();
	const config = readConfig(root);
	const gates = gatesFor(root, config);
	log(dim(gates.length ? t("gatesFound", { list: gates.map(gateLabel).join(" · ") }) : t("gatesNone")));
	const dir = adrDir(root);
	log(dim(dir ? t("adrStatus", { count: adrFiles(root).length, dir }) : t("adrNone")));
}

async function check(cwd) {
	const root = rootOf(cwd);
	let done = null;
	const result = await checkRepo(root, {
		onProgress: (what) => {
			done?.();
			done = step(what);
		},
	});
	done?.();
	if (result.skipped) return log(dim(t("passedNothing")));
	if (result.judgeError) log(red(t("judgeFailed", { error: result.judgeError })));
	if (!failed(result)) return log(green(t("passed", { gates: result.gates.length, rules: result.rulesChecked })));
	log(agentReport(result));
	process.exitCode = 1;
}

/** Le modèle d'ADR : le format court de Michael Nygard, avec les alternatives écartées. */
const TEMPLATE = {
	en: `# NNNN. Title of the decision

Date: YYYY-MM-DD
Status: Accepted

## Context

What forces us to decide, in a few lines.

## Decision

What we do.

## Alternatives considered

What we did not choose, and why.

## Consequences

What becomes easier, what becomes harder.
`,
	fr: `# NNNN. Titre de la décision

Date : AAAA-MM-JJ
Statut : Acceptée

## Contexte

Ce qui oblige à décider, en quelques lignes.

## Décision

Ce qu'on fait.

## Alternatives envisagées

Ce qu'on n'a pas choisi, et pourquoi.

## Conséquences

Ce qui devient plus simple, ce qui devient plus difficile.
`,
};

const FIRST = {
	en: (date) => `# 0001. Record architecture decisions

Date: ${date}
Status: Accepted

## Context

Coding agents write a growing share of this code. They start every session without knowing why the code is the way it is, and they make decisions (a new dependency, a new structure) that nobody writes down.

## Decision

We record architecture decisions in this folder, one file per decision, using 0000-template.md. Twice Shy checks the code against them, and asks the agent to write one when it adds a dependency.

## Alternatives considered

Comments in the code, or a wiki: neither is read by agents nor checked against the code.

## Consequences

Each decision has a reason anyone can read. A decision the code no longer follows shows up in /twiceshy:status, so it gets updated instead of silently ignored.
`,
	fr: (date) => `# 0001. Consigner les décisions d'architecture

Date : ${date}
Statut : Acceptée

## Contexte

Des agents écrivent une part croissante de ce code. Ils commencent chaque session sans savoir pourquoi le code est comme il est, et prennent des décisions (une nouvelle dépendance, une nouvelle structure) que personne n'écrit.

## Décision

Nous consignons les décisions d'architecture dans ce dossier, un fichier par décision, d'après 0000-template.md. Twice Shy vérifie que le code les suit, et demande à l'agent d'en écrire une quand il ajoute une dépendance.

## Alternatives envisagées

Des commentaires dans le code, ou un wiki : ni l'un ni l'autre n'est lu par les agents ni comparé au code.

## Conséquences

Chaque décision a une raison lisible par tous. Une décision que le code ne suit plus apparaît dans /twiceshy:status : on la met à jour au lieu de l'ignorer sans le dire.
`,
};

function adr(cwd, action) {
	const root = rootOf(cwd);
	const existing = adrDir(root);
	if (action === "init") {
		if (existing) return log(dim(t("adrExisting", { dir: existing })));
		const dir = "docs/adr";
		mkdirSync(join(root, dir), { recursive: true });
		const template = join(root, dir, "0000-template.md");
		if (!existsSync(template)) writeFileSync(template, TEMPLATE[LANG]);
		writeFileSync(join(root, dir, LANG === "fr" ? "0001-consigner-les-decisions.md" : "0001-record-architecture-decisions.md"), FIRST[LANG](new Date().toISOString().slice(0, 10)));
		return log(green(t("adrInit", { dir })));
	}
	if (!existing) return log(dim(t("adrNone")));
	const files = adrFiles(root);
	log(bold(t("adrStatus", { count: files.length, dir: existing })));
	for (const file of files) log(`  ${file}`);
	const stale = readRules(root)?.stale ?? [];
	for (const rule of stale) log(yellow(`! ${rule.text} · ${t("stale")}${rule.source?.ref ? " · " + t("fromRef", { ref: rule.source.ref }) : ""}`));
}

const [command, ...rest] = process.argv.slice(2);

try {
	switch (command) {
		case "learn":
			await learn(rest[0] ?? process.cwd());
			break;
		case "check":
			await check(rest[0] ?? process.cwd());
			break;
		case "status":
			await status(rest[0] ?? process.cwd());
			break;
		case "adr":
			adr(rest[1] ?? process.cwd(), rest[0]);
			break;
		case "hook":
			await stopHook();
			break;
		default:
			process.stdout.write(HELP);
	}
} catch (error) {
	// Un hook qui plante ne doit jamais bloquer l'agent : il se tait.
	if (command === "hook") process.exit(0);
	console.error(red(error.message));
	process.exitCode = 1;
}
