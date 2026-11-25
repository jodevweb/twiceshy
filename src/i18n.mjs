// Les textes de Twice Shy, en français et en anglais.
//
// La langue vient de `TWICESHY_LANG`, sinon de celle du système. Sous Windows,
// `LANG` est rarement posée : c'est `Intl` qui connaît la langue de la session.

const TEXTS = {
	en: {
		notRepo: "Not a git repository.",
		noHead: "This repository has no commit yet: nothing to learn from.",
		scanning: "Reading the history",
		foundFixes: "{count} bug fixes found among {scan} commits that touch code",
		notEnoughFixes:
			"Only {count} bug fixes found. Twice Shy needs at least 2 to learn something. Gates (tests, lint) still run on every stop.",
		leaked:
			"Few fixes: rules are tested on the same bugs they were learned from. Scores will be optimistic.",
		split: "{learn} older fixes to learn from, {test} recent ones to test the rules on",
		proposing: "Writing rules from the older fixes",
		proposed: "{count} rules proposed",
		testing: "Testing {count} rules on {fixes} recent bugs they never saw and {healthy} recent healthy commits",
		rewriting: "Rewriting {count} rules that missed or raised false alarms",
		kept: "kept",
		dropped: "dropped",
		caught: "would have caught {caught} of {tried} bugs",
		falseAlarms: "{count} false alarm(s)",
		summary: "On your last {tried} bug fixes, these rules would have caught {caught}.",
		summaryNone: "No rule passed the test. Nothing was kept; checks still run on every stop.",
		saved: "Saved to {path}",
		cost: "Cost of this run: ${cost} (informative, included in a Claude subscription)",
		gatesFound: "Checks run on every stop: {list}",
		gatesNone: "No test or lint command detected. Add some in .twiceshy/config.json (\"gates\").",
		duration: "Done in {seconds}s",
		status: "Twice Shy on {repo}",
		statusNoRules: "No rules yet. Run /twiceshy:learn.",
		statusLearned: "Learned on {date} from {fixes} bug fixes, model {model}.",
		sessionsRead: "{count} of your messages read in {sessions} past Claude Code session(s)",
		noSessions: "No past Claude Code session for this project",
		correctionsFound: "{count} of them corrected the agent",
		decisionsRead: "Decisions read: {list}",
		noDecisions: "No ADR and no agent instructions (CLAUDE.md, AGENTS.md)",
		writingRules: "Writing rules from your bugs, your corrections and your decisions",
		rulesBySource: "{bugs} from bugs, {corrections} from corrections, {decisions} from decisions",
		sectionBugs: "From your past bugs",
		labelBugs: "from your past bugs",
		labelCorrections: "from your corrections",
		labelDecisions: "from your written decisions",
		sectionCorrections: "From your corrections to agents",
		sectionDecisions: "From your written decisions (ADR, CLAUDE.md…)",
		correctedTimes: "you asked for this {count} time(s)",
		fromRef: "from {ref}",
		stale: "not enforced",
		staleDecision: "{flags} of the last {tried} commits don't follow it",
		staleSummary:
			"{count} written decision(s) are no longer followed by the code. Update or supersede them: until then they are not enforced.",
		summaryAll: "{rules} rule(s) checked on every stop: {list}.",
		adrHint: "No ADR folder. Run /twiceshy:adr to start one: agents will then record why they add a dependency.",
		depsTitle: "New dependency without a decision record: {list}",
		depsAsk:
			"Write an ADR at {path} (Context, Decision, Alternatives considered, Consequences): why {list}, and why not what the project already uses for the same need. Keep it short.",
		adrInit: "ADR folder ready: {dir}",
		adrExisting: "ADR folder already there: {dir}",
		adrStatus: "{count} ADR(s) in {dir}",
		adrNone: "No ADR folder. Run /twiceshy:adr to create one.",
		blockedTitle: "Twice Shy: your work is not finished.",
		blockedIntro:
			"Before stopping, fix what follows. These checks run on the real code, not on what you report.",
		gateFailed: "Check failed: `{command}` (exit code {code})",
		gateTimeout: "Check timed out after {seconds}s: `{command}`",
		ruleBroken: "Project rule broken: {text}",
		ruleWhy: "Why this rule exists: {why}",
		fixHint: "How to fix: {hint}",
		blockedOutro: "Fix these, run the checks yourself, then stop again. Do not weaken tests or rules to make them pass.",
		passed: "Twice Shy · {gates} check(s), {rules} rule(s) · all good",
		passedNothing: "Twice Shy · nothing to check",
		giveUp:
			"Twice Shy · still failing after {count} attempts. Stopping here so you can take a look: {problems}",
		judgeFailed: "Twice Shy · the rule judge did not answer ({error}); rules were not checked this time.",
	},
	fr: {
		notRepo: "Ce dossier n'est pas un dépôt git.",
		noHead: "Ce dépôt n'a encore aucun commit : rien à apprendre.",
		scanning: "Lecture de l'historique",
		foundFixes: "{count} correctifs de bugs trouvés parmi {scan} commits qui touchent du code",
		notEnoughFixes:
			"Seulement {count} correctif(s) trouvé(s). Twice Shy en a besoin d'au moins 2 pour apprendre. Les vérifications (tests, lint) tournent quand même à chaque arrêt.",
		leaked:
			"Peu de correctifs : les règles sont testées sur les bugs dont elles viennent. Les scores seront trop optimistes.",
		split: "{learn} correctifs anciens pour apprendre, {test} récents pour tester les règles",
		proposing: "Écriture des règles à partir des anciens correctifs",
		proposed: "{count} règles proposées",
		testing: "Test des {count} règles sur {fixes} bugs récents jamais vus et {healthy} commits récents sains",
		rewriting: "Réécriture de {count} règle(s) qui ratai(en)t des bugs ou donnai(en)t de fausses alertes",
		kept: "gardée",
		dropped: "supprimée",
		caught: "aurait détecté {caught} bug(s) sur {tried}",
		falseAlarms: "{count} fausse(s) alerte(s)",
		summary: "Sur tes {tried} derniers bugs corrigés, ces règles en auraient détecté {caught}.",
		summaryNone: "Aucune règle n'a passé l'examen. Rien n'a été gardé ; les vérifications tournent quand même à chaque arrêt.",
		saved: "Enregistré dans {path}",
		cost: "Coût de ce passage : {cost} $ (indicatif, compris dans un abonnement Claude)",
		gatesFound: "Vérifications lancées à chaque arrêt : {list}",
		gatesNone: "Aucune commande de test ou de lint détectée. Ajoute-les dans .twiceshy/config.json (\"gates\").",
		duration: "Terminé en {seconds} s",
		status: "Twice Shy sur {repo}",
		statusNoRules: "Pas encore de règles. Lance /twiceshy:learn.",
		statusLearned: "Appris le {date} sur {fixes} correctifs, modèle {model}.",
		sessionsRead: "{count} de tes messages lus dans {sessions} session(s) Claude Code passée(s)",
		noSessions: "Aucune session Claude Code passée sur ce projet",
		correctionsFound: "dont {count} corrigeaient l'agent",
		decisionsRead: "Décisions lues : {list}",
		noDecisions: "Ni ADR ni consignes aux agents (CLAUDE.md, AGENTS.md)",
		writingRules: "Écriture des règles à partir de tes bugs, de tes corrections et de tes décisions",
		rulesBySource: "{bugs} tirées des bugs, {corrections} des corrections, {decisions} des décisions",
		sectionBugs: "Tirées de tes bugs passés",
		labelBugs: "tirées de tes bugs",
		labelCorrections: "de tes corrections",
		labelDecisions: "de tes décisions écrites",
		sectionCorrections: "Tirées de tes corrections aux agents",
		sectionDecisions: "Tirées de tes décisions écrites (ADR, CLAUDE.md…)",
		correctedTimes: "tu l'as demandé {count} fois",
		fromRef: "vient de {ref}",
		stale: "pas imposée",
		staleDecision: "{flags} des {tried} derniers commits ne la suivent pas",
		staleSummary:
			"{count} décision(s) écrite(s) ne sont plus suivies par le code. Mets-les à jour ou remplace-les : d'ici là, elles ne sont pas imposées.",
		summaryAll: "{rules} règle(s) vérifiée(s) à chaque arrêt : {list}.",
		adrHint: "Pas de dossier d'ADR. Lance /twiceshy:adr pour en créer un : les agents devront alors expliquer pourquoi ils ajoutent une dépendance.",
		depsTitle: "Nouvelle dépendance sans décision écrite : {list}",
		depsAsk:
			"Écris un ADR dans {path} (Contexte, Décision, Alternatives envisagées, Conséquences) : pourquoi {list}, et pourquoi pas ce que le projet utilise déjà pour le même besoin. Reste court.",
		adrInit: "Dossier d'ADR prêt : {dir}",
		adrExisting: "Le dossier d'ADR existe déjà : {dir}",
		adrStatus: "{count} ADR dans {dir}",
		adrNone: "Pas de dossier d'ADR. Lance /twiceshy:adr pour en créer un.",
		blockedTitle: "Twice Shy : ton travail n'est pas terminé.",
		blockedIntro:
			"Avant de t'arrêter, corrige ce qui suit. Ces vérifications portent sur le vrai code, pas sur ce que tu annonces.",
		gateFailed: "Vérification en échec : `{command}` (code de sortie {code})",
		gateTimeout: "Vérification trop longue, arrêtée après {seconds} s : `{command}`",
		ruleBroken: "Règle du projet non respectée : {text}",
		ruleWhy: "Pourquoi cette règle existe : {why}",
		fixHint: "Comment corriger : {hint}",
		blockedOutro:
			"Corrige, relance toi-même les vérifications, puis arrête-toi à nouveau. N'affaiblis ni les tests ni les règles pour les faire passer.",
		passed: "Twice Shy · {gates} vérification(s), {rules} règle(s) · rien à signaler",
		passedNothing: "Twice Shy · rien à vérifier",
		giveUp:
			"Twice Shy · toujours en échec après {count} essai(s). Je laisse l'agent s'arrêter pour que tu regardes : {problems}",
		judgeFailed: "Twice Shy · le juge des règles n'a pas répondu ({error}) ; les règles n'ont pas été vérifiées cette fois.",
	},
};

function detect() {
	const forced = (process.env.TWICESHY_LANG ?? "").toLowerCase();
	if (forced.startsWith("fr")) return "fr";
	if (forced.startsWith("en")) return "en";
	const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
	if (env && !/^(c|posix)(\.|$)/i.test(env)) return env.toLowerCase().startsWith("fr") ? "fr" : "en";
	try {
		return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("fr") ? "fr" : "en";
	} catch {
		return "en";
	}
}

export const LANG = detect();

/** Le nom de la langue, pour demander au modèle de répondre dedans. */
export const LANG_NAME = LANG === "fr" ? "French" : "English";

export function t(key, vars = {}) {
	const text = TEXTS[LANG][key] ?? TEXTS.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}
