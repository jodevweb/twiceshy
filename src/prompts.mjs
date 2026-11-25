// Ce que Twice Shy demande au modèle, et la forme exacte des réponses.
//
// Les questions sont en anglais (le modèle y est le plus précis) ; les textes
// qu'il rédige pour l'humain ou pour l'agent sont dans la langue de l'utilisateur.

import { LANG_NAME } from "./i18n.mjs";

const replyIn = `Write every human-readable field (rule text, why, notes, hints) in ${LANG_NAME}.`;

const RULE = {
	type: "object",
	properties: {
		text: { type: "string", description: "The rule, one sentence, checkable on a diff." },
		scope: { type: "array", items: { type: "string" }, description: "Path prefixes it applies to; empty = whole repo." },
		why: { type: "string", description: "The kind of bug it prevents, from this repository's history." },
	},
	required: ["text", "scope", "why"],
};

export const PROPOSE_SCHEMA = {
	type: "object",
	properties: { rules: { type: "array", items: RULE } },
	required: ["rules"],
};

/** Proposer des règles à partir des anciens correctifs. */
export function proposePrompt(fixes) {
	const listing = fixes.map((fix) => `### ${fix.subject} (${fix.date})\n\n\`\`\`diff\n${fix.diff}\n\`\`\``).join("\n\n");
	return `You are looking at a software repository (you can read it with Read, Grep and Glob) and at bug fixes it actually needed. Each fix shows the faulty code (removed lines) and how it was repaired.

Your job: write up to 8 **rules** for this codebase, so that a reviewer reading a future diff can stop the same kinds of bugs from coming back. The rules will be tested on *future* bugs, not on these ones: a rule that only describes one past fix will catch nothing.

A good rule:
- targets a **class** of bug that this codebase is prone to (seen in two fixes or more, or clearly likely to recur given how the code is built), not one specific past incident;
- states one idea, in one short sentence (35 words at most), so a reviewer can apply it in seconds;
- is grounded in this codebase: refer to its real conventions, types or helpers where it helps, but do not tie it to a single function;
- can be checked by reading a diff, without running anything;
- is not something a compiler, linter or the existing tests already catch;
- does not flag healthy code.

Prefer fewer, sharper rules over many. If the fixes share no recurring class, return fewer rules.

Scope each rule to the directories where the bug class lives, as path prefixes relative to the repository root (empty array if it applies everywhere).

${replyIn}

## Past bug fixes

${listing}`;
}

const CALIBRATION_ITEM = {
	type: "object",
	properties: {
		rule: { type: "integer" },
		caughtBefore: { type: "boolean", description: "Would the rule clearly flag the code BEFORE the fix?" },
		flagsAfter: { type: "boolean", description: "Would the rule still flag the code AFTER the fix?" },
		note: { type: "string" },
	},
	required: ["rule", "caughtBefore", "flagsAfter", "note"],
};

export const CALIBRATION_SCHEMA = {
	type: "object",
	properties: { verdicts: { type: "array", items: CALIBRATION_ITEM } },
	required: ["verdicts"],
};

/**
 * Tester des règles sur un correctif qu'elles n'ont pas vu.
 *
 * La question est posée dans les deux sens. Avant le correctif, le code était
 * fautif : la règle l'aurait-elle signalé ? Après, il est sain : la règle le
 * signalerait-elle quand même ? La première mesure ce que la règle détecte, la
 * seconde ce qu'elle coûte en fausses alertes.
 */
export function calibrationPrompt(rules, fix) {
	const list = rules.map((rule, index) => `${index}. ${rule.text}${rule.scope?.length ? ` (scope: ${rule.scope.join(", ")})` : ""}`).join("\n");
	return `Here is a real bug fix from this repository. The code before it was faulty; the code after it is considered correct.

For each rule below, answer two questions:
1. caughtBefore: applied to the code BEFORE the fix (the removed lines and their context), would a strict reviewer using this rule have flagged the actual bug that this fix repairs? Answer true only if the rule clearly targets what was wrong. A rule that "might have drawn attention" or flags something unrelated in the same diff does not count: false.
2. flagsAfter: applied to the code AFTER the fix, would the rule still flag it? true means a false alarm on healthy code.

If a rule's scope does not cover the files of this fix, both answers are false.

Keep each note to one short sentence. ${replyIn}

## Rules

${list}

## The fix: ${fix.subject}

\`\`\`diff
${fix.diff}
\`\`\``;
}

export const REWRITE_SCHEMA = {
	type: "object",
	properties: {
		rules: {
			type: "array",
			items: { ...RULE, properties: { ...RULE.properties, index: { type: "integer" } }, required: [...RULE.required, "index"] },
		},
	},
	required: ["rules"],
};

/** Réécrire les règles qui ne détectent rien ou qui crient au loup. */
export function rewritePrompt(weak, fixes) {
	const list = weak
		.map(
			(entry) =>
				`${entry.index}. ${entry.rule.text}\n   Measured on recent bugs it had never seen: caught ${entry.caught} of ${entry.tried}, ${entry.falseAlarms} false alarm(s) on healthy code.`,
		)
		.join("\n");
	const listing = fixes.map((fix) => `### ${fix.subject}\n\n\`\`\`diff\n${fix.diff}\n\`\`\``).join("\n\n");
	return `These rules were written from this repository's past bug fixes, then tested on more recent bugs they had never seen. They performed badly: they either caught nothing or flagged healthy code.

Rewrite each one so it catches the class of bug it was meant for, more precisely:
- caught nothing: it is probably too specific to one past fix, or too vague to apply. Aim at the underlying cause, named with this codebase's real functions and conventions.
- false alarms: narrow it so correct code does not break it.

Each rule states one idea in one short sentence (35 words at most) and targets a class of bug, not one past incident.

Keep the same index for each rule. You can read the repository with Read, Grep and Glob. ${replyIn}

## Rules to rewrite

${list}

## Past bug fixes they come from

${listing}`;
}

const CHECK_ITEM = {
	type: "object",
	properties: {
		rule: { type: "integer" },
		broken: { type: "boolean" },
		evidence: { type: "string", description: "file:line and the offending code, if broken." },
		hint: { type: "string", description: "How to fix it, one sentence, if broken." },
	},
	required: ["rule", "broken", "evidence", "hint"],
};

export const CHECK_SCHEMA = {
	type: "object",
	properties: { verdicts: { type: "array", items: CHECK_ITEM } },
	required: ["verdicts"],
};

/** Vérifier le travail en cours de l'agent contre les règles du projet. */
export function checkPrompt(rules, diff) {
	const list = rules.map((rule, index) => `${index}. ${rule.text}`).join("\n");
	return `A coding agent just made the change below in this repository. Check it against the project's rules.

A rule is broken only if the **added or modified lines** clearly violate it. Untouched code around the change does not count, and neither does a vague risk. Be strict about the rule and fair to the code: a false alarm sends the agent back for nothing.

For each broken rule, give the evidence as file:line with the offending code, and one sentence on how to fix it. Leave evidence and hint empty when the rule holds. ${replyIn}

## Rules

${list}

## The change

\`\`\`diff
${diff}
\`\`\``;
}

export const CLASSIFY_SCHEMA = {
	type: "object",
	properties: { fixes: { type: "array", items: { type: "integer" } } },
	required: ["fixes"],
};

/**
 * Désigner les commits qui réparent un bug, d'après leur sujet.
 *
 * On ne veut que des bugs : un défaut du code, visible par un utilisateur ou un
 * test. Pas un refactoring, pas une retouche de style, pas un ajout.
 */
export function classifyPrompt(commits) {
	const list = commits
		.map((commit, index) => `${index}. ${commit.subject}${commit.body ? ` — ${commit.body.split("\n")[0].slice(0, 120)}` : ""}`)
		.join("\n");
	return `Below are commit messages from a software repository, in any language. Return the indexes of the commits that repair a bug: code that behaved wrongly (crash, wrong result, wrong display, race, data loss, regression) and is now corrected.

Do not include features, refactors, renames, formatting, lint or type-checker fixes, typos, dependency or version bumps, build or packaging config, docs, changelog, tests-only changes, flaky-test workarounds, releases, or reverts of a feature. When unsure, leave it out.

${list}`;
}
