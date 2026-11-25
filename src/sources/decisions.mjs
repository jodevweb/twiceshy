// Source : tes décisions écrites.
//
// Les ADR, les consignes laissées aux agents (CLAUDE.md, AGENTS.md…), et tout
// document que le dépôt déclare dans `.twiceshy/config.json` :
// `"documents": ["docs/conventions.md", "CONTRIBUTING.md"]`. Une équipe qui
// range ses règles ailleurs n'a pas à attendre que Twice Shy connaisse son
// dossier.

import { readDecisions } from "../decisions.mjs";
import { t } from "../i18n.mjs";
import { DECISION_RULES_SCHEMA, decisionRulesPrompt } from "../prompts.mjs";

export default {
	id: "decisions",
	policy: "documented",
	title: () => t("sectionDecisions"),
	label: () => t("labelDecisions"),
	async collect({ root, config, model, ask }) {
		const docs = readDecisions(root, config.documents ?? []);
		if (docs.length === 0) return { notes: [t("noDecisions")], rules: [] };
		const notes = [t("decisionsRead", { list: docs.map((d) => d.path).join(", ") })];
		const data = await ask({
			prompt: decisionRulesPrompt(docs),
			schema: DECISION_RULES_SCHEMA,
			cwd: root,
			model,
			tools: "Read,Grep,Glob",
			timeoutMs: 10 * 60_000,
		});
		const rules = (data.rules ?? []).slice(0, 8).map(({ ref, ...rule }) => ({ ...rule, origin: { ref: String(ref ?? "").slice(0, 120) } }));
		return { notes, rules };
	},
};
