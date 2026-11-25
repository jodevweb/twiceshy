#!/usr/bin/env node
// Twice Shy : once bitten, twice shy.
//
//   twiceshy learn    apprendre des bugs déjà corrigés du dépôt
//   twiceshy check    vérifier le travail en cours, comme le ferait le hook
//   twiceshy status   ce que Twice Shy sait de ce dépôt
//   twiceshy hook     le hook `Stop` de Claude Code (lit son JSON sur l'entrée standard)

import { learn } from "../src/learn.mjs";
import { agentReport, checkRepo, failed } from "../src/check.mjs";
import { stopHook } from "../src/hook.mjs";
import { repoRoot } from "../src/git.mjs";
import { gatesFor } from "../src/gates.mjs";
import { t } from "../src/i18n.mjs";
import { readConfig, readRules } from "../src/store.mjs";
import { bold, dim, green, log, red, step } from "../src/term.mjs";

const HELP = `Twice Shy · once bitten, twice shy

  twiceshy learn    learn from the bugs this repository already fixed
  twiceshy check    check the current changes, like the Stop hook does
  twiceshy status   what Twice Shy knows about this repository
  twiceshy hook     Claude Code Stop hook (reads its JSON on stdin)
`;

async function status(cwd) {
	const root = repoRoot(cwd);
	if (!root) throw new Error(t("notRepo"));
	const learned = readRules(root);
	log(bold(t("status", { repo: root.replace(/\\/g, "/").split("/").pop() })));
	log();
	if (!learned?.rules?.length) log(dim(t("statusNoRules")));
	else {
		log(dim(t("statusLearned", { date: learned.learnedAt.slice(0, 10), fixes: learned.fixesScanned, model: learned.model })));
		log(green(t("summary", { tried: learned.testedOn, caught: learned.caught })));
		log();
		for (const rule of learned.rules) {
			log(`${green("✓")} ${bold(rule.text)}`);
			log(dim(`  ${t("caught", { caught: rule.score.caught, tried: rule.score.tried })}${rule.scope.length ? " · " + rule.scope.join(", ") : ""}`));
		}
	}
	log();
	const gates = gatesFor(root, readConfig(root));
	log(dim(gates.length ? t("gatesFound", { list: gates.join(" · ") }) : t("gatesNone")));
}

async function check(cwd) {
	const root = repoRoot(cwd);
	if (!root) throw new Error(t("notRepo"));
	let done = null;
	const result = await checkRepo(root, {
		onProgress: (what) => {
			done?.();
			done = step(what === "rules" ? "rules" : what);
		},
	});
	done?.();
	if (result.skipped) return log(dim(t("passedNothing")));
	if (result.judgeError) log(red(t("judgeFailed", { error: result.judgeError })));
	if (!failed(result)) return log(green(t("passed", { gates: result.gates.length, rules: result.rulesChecked })));
	log(agentReport(result));
	process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
const cwd = rest[0] ?? process.cwd();

try {
	switch (command) {
		case "learn":
			await learn(cwd);
			break;
		case "check":
			await check(cwd);
			break;
		case "status":
			await status(cwd);
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
