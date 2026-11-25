// Source : les bugs que le dépôt a déjà corrigés.
//
// Les règles viennent des correctifs anciens, et l'examen se fait sur les
// récents : une règle n'est jamais notée sur le bug dont elle vient.

import { t } from "../i18n.mjs";
import { PROPOSE_SCHEMA, proposePrompt } from "../prompts.mjs";

export default {
	id: "bugs",
	policy: "proven",
	title: () => t("sectionBugs"),
	label: () => t("labelBugs"),
	async collect({ root, model, ask, history }) {
		const notes = [t("foundFixes", { count: history.fixes.length, scan: history.scanned })];
		if (history.learning.length < 2) return { notes, rules: [] };
		const data = await ask({
			prompt: proposePrompt(history.learning),
			schema: PROPOSE_SCHEMA,
			cwd: root,
			model,
			tools: "Read,Grep,Glob",
			timeoutMs: 10 * 60_000,
		});
		return { notes, rules: (data.rules ?? []).slice(0, 8) };
	},
};
